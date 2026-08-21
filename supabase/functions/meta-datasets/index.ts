// Meta Datasets (Pixels / Conversions API).
// Body: { workspaceId, adAccountId, action, ...payload }
// Actions: list | create | stats | send_event
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

async function metaGet(path: string, token: string, step: string) {
  const r = await fetch(`${G}/${path}${path.includes("?") ? "&" : "?"}access_token=${token}`);
  const j = await r.json();
  if (!r.ok) throw new Error(`${step}: ${j?.error?.error_user_msg || j?.error?.message || "Meta error"}`);
  return j;
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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
      if (!actId) return json({ error: "adAccountId required" }, 400);
      const j = await metaGet(
        `${actId}/adspixels?fields=id,name,last_fired_time,is_created_by_business,creation_time&limit=100`,
        token, "Listing datasets",
      );
      return json({ datasets: j.data ?? [] });
    }

    if (action === "create") {
      if (!actId) return json({ error: "adAccountId required" }, 400);
      const { name } = body;
      if (!name) return json({ error: "name required" }, 400);
      const created = await metaPost(`${actId}/adspixels`, { name }, token, "Creating dataset");
      return json({ id: created.id });
    }

    if (action === "stats") {
      const { pixelId } = body;
      if (!pixelId) return json({ error: "pixelId required" }, 400);
      const j = await metaGet(
        `${pixelId}/stats?aggregation=event&start_time=${encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString())}`,
        token, "Reading dataset stats",
      );
      return json({ stats: j.data ?? [] });
    }

    if (action === "send_event") {
      const { pixelId, eventName, email, phone, value, currency, eventSourceUrl, testEventCode } = body;
      if (!pixelId || !eventName) return json({ error: "pixelId and eventName required" }, 400);
      const user_data: Record<string, string[]> = {};
      if (email) user_data.em = [await sha256(String(email).trim().toLowerCase())];
      if (phone) {
        const digits = String(phone).replace(/\D/g, "");
        if (digits) user_data.ph = [await sha256(digits.length === 10 ? `1${digits}` : digits)];
      }
      const event: Record<string, unknown> = {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        user_data,
      };
      if (eventSourceUrl) {
        event.event_source_url = eventSourceUrl;
        event.action_source = "website";
      }
      if (value) event.custom_data = { value: Number(value), currency: currency || "USD" };
      const payload: Record<string, unknown> = { data: [event] };
      if (testEventCode) payload.test_event_code = testEventCode;
      const res = await metaPost(`${pixelId}/events`, payload, token, "Sending conversion event");
      return json({ result: res });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
