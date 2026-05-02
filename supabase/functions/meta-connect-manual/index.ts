// Manual-token fallback: validates a user-supplied Meta access token,
// stores/updates the connection in the workspace (persisted), and
// discovers ad accounts. The connection persists across refreshes because
// it is written to the meta_connections table scoped to workspace_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { workspaceId, accessToken, reconnectId } = await req.json();
    if (!workspaceId || !accessToken) {
      return json({ ok: false, error: "workspaceId and accessToken required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller is a workspace member (defense-in-depth; service role bypasses RLS)
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!member) return json({ ok: false, error: "Not a workspace member" }, 403);

    // Validate token via /me
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();
    if (!meRes.ok || !me.id) {
      return json({ ok: false, error: me?.error?.message || "Invalid Meta access token." }, 400);
    }

    // Granted permissions (best-effort)
    let grantedScopes: string[] = [];
    try {
      const permsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      const perms = await permsRes.json();
      for (const p of perms?.data ?? []) {
        if (p.status === "granted") grantedScopes.push(p.permission);
      }
    } catch (_) { /* non-fatal */ }

    // Persist connection (insert or in-place reconnect)
    let conn: { id: string; workspace_id: string } | null = null;
    let connErr: any = null;
    if (reconnectId) {
      const upd = await admin.from("meta_connections")
        .update({
          connection_type: "manual",
          meta_user_id: me.id,
          meta_user_name: me.name ?? null,
          access_token: accessToken,
          scopes: grantedScopes,
          status: "active",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reconnectId)
        .eq("workspace_id", workspaceId)
        .select("id,workspace_id")
        .single();
      conn = upd.data as any;
      connErr = upd.error;
    } else {
      const ins = await admin.from("meta_connections")
        .insert({
          workspace_id: workspaceId,
          connected_by: userData.user.id,
          connection_type: "manual",
          meta_user_id: me.id,
          meta_user_name: me.name ?? null,
          access_token: accessToken,
          scopes: grantedScopes,
          status: "active",
        })
        .select("id,workspace_id")
        .single();
      conn = ins.data as any;
      connErr = ins.error;
    }
    if (connErr || !conn) {
      return json({ ok: false, error: connErr?.message || "Failed to persist connection." }, 500);
    }

    // Discover ad accounts and persist them (active by default for manual flow)
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business{id,name}&limit=200&access_token=${encodeURIComponent(accessToken)}`,
    );
    const accounts = await accountsRes.json();
    const rows = (accounts?.data ?? []).map((a: any) => ({
      workspace_id: workspaceId,
      connection_id: conn!.id,
      act_id: `act_${a.account_id}`,
      account_name: a.name,
      currency: a.currency,
      timezone_name: a.timezone_name,
      business_id: a.business?.id ?? null,
      business_name: a.business?.name ?? null,
      account_status: a.account_status ?? null,
      is_active: true,
    }));
    if (rows.length) {
      const { error: accErr } = await admin
        .from("meta_ad_accounts")
        .upsert(rows, { onConflict: "workspace_id,act_id" });
      if (accErr) {
        // Connection is saved; surface a soft warning
        return json({
          ok: true,
          connectionId: conn.id,
          accountsDiscovered: rows.length,
          warning: `Connection saved, but ad-account import failed: ${accErr.message}`,
        });
      }
    }

    await admin.from("meta_sync_log").insert({
      workspace_id: workspaceId,
      connection_id: conn.id,
      trigger: reconnectId ? "manual_reconnect" : "manual_connect",
      status: "success",
      rows_synced: rows.length,
      finished_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      connectionId: conn.id,
      workspaceId,
      accountsDiscovered: rows.length,
      metaUserName: me.name ?? null,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
