// Public Affiliate/Partner API. No gateway JWT (verify_jwt = false) — callers
// authenticate with a workspace-scoped API key (`gfa_...`, managed in
// Affiliate → API & Integrations). Third parties (Partnero, Rewardful, Zapier,
// custom scripts) use this to read/write partners, referrals and commissions.
//
//   GET    /affiliate-api/v1/partners            list partners
//   POST   /affiliate-api/v1/partners            create partner
//   GET    /affiliate-api/v1/partners/:id        fetch partner
//   PATCH  /affiliate-api/v1/partners/:id        update partner
//   GET    /affiliate-api/v1/referrals           list referrals
//   POST   /affiliate-api/v1/referrals           create referral (idempotent on external_id)
//   PATCH  /affiliate-api/v1/referrals/:id       update referral
//   GET    /affiliate-api/v1/commissions         list commissions
//   POST   /affiliate-api/v1/commissions         create commission (idempotent on external_id)
//   PATCH  /affiliate-api/v1/commissions/:id     update commission
//   GET    /affiliate-api/v1/payouts             list payouts
//   POST   /affiliate-api/v1/webhooks/:provider?token=…   inbound provider webhook
//
// Webhook route is authenticated by the integration's webhook_token (in the
// URL) and, when a webhook_secret is configured, an HMAC-SHA256 signature of
// the raw body in X-Partnero-Signature / X-Signature / X-Webhook-Signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ApiKeyContext {
  workspaceId: string;
  keyId: string;
  scopes: string[];
}

async function authenticateApiKey(req: Request): Promise<ApiKeyContext | null> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const raw = req.headers.get("x-api-key")?.trim() || bearer;
  if (!raw || !raw.startsWith("gfa_")) return null;

  const prefix = raw.slice(0, 12);
  const hash = await sha256Hex(raw);

  const { data: keys } = await admin
    .from("affiliate_api_keys")
    .select("id, workspace_id, key_hash, scopes, enabled, revoked_at")
    .eq("key_prefix", prefix);

  const match = (keys ?? []).find(
    (k: any) => k.enabled && !k.revoked_at && timingSafeEqual(k.key_hash, hash),
  );
  if (!match) return null;

  // Best-effort usage stamp; never block the request on it.
  admin
    .from("affiliate_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", match.id)
    .then(() => {}, () => {});

  return { workspaceId: match.workspace_id, keyId: match.id, scopes: match.scopes ?? [] };
}

async function logEvent(
  workspaceId: string,
  source: string,
  eventType: string,
  payload: unknown,
  status = "processed",
  error: string | null = null,
  provider: string | null = null,
) {
  await admin.from("affiliate_events").insert({
    workspace_id: workspaceId,
    source,
    provider,
    event_type: eventType,
    payload: payload ?? null,
    status,
    error,
  });
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function paging(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

// Resolve a partner from any identifier a third party is likely to have.
async function resolvePartner(
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; commission_type: string; commission_rate: number; flat_amount: number } | null> {
  let q = admin
    .from("affiliate_partners")
    .select("id, commission_type, commission_rate, flat_amount")
    .eq("workspace_id", workspaceId);
  if (typeof body.partner_id === "string" && body.partner_id) q = q.eq("id", body.partner_id);
  else if (typeof body.referral_code === "string" && body.referral_code) q = q.eq("referral_code", body.referral_code);
  else if (typeof body.partner_email === "string" && body.partner_email) q = q.eq("email", body.partner_email);
  else if (typeof body.partner_external_id === "string" && body.partner_external_id) q = q.eq("external_id", body.partner_external_id);
  else return null;
  const { data } = await q.limit(1).maybeSingle();
  return (data as any) ?? null;
}

// client_id crosses into the main clients table — never accept an id that
// belongs to another workspace.
async function validClientId(workspaceId: string, clientId: unknown): Promise<boolean> {
  if (clientId == null) return true;
  const { data } = await admin
    .from("clients")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", clientId)
    .maybeSingle();
  return !!data;
}

function computeCommission(
  partner: { commission_type: string; commission_rate: number; flat_amount: number },
  basis: number | null,
): number | null {
  if (partner.commission_type === "flat") return Number(partner.flat_amount) || 0;
  if (basis == null || Number.isNaN(basis)) return null;
  return Math.round(basis * (Number(partner.commission_rate) / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Inbound provider webhooks
// ---------------------------------------------------------------------------
async function handleWebhook(req: Request, provider: string, url: URL): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  if (!token) return json({ error: "Missing token" }, 401);

  const { data: integration } = await admin
    .from("affiliate_integrations")
    .select("id, workspace_id, provider, webhook_secret, enabled")
    .eq("webhook_token", token)
    .maybeSingle();

  if (!integration || !integration.enabled) return json({ error: "Unknown or disabled integration" }, 401);

  const rawBody = await req.text();

  if (integration.webhook_secret) {
    const given =
      req.headers.get("x-partnero-signature") ??
      req.headers.get("x-signature") ??
      req.headers.get("x-webhook-signature") ??
      "";
    const expected = await hmacSha256Hex(integration.webhook_secret, rawBody);
    // Providers send either the bare hex digest or "sha256=<hex>".
    const normalized = given.replace(/^sha256=/i, "").trim().toLowerCase();
    if (!normalized || !timingSafeEqual(normalized, expected)) {
      await logEvent(integration.workspace_id, "webhook", "signature.invalid", { provider }, "error", "HMAC signature mismatch", provider);
      return json({ error: "Invalid signature" }, 401);
    }
  }

  let payload: Record<string, any> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    await logEvent(integration.workspace_id, "webhook", "payload.invalid", { raw: rawBody.slice(0, 2000) }, "error", "Body is not JSON", provider);
    return json({ error: "Body must be JSON" }, 400);
  }

  const eventType = String(payload.event ?? payload.type ?? payload.event_type ?? "unknown");
  const data: Record<string, any> = payload.data ?? payload.payload ?? payload;
  const wsId = integration.workspace_id;

  try {
    // Partner lifecycle events → upsert a partner mirror.
    if (/partner|affiliate|promoter/i.test(eventType)) {
      const externalId = String(data.id ?? data.partner_id ?? data.key ?? "") || null;
      const email = data.email ?? data.partner_email ?? null;
      const name =
        data.name ||
        [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
        email ||
        "Unknown partner";
      if (externalId || email) {
        const { data: existing } = await admin
          .from("affiliate_partners")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("external_provider", provider)
          .eq("external_id", externalId ?? "")
          .maybeSingle();
        const fields: Record<string, unknown> = {
          name: name || "Unknown partner",
          email,
          external_provider: provider,
          external_id: externalId,
        };
        if (data.key ?? data.referral_code ?? data.code) {
          fields.referral_code = String(data.key ?? data.referral_code ?? data.code);
        }
        if (existing) {
          const { error } = await admin.from("affiliate_partners").update(fields).eq("id", existing.id);
          if (error && fields.referral_code) {
            delete fields.referral_code; // code collides with another partner — keep the local one
            await admin.from("affiliate_partners").update(fields).eq("id", existing.id);
          }
        } else {
          const { error } = await admin.from("affiliate_partners").insert({ workspace_id: wsId, ...fields });
          if (error && fields.referral_code) {
            delete fields.referral_code;
            await admin.from("affiliate_partners").insert({ workspace_id: wsId, ...fields });
          }
        }
      }
    }

    // Sale / transaction / commission events → record a commission (and referral when we can).
    if (/transaction|sale|commission|conversion/i.test(eventType)) {
      const partnerExternal = String(
        data.partner?.id ?? data.partner_id ?? data.affiliate_id ?? data.promoter_id ?? "",
      ) || null;
      let partnerId: string | null = null;
      if (partnerExternal) {
        const { data: p } = await admin
          .from("affiliate_partners")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("external_provider", provider)
          .eq("external_id", partnerExternal)
          .maybeSingle();
        partnerId = (p as any)?.id ?? null;
      }
      if (partnerId) {
        const externalId = String(data.id ?? data.transaction_id ?? "") || null;
        const basis = Number(data.amount ?? data.amount_total ?? data.revenue ?? data.sale_amount ?? NaN);
        const amount = Number(data.commission ?? data.commission_amount ?? data.reward ?? NaN);
        const row: Record<string, unknown> = {
          workspace_id: wsId,
          partner_id: partnerId,
          description: `${provider}: ${eventType}`,
          basis_amount: Number.isNaN(basis) ? null : basis,
          amount: Number.isNaN(amount) ? (Number.isNaN(basis) ? 0 : basis) : amount,
          currency: String(data.currency ?? "USD").toUpperCase(),
          status: "pending",
          external_id: externalId,
        };
        if (externalId) {
          const { data: existing } = await admin
            .from("affiliate_commissions")
            .select("id")
            .eq("workspace_id", wsId)
            .eq("external_id", externalId)
            .maybeSingle();
          if (existing) {
            await admin.from("affiliate_commissions").update(row).eq("id", (existing as any).id);
          } else {
            await admin.from("affiliate_commissions").insert(row);
          }
        } else {
          await admin.from("affiliate_commissions").insert(row);
        }
      }
    }

    await logEvent(wsId, "webhook", eventType, payload, "processed", null, provider);
    return json({ ok: true });
  } catch (err) {
    await logEvent(wsId, "webhook", eventType, payload, "error", String(err), provider);
    return json({ ok: false, error: "Processing failed" }, 500);
  }
}

// ---------------------------------------------------------------------------
// REST resource handlers (API-key authenticated)
// ---------------------------------------------------------------------------
const PARTNER_FIELDS = [
  "name", "email", "company", "status", "commission_type", "commission_rate",
  "flat_amount", "referral_code", "payout_method", "payout_details", "notes",
  "external_provider", "external_id",
];
const REFERRAL_FIELDS = [
  "contact_name", "contact_email", "source", "status", "deal_value", "currency",
  "converted_at", "external_id", "metadata", "client_id",
];
const COMMISSION_FIELDS = [
  "description", "basis_amount", "amount", "currency", "occurred_on", "status",
  "paid_at", "external_id", "referral_id",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // Path after the function name: /affiliate-api/v1/partners/... → ["v1","partners",...]
  const segments = url.pathname.split("/").filter(Boolean);
  const fnIdx = segments.indexOf("affiliate-api");
  const parts = fnIdx >= 0 ? segments.slice(fnIdx + 1) : segments;

  if (parts[0] !== "v1") return json({ error: "Unknown API version. Use /v1/..." }, 404);
  const [, resource, resourceId] = parts;

  // Inbound provider webhooks (token-authenticated, not API-key).
  if (resource === "webhooks") {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const provider = resourceId || "custom";
    return handleWebhook(req, provider, url);
  }

  const ctx = await authenticateApiKey(req);
  if (!ctx) return json({ error: "Invalid or missing API key" }, 401);

  const needsWrite = req.method !== "GET";
  if (needsWrite && !ctx.scopes.includes("write")) return json({ error: "API key lacks write scope" }, 403);
  if (!needsWrite && !ctx.scopes.includes("read") && !ctx.scopes.includes("write")) {
    return json({ error: "API key lacks read scope" }, 403);
  }

  const body: Record<string, unknown> =
    req.method === "GET" ? {} : await req.json().catch(() => ({} as Record<string, unknown>));

  try {
    // ---- Partners -----------------------------------------------------------
    if (resource === "partners") {
      if (req.method === "GET" && !resourceId) {
        const { limit, offset } = paging(url);
        let q = admin
          .from("affiliate_partners")
          .select("*")
          .eq("workspace_id", ctx.workspaceId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = url.searchParams.get("status");
        if (status) q = q.eq("status", status);
        const email = url.searchParams.get("email");
        if (email) q = q.eq("email", email);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }
      if (req.method === "GET" && resourceId) {
        const { data, error } = await admin
          .from("affiliate_partners")
          .select("*")
          .eq("workspace_id", ctx.workspaceId)
          .eq("id", resourceId)
          .maybeSingle();
        if (error) throw error;
        return data ? json({ data }) : json({ error: "Not found" }, 404);
      }
      if (req.method === "POST" && !resourceId) {
        if (!body.name || typeof body.name !== "string") return json({ error: "name is required" }, 422);
        const fields = pick(body, PARTNER_FIELDS);
        const { data, error } = await admin
          .from("affiliate_partners")
          .insert({ workspace_id: ctx.workspaceId, ...fields })
          .select("*")
          .single();
        if (error) throw error;
        await logEvent(ctx.workspaceId, "api", "partner.created", data);
        return json({ data }, 201);
      }
      if (req.method === "PATCH" && resourceId) {
        const fields = pick(body, PARTNER_FIELDS);
        const { data, error } = await admin
          .from("affiliate_partners")
          .update(fields)
          .eq("workspace_id", ctx.workspaceId)
          .eq("id", resourceId)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "Not found" }, 404);
        await logEvent(ctx.workspaceId, "api", "partner.updated", data);
        return json({ data });
      }
    }

    // ---- Referrals ----------------------------------------------------------
    if (resource === "referrals") {
      if (req.method === "GET" && !resourceId) {
        const { limit, offset } = paging(url);
        let q = admin
          .from("affiliate_referrals")
          .select("*")
          .eq("workspace_id", ctx.workspaceId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = url.searchParams.get("status");
        if (status) q = q.eq("status", status);
        const partnerId = url.searchParams.get("partner_id");
        if (partnerId) q = q.eq("partner_id", partnerId);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }
      if (req.method === "POST" && !resourceId) {
        const partner = await resolvePartner(ctx.workspaceId, body);
        if (!partner) return json({ error: "Partner not found — pass partner_id, referral_code, partner_email or partner_external_id" }, 422);
        if (!body.contact_name || typeof body.contact_name !== "string") {
          return json({ error: "contact_name is required" }, 422);
        }
        const fields = pick(body, REFERRAL_FIELDS);
        if (!(await validClientId(ctx.workspaceId, fields.client_id))) {
          return json({ error: "client_id does not exist in this workspace" }, 422);
        }
        // Idempotent on external_id: a provider retrying the same referral updates it.
        if (typeof fields.external_id === "string" && fields.external_id) {
          const { data: existing } = await admin
            .from("affiliate_referrals")
            .select("id")
            .eq("workspace_id", ctx.workspaceId)
            .eq("external_id", fields.external_id)
            .maybeSingle();
          if (existing) {
            const { data, error } = await admin
              .from("affiliate_referrals")
              .update({ ...fields, partner_id: partner.id })
              .eq("id", (existing as any).id)
              .select("*")
              .single();
            if (error) throw error;
            await logEvent(ctx.workspaceId, "api", "referral.updated", data);
            return json({ data });
          }
        }
        const { data, error } = await admin
          .from("affiliate_referrals")
          .insert({ workspace_id: ctx.workspaceId, partner_id: partner.id, ...fields })
          .select("*")
          .single();
        if (error) throw error;
        await logEvent(ctx.workspaceId, "api", "referral.created", data);
        return json({ data }, 201);
      }
      if (req.method === "PATCH" && resourceId) {
        const fields = pick(body, REFERRAL_FIELDS) as Record<string, unknown>;
        if (!(await validClientId(ctx.workspaceId, fields.client_id))) {
          return json({ error: "client_id does not exist in this workspace" }, 422);
        }
        if (fields.status === "converted" && !fields.converted_at) fields.converted_at = new Date().toISOString();
        const { data, error } = await admin
          .from("affiliate_referrals")
          .update(fields)
          .eq("workspace_id", ctx.workspaceId)
          .eq("id", resourceId)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "Not found" }, 404);
        await logEvent(ctx.workspaceId, "api", "referral.updated", data);
        return json({ data });
      }
    }

    // ---- Commissions --------------------------------------------------------
    if (resource === "commissions") {
      if (req.method === "GET" && !resourceId) {
        const { limit, offset } = paging(url);
        let q = admin
          .from("affiliate_commissions")
          .select("*")
          .eq("workspace_id", ctx.workspaceId)
          .order("occurred_on", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = url.searchParams.get("status");
        if (status) q = q.eq("status", status);
        const partnerId = url.searchParams.get("partner_id");
        if (partnerId) q = q.eq("partner_id", partnerId);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }
      if (req.method === "POST" && !resourceId) {
        const partner = await resolvePartner(ctx.workspaceId, body);
        if (!partner) return json({ error: "Partner not found — pass partner_id, referral_code, partner_email or partner_external_id" }, 422);
        const fields = pick(body, COMMISSION_FIELDS) as Record<string, unknown>;
        if (fields.amount == null) {
          const basis = fields.basis_amount != null ? Number(fields.basis_amount) : null;
          const computed = computeCommission(partner, basis);
          if (computed == null) return json({ error: "Pass amount, or basis_amount so it can be computed from the partner's terms" }, 422);
          fields.amount = computed;
        }
        // Idempotent on external_id.
        if (typeof fields.external_id === "string" && fields.external_id) {
          const { data: existing } = await admin
            .from("affiliate_commissions")
            .select("id")
            .eq("workspace_id", ctx.workspaceId)
            .eq("external_id", fields.external_id)
            .maybeSingle();
          if (existing) {
            const { data, error } = await admin
              .from("affiliate_commissions")
              .update({ ...fields, partner_id: partner.id })
              .eq("id", (existing as any).id)
              .select("*")
              .single();
            if (error) throw error;
            await logEvent(ctx.workspaceId, "api", "commission.updated", data);
            return json({ data });
          }
        }
        const { data, error } = await admin
          .from("affiliate_commissions")
          .insert({ workspace_id: ctx.workspaceId, partner_id: partner.id, ...fields })
          .select("*")
          .single();
        if (error) throw error;
        await logEvent(ctx.workspaceId, "api", "commission.created", data);
        return json({ data }, 201);
      }
      if (req.method === "PATCH" && resourceId) {
        const fields = pick(body, COMMISSION_FIELDS) as Record<string, unknown>;
        if (fields.status === "paid" && !fields.paid_at) fields.paid_at = new Date().toISOString();
        const { data, error } = await admin
          .from("affiliate_commissions")
          .update(fields)
          .eq("workspace_id", ctx.workspaceId)
          .eq("id", resourceId)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "Not found" }, 404);
        await logEvent(ctx.workspaceId, "api", "commission.updated", data);
        return json({ data });
      }
    }

    // ---- Payouts (read-only over the API) ------------------------------------
    if (resource === "payouts" && req.method === "GET" && !resourceId) {
      const { limit, offset } = paging(url);
      let q = admin
        .from("affiliate_payouts")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const partnerId = url.searchParams.get("partner_id");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return json({ data });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[affiliate-api]", err);
    return json({ error: "Internal error" }, 500);
  }
});
