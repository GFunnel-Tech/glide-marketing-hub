// Exchanges the OAuth code for a long-lived token, stores connection,
// discovers ad accounts. Called by the metahub.gfunnel.com landing page
// after Meta redirects back.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDIRECT_URI = "https://metahub.gfunnel.com/auth/meta/callback";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, state } = await req.json();
    if (!code || !state) {
      return json({ error: "code and state required" }, 400);
    }

    let parsed: { u: string; w: string; n: string; t: number };
    try {
      parsed = JSON.parse(atob(state));
    } catch {
      return json({ error: "invalid state" }, 400);
    }
    if (Date.now() - parsed.t > 10 * 60 * 1000) {
      return json({ error: "state expired" }, 400);
    }

    const appId = Deno.env.get("META_APP_ID")!;
    const appSecret = Deno.env.get("META_APP_SECRET")!;

    // 1) Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);
    const tokRes = await fetch(tokenUrl.toString());
    const tok = await tokRes.json();
    if (!tokRes.ok || !tok.access_token) {
      return json({ error: "token exchange failed", details: tok }, 400);
    }

    // 2) Exchange for long-lived token (~60 days)
    const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", tok.access_token);
    const longRes = await fetch(longUrl.toString());
    const long = await longRes.json();
    const accessToken: string = long.access_token ?? tok.access_token;
    const expiresIn: number | undefined = long.expires_in ?? tok.expires_in;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) Get Meta user identity
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();

    // 4) Store connection (service role to bypass RLS, but enforce ownership from state)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // verify the workspace member relationship
    const { data: memberCheck } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", parsed.w)
      .eq("user_id", parsed.u)
      .maybeSingle();
    if (!memberCheck) return json({ error: "not a workspace member" }, 403);

    // Fetch granted permissions for verification status
    let grantedScopes: string[] = [];
    let declinedScopes: string[] = [];
    try {
      const permsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      const perms = await permsRes.json();
      for (const p of perms.data ?? []) {
        if (p.status === "granted") grantedScopes.push(p.permission);
        else declinedScopes.push(p.permission);
      }
    } catch (_) { /* non-fatal */ }

    const { data: conn, error: connErr } = await admin
      .from("meta_connections")
      .insert({
        workspace_id: parsed.w,
        connected_by: parsed.u,
        connection_type: "oauth",
        meta_user_id: me.id ?? null,
        meta_user_name: me.name ?? null,
        access_token: accessToken,
        token_expires_at: expiresAt,
        scopes: grantedScopes,
        status: "active",
      })
      .select()
      .single();
    if (connErr) return json({ error: "store connection failed", details: connErr }, 500);

    // 5) Discover ad accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business{id,name}&limit=200&access_token=${encodeURIComponent(accessToken)}`,
    );
    const accounts = await accountsRes.json();
    const rows = (accounts.data ?? []).map((a: any) => ({
      workspace_id: parsed.w,
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

    if (rows.length) {
      await admin
        .from("meta_ad_accounts")
        .upsert(rows, { onConflict: "workspace_id,act_id" });
    }

    await admin.from("meta_sync_log").insert({
      workspace_id: parsed.w,
      connection_id: conn.id,
      trigger: "oauth_connect",
      status: "success",
      rows_synced: rows.length,
      finished_at: new Date().toISOString(),
    });

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
