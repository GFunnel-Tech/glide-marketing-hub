// Duplicate a Meta ad. Body: { workspaceId, adId, newName?, status?: "PAUSED"|"ACTIVE", targetAdsetId? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    const { workspaceId, adId, newName, status, targetAdsetId } = (await req.json().catch(() => ({}))) as any;
    if (!workspaceId || !adId) return json({ error: "workspaceId, adId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = await getToken(admin, workspaceId);
    if (!token) return json({ error: "No active Meta connection" }, 400);

    const log = await admin.from("ad_action_log").insert({
      workspace_id: workspaceId, channel: "meta", action: "duplicate",
      source_object_id: adId, performed_by: userData.user.id, status: "pending",
      meta: { newName, status, targetAdsetId },
    }).select("id").single();

    try {
      // Use Meta's /copies endpoint - duplicates the ad preserving its creative
      const params = new URLSearchParams();
      if (status) params.set("status_option", status === "ACTIVE" ? "ACTIVE" : "PAUSED");
      else params.set("status_option", "PAUSED");
      if (newName) params.set("rename_options", JSON.stringify({ rename_suffix: ` - ${newName}` }));
      if (targetAdsetId) params.set("adset_id", targetAdsetId);
      params.set("access_token", token);

      const r = await fetch(`https://graph.facebook.com/v21.0/${adId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Meta error");
      const newAdId = j.copied_ad_id || j.ad_object_ids?.[0] || j.id;
      await admin.from("ad_action_log").update({ status: "success", result_object_id: newAdId }).eq("id", log.data!.id);
      return json({ ok: true, newAdId });
    } catch (e: any) {
      await admin.from("ad_action_log").update({ status: "failed", error_message: e.message }).eq("id", log.data!.id);
      return json({ error: e.message }, 400);
    }
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});

async function getToken(admin: any, workspaceId: string): Promise<string | null> {
  const { data } = await admin.from("meta_connections")
    .select("access_token, token_expires_at").eq("workspace_id", workspaceId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return null;
  return data.access_token;
}
