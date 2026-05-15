// Update copy/CTA on a Meta ad by creating a new creative and swapping it in.
// Body: { workspaceId, adId, title?, body?, callToActionType?, linkUrl? }
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

    const { workspaceId, adId, title, body: copyBody, callToActionType, linkUrl } = (await req.json().catch(() => ({}))) as any;
    if (!workspaceId || !adId) return json({ error: "workspaceId, adId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = await getToken(admin, workspaceId);
    if (!token) return json({ error: "No active Meta connection" }, 400);

    // Look up the ad's account act_id
    const { data: ad } = await admin.from("meta_ads")
      .select("ad_account_id, creative_id, title, body, call_to_action_type, link_url")
      .eq("id", adId).eq("workspace_id", workspaceId).maybeSingle();
    if (!ad) return json({ error: "Ad not found" }, 404);
    const { data: account } = await admin.from("meta_ad_accounts").select("act_id").eq("id", ad.ad_account_id).maybeSingle();
    if (!account) return json({ error: "Ad account not found" }, 404);

    const log = await admin.from("ad_action_log").insert({
      workspace_id: workspaceId, channel: "meta", action: "update_creative",
      source_object_id: adId, performed_by: userData.user.id, status: "pending",
      meta: { title, body: copyBody, callToActionType, linkUrl },
    }).select("id").single();

    try {
      // Fetch current creative to preserve image/page/link
      const cr = await fetch(`https://graph.facebook.com/v21.0/${ad.creative_id}?fields=object_story_spec,effective_object_story_id&access_token=${encodeURIComponent(token)}`);
      const crJson = await cr.json();
      if (!cr.ok) throw new Error(crJson?.error?.message || "Failed to read creative");
      const spec = crJson.object_story_spec || {};
      // Apply edits to link_data if present, otherwise video_data
      const newSpec: any = JSON.parse(JSON.stringify(spec));
      const linkData = newSpec.link_data || newSpec.video_data;
      if (linkData) {
        if (title != null) linkData.name = title;
        if (copyBody != null) linkData.message = copyBody;
        if (linkUrl != null) linkData.link = linkUrl;
        if (callToActionType != null) {
          linkData.call_to_action = { ...(linkData.call_to_action || {}), type: callToActionType };
        }
      }

      // Create new creative
      const createParams = new URLSearchParams();
      createParams.set("object_story_spec", JSON.stringify(newSpec));
      createParams.set("access_token", token);
      const cRes = await fetch(`https://graph.facebook.com/v21.0/${account.act_id}/adcreatives`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: createParams.toString(),
      });
      const cJson = await cRes.json();
      if (!cRes.ok) throw new Error(cJson?.error?.message || "Failed to create creative");
      const newCreativeId = cJson.id;

      // Update ad to use new creative
      const updParams = new URLSearchParams();
      updParams.set("creative", JSON.stringify({ creative_id: newCreativeId }));
      updParams.set("access_token", token);
      const uRes = await fetch(`https://graph.facebook.com/v21.0/${adId}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: updParams.toString(),
      });
      const uJson = await uRes.json();
      if (!uRes.ok) throw new Error(uJson?.error?.message || "Failed to update ad");

      await admin.from("ad_action_log").update({ status: "success", result_object_id: newCreativeId }).eq("id", log.data!.id);
      return json({ ok: true, newCreativeId });
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
