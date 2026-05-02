// Manual-token fallback: validates a user-supplied Meta access token,
// stores it as a connection, and discovers ad accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId, accessToken, reconnectId } = await req.json();
    if (!workspaceId || !accessToken) return json({ error: "workspaceId and accessToken required" }, 400);

    // Validate token by calling /me
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();
    if (!meRes.ok || !me.id) return json({ error: "invalid token", details: me }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let conn: any;
    let connErr: any;
    if (reconnectId) {
      const upd = await admin.from("meta_connections").update({
        connection_type: "manual",
        meta_user_id: me.id,
        meta_user_name: me.name,
        access_token: accessToken,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", reconnectId).eq("workspace_id", workspaceId).select().single();
      conn = upd.data;
      connErr = upd.error;
    } else {
      const ins = await admin.from("meta_connections").insert({
        workspace_id: workspaceId,
        connected_by: userData.user.id,
        connection_type: "manual",
        meta_user_id: me.id,
        meta_user_name: me.name,
        access_token: accessToken,
        status: "active",
      }).select().single();
      conn = ins.data;
      connErr = ins.error;
    }
    if (connErr || !conn) return json({ error: connErr?.message || "store failed" }, 500);

    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business{id,name}&limit=200&access_token=${encodeURIComponent(accessToken)}`,
    );
    const accounts = await accountsRes.json();
    const rows = (accounts.data ?? []).map((a: any) => ({
      workspace_id: workspaceId,
      connection_id: conn.id,
      act_id: `act_${a.account_id}`,
      account_name: a.name,
      currency: a.currency,
      timezone_name: a.timezone_name,
      business_id: a.business?.id ?? null,
      business_name: a.business?.name ?? null,
      account_status: a.account_status ?? null,
      is_active: true,
    }));
    if (rows.length) await admin.from("meta_ad_accounts").upsert(rows, { onConflict: "workspace_id,act_id" });

    return json({ ok: true, accountsDiscovered: rows.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
