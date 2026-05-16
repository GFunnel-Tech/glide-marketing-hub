// Lists existing leadgen_forms for a Facebook Page.
// Body: { workspaceId, pageId }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_VER = "v21.0";

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

    const { workspaceId, pageId } = await req.json();
    if (!workspaceId || !pageId) return json({ error: "workspaceId and pageId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection" }, 400);
    const token = conn.access_token;

    // Get a Page access token
    const pageRes = await fetch(`https://graph.facebook.com/${META_VER}/${pageId}?fields=access_token&access_token=${token}`);
    const pageJson = await pageRes.json();
    if (!pageRes.ok || !pageJson.access_token) {
      return json({ error: pageJson?.error?.message || "Could not get Page access token" }, 400);
    }

    const r = await fetch(`https://graph.facebook.com/${META_VER}/${pageId}/leadgen_forms?fields=id,name,status,created_time&limit=50&access_token=${pageJson.access_token}`);
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "Failed to list forms" }, 400);

    return json({ forms: j.data ?? [] });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
