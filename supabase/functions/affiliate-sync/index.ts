// Affiliate integration manager. JWT verified at the gateway; the function
// then enforces workspace owner/admin before touching keys or integrations.
//
// Actions (POST body):
//   { action: "create_api_key", workspace_id, name, scopes? }
//       → generates a `gfa_` API key, stores only its SHA-256 hash, returns
//         the plaintext ONCE.
//   { action: "test", workspace_id, provider }
//       → verifies the stored provider credentials by calling the provider.
//   { action: "sync", workspace_id, provider }
//       → pulls partners (and transactions where the provider exposes them)
//         and upserts them into the local affiliate tables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "gfa_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Provider adapters. Each returns raw partner/transaction rows in a common
// shape so the sync loop below stays provider-agnostic.
// ---------------------------------------------------------------------------
interface RemotePartner {
  external_id: string;
  name: string;
  email: string | null;
  referral_code: string | null;
}
interface RemoteTransaction {
  external_id: string;
  partner_external_id: string | null;
  basis_amount: number | null;
  amount: number | null;
  currency: string;
  occurred_on: string | null;
  description: string;
}

type Integration = {
  id: string;
  workspace_id: string;
  provider: string;
  api_key: string | null;
  api_base: string | null;
  program_id: string | null;
};

function asArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.partners)) return payload.partners;
  if (Array.isArray(payload?.promoters)) return payload.promoters;
  return [];
}

async function providerFetch(url: string, headers: Record<string, string>): Promise<any> {
  const resp = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`${url.split("?")[0]} responded ${resp.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return resp.json();
}

const adapters: Record<
  string,
  {
    test: (i: Integration) => Promise<string>;
    partners: (i: Integration) => Promise<RemotePartner[]>;
    transactions: (i: Integration) => Promise<RemoteTransaction[]>;
  }
> = {
  partnero: {
    async test(i) {
      const base = i.api_base || "https://api.partnero.com/v1";
      await providerFetch(`${base}/partners?limit=1`, { Authorization: `Bearer ${i.api_key}` });
      return "Connected to Partnero";
    },
    async partners(i) {
      const base = i.api_base || "https://api.partnero.com/v1";
      const rows = asArray(await providerFetch(`${base}/partners?limit=100`, { Authorization: `Bearer ${i.api_key}` }));
      return rows.map((p: any) => ({
        external_id: String(p.id ?? p.key ?? ""),
        name: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ?? p.email ?? "Unknown partner",
        email: p.email ?? null,
        referral_code: p.key ?? p.referral_code ?? p.code ?? null,
      })).filter((p: RemotePartner) => p.external_id);
    },
    async transactions(i) {
      const base = i.api_base || "https://api.partnero.com/v1";
      let rows: any[] = [];
      try {
        rows = asArray(await providerFetch(`${base}/transactions?limit=100`, { Authorization: `Bearer ${i.api_key}` }));
      } catch {
        return []; // transactions endpoint not available on all plans — partners still sync
      }
      return rows.map((t: any) => ({
        external_id: String(t.id ?? ""),
        partner_external_id: String(t.partner?.id ?? t.partner_id ?? "") || null,
        basis_amount: t.amount != null ? Number(t.amount) : null,
        amount: t.commission != null ? Number(t.commission) : (t.reward != null ? Number(t.reward) : null),
        currency: String(t.currency ?? "USD").toUpperCase(),
        occurred_on: t.created_at ? String(t.created_at).slice(0, 10) : null,
        description: `Partnero transaction${t.key ? ` ${t.key}` : ""}`,
      })).filter((t: RemoteTransaction) => t.external_id);
    },
  },
  rewardful: {
    async test(i) {
      const auth = "Basic " + btoa(`${i.api_key}:`);
      await providerFetch("https://api.getrewardful.com/v1/affiliates?limit=1", { Authorization: auth });
      return "Connected to Rewardful";
    },
    async partners(i) {
      const auth = "Basic " + btoa(`${i.api_key}:`);
      const rows = asArray(await providerFetch("https://api.getrewardful.com/v1/affiliates?limit=100", { Authorization: auth }));
      return rows.map((p: any) => ({
        external_id: String(p.id ?? ""),
        name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown partner",
        email: p.email ?? null,
        referral_code: p.links?.[0]?.token ?? null,
      })).filter((p: RemotePartner) => p.external_id);
    },
    async transactions() {
      return []; // commissions arrive via webhooks for Rewardful
    },
  },
  firstpromoter: {
    async test(i) {
      await providerFetch("https://firstpromoter.com/api/v1/promoters/list?limit=1", { "x-api-key": i.api_key ?? "" });
      return "Connected to FirstPromoter";
    },
    async partners(i) {
      const rows = asArray(await providerFetch("https://firstpromoter.com/api/v1/promoters/list?limit=100", { "x-api-key": i.api_key ?? "" }));
      return rows.map((p: any) => ({
        external_id: String(p.id ?? ""),
        name: p.profile?.first_name || p.profile?.last_name
          ? [p.profile?.first_name, p.profile?.last_name].filter(Boolean).join(" ").trim()
          : (p.email ?? "Unknown partner"),
        email: p.email ?? null,
        referral_code: p.default_ref_id ?? p.promotions?.[0]?.ref_id ?? null,
      })).filter((p: RemotePartner) => p.external_id);
    },
    async transactions() {
      return []; // commissions arrive via webhooks for FirstPromoter
    },
  },
  custom: {
    async test(i) {
      if (!i.api_base) throw new Error("Custom providers need an API base URL");
      const resp = await fetch(i.api_base, {
        headers: i.api_key ? { Authorization: `Bearer ${i.api_key}` } : {},
      });
      if (!resp.ok && resp.status >= 500) throw new Error(`Endpoint responded ${resp.status}`);
      return `Endpoint reachable (${resp.status})`;
    },
    async partners() {
      return []; // custom providers integrate via the public affiliate-api instead
    },
    async transactions() {
      return [];
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action ?? "");
    const workspaceId = String(body.workspace_id ?? "");
    if (!workspaceId) return json({ error: "workspace_id is required" }, 400);

    // Owner/admin (or super admin) gate — API keys and provider credentials
    // are workspace-critical secrets.
    const { data: role } = await admin.rpc("workspace_role_of", {
      _user_id: user.id,
      _workspace_id: workspaceId,
    });
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper && role !== "owner" && role !== "admin") {
      return json({ error: "Requires workspace owner or admin" }, 403);
    }

    // ---- create_api_key -----------------------------------------------------
    if (action === "create_api_key") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "name is required" }, 400);
      const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length
        ? body.scopes.filter((s: unknown) => s === "read" || s === "write")
        : ["read", "write"];

      const key = randomKey();
      const { data, error } = await admin
        .from("affiliate_api_keys")
        .insert({
          workspace_id: workspaceId,
          name,
          key_prefix: key.slice(0, 12),
          key_hash: await sha256Hex(key),
          scopes,
          created_by: user.id,
        })
        .select("id, name, key_prefix, scopes, created_at")
        .single();
      if (error) throw error;

      await admin.from("affiliate_events").insert({
        workspace_id: workspaceId,
        source: "app",
        event_type: "api_key.created",
        payload: { id: data.id, name, scopes },
      });
      // The only moment the plaintext key exists outside the caller's browser.
      return json({ data: { ...data, key } }, 201);
    }

    // ---- test / sync --------------------------------------------------------
    if (action === "test" || action === "sync") {
      const provider = String(body.provider ?? "");
      const adapter = adapters[provider];
      if (!adapter) return json({ error: `Unknown provider "${provider}"` }, 400);

      const { data: integration } = await admin
        .from("affiliate_integrations")
        .select("id, workspace_id, provider, api_key, api_base, program_id")
        .eq("workspace_id", workspaceId)
        .eq("provider", provider)
        .maybeSingle();
      if (!integration) return json({ error: "Integration not configured" }, 404);
      if (provider !== "custom" && !integration.api_key) return json({ error: "No API key saved for this provider" }, 400);

      if (action === "test") {
        try {
          const message = await adapter.test(integration as Integration);
          await admin
            .from("affiliate_integrations")
            .update({ last_sync_status: "ok", last_error: null })
            .eq("id", integration.id);
          return json({ ok: true, message });
        } catch (err) {
          const message = String((err as Error).message ?? err);
          await admin
            .from("affiliate_integrations")
            .update({ last_sync_status: "error", last_error: message })
            .eq("id", integration.id);
          return json({ ok: false, message }, 200);
        }
      }

      // action === "sync"
      try {
        const remotePartners = await adapter.partners(integration as Integration);
        let partnersUpserted = 0;
        const partnerIdByExternal = new Map<string, string>();

        for (const rp of remotePartners) {
          const { data: existing } = await admin
            .from("affiliate_partners")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("external_provider", provider)
            .eq("external_id", rp.external_id)
            .maybeSingle();

          const fields: Record<string, unknown> = {
            name: rp.name,
            email: rp.email,
            external_provider: provider,
            external_id: rp.external_id,
          };
          if (rp.referral_code) fields.referral_code = rp.referral_code;

          if (existing) {
            const { error } = await admin.from("affiliate_partners").update(fields).eq("id", (existing as any).id);
            if (error && fields.referral_code) {
              // Referral code collides with another partner — keep the local code.
              delete fields.referral_code;
              await admin.from("affiliate_partners").update(fields).eq("id", (existing as any).id);
            }
            partnerIdByExternal.set(rp.external_id, (existing as any).id);
          } else {
            let { data: inserted, error } = await admin
              .from("affiliate_partners")
              .insert({ workspace_id: workspaceId, ...fields })
              .select("id")
              .single();
            if (error && fields.referral_code) {
              delete fields.referral_code; // let the DB default generate a unique one
              ({ data: inserted, error } = await admin
                .from("affiliate_partners")
                .insert({ workspace_id: workspaceId, ...fields })
                .select("id")
                .single());
            }
            if (error) throw error;
            partnerIdByExternal.set(rp.external_id, inserted!.id);
          }
          partnersUpserted++;
        }

        const remoteTx = await adapter.transactions(integration as Integration);
        let commissionsUpserted = 0;
        for (const tx of remoteTx) {
          const partnerId = tx.partner_external_id ? partnerIdByExternal.get(tx.partner_external_id) : null;
          if (!partnerId) continue;
          const row: Record<string, unknown> = {
            partner_id: partnerId,
            description: tx.description,
            basis_amount: tx.basis_amount,
            amount: tx.amount ?? tx.basis_amount ?? 0,
            currency: tx.currency,
            external_id: tx.external_id,
          };
          if (tx.occurred_on) row.occurred_on = tx.occurred_on;
          const { data: existing } = await admin
            .from("affiliate_commissions")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("external_id", tx.external_id)
            .maybeSingle();
          if (existing) {
            await admin.from("affiliate_commissions").update(row).eq("id", (existing as any).id);
          } else {
            await admin.from("affiliate_commissions").insert({ workspace_id: workspaceId, status: "pending", ...row });
          }
          commissionsUpserted++;
        }

        await admin
          .from("affiliate_integrations")
          .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok", last_error: null })
          .eq("id", integration.id);
        await admin.from("affiliate_events").insert({
          workspace_id: workspaceId,
          source: "sync",
          provider,
          event_type: "sync.completed",
          payload: { partners: partnersUpserted, commissions: commissionsUpserted },
        });
        return json({ ok: true, partners: partnersUpserted, commissions: commissionsUpserted });
      } catch (err) {
        const message = String((err as Error).message ?? err);
        await admin
          .from("affiliate_integrations")
          .update({ last_sync_status: "error", last_error: message })
          .eq("id", integration.id);
        await admin.from("affiliate_events").insert({
          workspace_id: workspaceId,
          source: "sync",
          provider,
          event_type: "sync.failed",
          payload: null,
          status: "error",
          error: message,
        });
        return json({ ok: false, message }, 200);
      }
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    console.error("[affiliate-sync]", err);
    return json({ error: "Internal error" }, 500);
  }
});
