// Meta interest autosuggest. Body: { workspaceId, query }
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

    const { workspaceId, query } = await req.json();
    if (!workspaceId || !query) return json({ error: "workspaceId, query required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection" }, 400);

    const url = new URL("https://graph.facebook.com/v21.0/search");
    url.searchParams.set("type", "adinterest");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "10");
    url.searchParams.set("access_token", conn.access_token);
    const r = await fetch(url.toString());
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "Meta error" }, 400);
    return json({ results: (j.data ?? []).map((d: any) => ({ id: d.id, name: d.name, audience_size: d.audience_size_lower_bound })) });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
