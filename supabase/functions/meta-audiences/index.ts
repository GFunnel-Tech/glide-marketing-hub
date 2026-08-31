// Meta Custom Audiences manager.
// Body: { workspaceId, adAccountId, action, ...payload }
// Actions: list | create_customer_list | create_from_leads | create_website | create_lookalike | add_users | delete
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_VER = "v21.0";
const G = `https://graph.facebook.com/${META_VER}`;

async function sha256(raw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (v: string) => v.trim().toLowerCase();
function normPhone(v: string) {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `1${digits}` : digits;
}

async function metaPost(path: string, body: Record<string, unknown>, token: string, step: string) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v));
  }
  form.set("access_token", token);
  const r = await fetch(`${G}/${path}`, { method: "POST", body: form });
  const j = await r.json();
  if (!r.ok) throw new Error(`${step}: ${j?.error?.error_user_msg || j?.error?.message || "Meta error"}`);
  return j;
}

async function metaGet(path: string, token: string, step: string) {
  const r = await fetch(`${G}/${path}${path.includes("?") ? "&" : "?"}access_token=${token}`);
  const j = await r.json();
  if (!r.ok) throw new Error(`${step}: ${j?.error?.error_user_msg || j?.error?.message || "Meta error"}`);
  return j;
}

// Upload hashed records in batches of 5k
async function pushUsers(audienceId: string, records: { email?: string; phone?: string }[], token: string) {
  const schema = ["EMAIL", "SHA256_PHONE"];
  let uploaded = 0;
  for (let i = 0; i < records.length; i += 5000) {
    const slice = records.slice(i, i + 5000);
    const data: string[][] = [];
    for (const rec of slice) {
      const e = rec.email ? await sha256(normEmail(rec.email)) : "";
      const p = rec.phone && normPhone(rec.phone) ? await sha256(normPhone(rec.phone)) : "";
      if (!e && !p) continue;
      data.push([e, p]);
    }
    if (!data.length) continue;
    await metaPost(`${audienceId}/users`, { payload: { schema, data } }, token, "Uploading audience members");
    uploaded += data.length;
  }
  return uploaded;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { workspaceId, adAccountId, action } = body ?? {};
    if (!workspaceId || !action) return json({ error: "workspaceId and action required" }, 400);
    if (action !== "delete" && !adAccountId) return json({ error: "adAccountId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Membership check
    const { data: member } = await admin.from("workspace_members")
      .select("role").eq("workspace_id", workspaceId).eq("user_id", userData.user.id).maybeSingle();
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!member && !isSuper) return json({ error: "Not a member of this workspace" }, 403);

    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn?.access_token) return json({ error: "No active Meta connection for this workspace" }, 400);
    const token = conn.access_token as string;

    const actId = adAccountId ? (String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`) : "";

    if (action === "list") {
      const j = await metaGet(
        `${actId}/customaudiences?fields=id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_updated,retention_days&limit=200`,
        token, "Listing audiences",
      );
      return json({ audiences: j.data ?? [] });
    }

    if (action === "create_customer_list") {
      const { name, description, records } = body;
      if (!name) return json({ error: "name required" }, 400);
      const list: { email?: string; phone?: string }[] = Array.isArray(records) ? records : [];
      const created = await metaPost(`${actId}/customaudiences`, {
        name, description: description || "Created in Glide Media",
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
      }, token, "Creating customer list audience");
      const uploaded = list.length ? await pushUsers(created.id, list, token) : 0;
      return json({ id: created.id, uploaded });
    }

    if (action === "add_users") {
      const { audienceId, records } = body;
      if (!audienceId || !Array.isArray(records)) return json({ error: "audienceId and records required" }, 400);
      const uploaded = await pushUsers(audienceId, records, token);
      return json({ id: audienceId, uploaded });
    }

    if (action === "create_from_leads") {
      const { name, clientId, days } = body;
      if (!name || !clientId) return json({ error: "name and clientId required" }, 400);
      const since = new Date(Date.now() - (Number(days) || 180) * 86400000).toISOString();
      const records: { email?: string; phone?: string }[] = [];
      for (const table of ["meta_leads", "google_leads", "manual_leads", "linkedin_leads"]) {
        const { data } = await admin.from(table)
          .select("email, phone, created_at")
          .eq("client_id", clientId)
          .gte("created_at", since)
          .limit(20000);
        for (const row of data ?? []) {
          const r = row as { email?: string | null; phone?: string | null };
          if (r.email || r.phone) records.push({ email: r.email ?? undefined, phone: r.phone ?? undefined });
        }
      }
      if (!records.length) return json({ error: "No leads with email or phone found for this client in the selected window" }, 400);
      const created = await metaPost(`${actId}/customaudiences`, {
        name, description: `Glide Media leads (last ${Number(days) || 180} days)`,
        subtype: "CUSTOM", customer_file_source: "USER_PROVIDED_ONLY",
      }, token, "Creating leads audience");
      const uploaded = await pushUsers(created.id, records, token);
      return json({ id: created.id, uploaded, sourced: records.length });
    }

    if (action === "create_website") {
      const { name, pixelId, retentionDays, urlContains } = body;
      if (!name || !pixelId) return json({ error: "name and pixelId required" }, 400);
      const filter: Record<string, unknown> = {
        inclusions: {
          operator: "or",
          rules: [{
            event_sources: [{ id: String(pixelId), type: "pixel" }],
            retention_seconds: (Number(retentionDays) || 30) * 86400,
            filter: urlContains
              ? { operator: "and", filters: [{ field: "url", operator: "i_contains", value: urlContains }] }
              : undefined,
          }],
        },
      };
      const created = await metaPost(`${actId}/customaudiences`, {
        name, subtype: "WEBSITE", retention_days: Number(retentionDays) || 30,
        rule: filter, prefill: 1,
      }, token, "Creating website audience");
      return json({ id: created.id });
    }

    if (action === "create_lookalike") {
      const { name, originAudienceId, ratio, country } = body;
      if (!name || !originAudienceId) return json({ error: "name and originAudienceId required" }, 400);
      const created = await metaPost(`${actId}/customaudiences`, {
        name, subtype: "LOOKALIKE", origin_audience_id: originAudienceId,
        lookalike_spec: { ratio: Number(ratio) || 0.01, country: country || "US", type: "similarity" },
      }, token, "Creating lookalike audience");
      return json({ id: created.id });
    }

    if (action === "delete") {
      const { audienceId } = body;
      if (!audienceId) return json({ error: "audienceId required" }, 400);
      const r = await fetch(`${G}/${audienceId}?access_token=${token}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || "Delete failed" }, 400);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
