// Lists Facebook Pages and Ad Accounts accessible to the connected Meta user.
// Body: { workspaceId }
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

    const { workspaceId } = await req.json();
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection" }, 400);

    // Pages
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture{url}&limit=50&access_token=${conn.access_token}`);
    const pagesJson = await pagesRes.json();
    const pages = (pagesJson.data ?? []).map((p: any) => ({
      id: p.id, name: p.name, avatar: p.picture?.data?.url,
    }));

    // Ad Accounts (from our table — already synced)
    const { data: accounts } = await admin.from("meta_ad_accounts")
      .select("act_id, account_name, currency, client_id")
      .eq("workspace_id", workspaceId).eq("is_active", true);

    return json({ pages, adAccounts: accounts ?? [] });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
