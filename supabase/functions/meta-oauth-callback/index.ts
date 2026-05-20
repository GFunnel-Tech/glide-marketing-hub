// Exchanges the OAuth code for a long-lived token, stores connection,
// discovers ad accounts (as PENDING / inactive), and returns the discovered
// list so the user can pick which ones to sync via meta-confirm-accounts.
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

    let parsed: { u: string; w: string; n: string; t: number; r?: string | null };
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

    // 2) Long-lived token (~60 days)
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

    // 3) Meta user identity
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const requiredAdsScopes = ["ads_read", "ads_management", "business_management"];
    const permissionErrorMessage =
      "Meta only granted public_profile. Ads permissions were not granted to this Facebook user. If the Meta app is in Development mode, add this user as an app Tester/Developer and have them accept the invite in Facebook Settings → Apps and Websites → Requests, then reconnect.";

    // verify membership
    const { data: memberCheck } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", parsed.w)
      .eq("user_id", parsed.u)
      .maybeSingle();
    if (!memberCheck) return json({ error: "not a workspace member" }, 403);

    // granted permissions
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

    // upsert connection (insert or reconnect)
    let conn: any;
    let connErr: any;
    if (parsed.r) {
      const upd = await admin
        .from("meta_connections")
        .update({
          connection_type: "oauth",
          meta_user_id: me.id ?? null,
          meta_user_name: me.name ?? null,
          access_token: accessToken,
          token_expires_at: expiresAt,
          scopes: grantedScopes,
          status: "active",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsed.r)
        .eq("workspace_id", parsed.w)
        .select()
        .single();
      conn = upd.data;
      connErr = upd.error;
    } else {
      const ins = await admin
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
      conn = ins.data;
      connErr = ins.error;
    }
    if (connErr || !conn) return json({ error: "store connection failed", details: connErr }, 500);

    // Detect missing ads permissions BEFORE trying to discover accounts —
    // without these scopes, /me/adaccounts returns empty and the user gets a
    // confusing "0 accounts" screen instead of a clear permissions error.
    const missingAdsScopes = requiredAdsScopes.filter((s) => !grantedScopes.includes(s));
    if (missingAdsScopes.length === requiredAdsScopes.length) {
      await admin
        .from("meta_connections")
        .update({
          status: "error",
          last_error: permissionErrorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
      // User declined ALL ads-related scopes on the Facebook consent screen.
      return json({
        ok: false,
        error: "permissions_declined",
        message: permissionErrorMessage,
        connectionId: conn.id,
        metaUserName: me.name ?? null,
        grantedScopes,
        declinedScopes,
        missingScopes: missingAdsScopes,
      }, 200);
    }

    // Discover ad accounts (insert as inactive — selection step decides what's active)
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business{id,name}&limit=200&access_token=${encodeURIComponent(accessToken)}`,
    );
    const accounts = await accountsRes.json();
    if (!accountsRes.ok) {
      return json({
        ok: false,
        error: "adaccounts_fetch_failed",
        message: accounts?.error?.message || "Failed to fetch ad accounts from Meta.",
        connectionId: conn.id,
        metaUserName: me.name ?? null,
        grantedScopes,
        declinedScopes,
        details: accounts,
      }, 200);
    }
    const discovered = (accounts.data ?? []).map((a: any) => ({
      workspace_id: parsed.w,
      connection_id: conn.id,
      act_id: `act_${a.account_id}`,
      account_name: a.name,
      currency: a.currency,
      timezone_name: a.timezone_name,
      business_id: a.business?.id ?? null,
      business_name: a.business?.name ?? null,
      account_status: a.account_status ?? null,
      is_active: false, // pending selection
    }));

    if (discovered.length) {
      // For reconnect, do NOT clobber existing is_active state — only insert new ones.
      // Do this with two passes: fetch existing act_ids for this connection, then
      // upsert metadata for known ones (preserving is_active) and insert new with is_active=false.
      const { data: existing } = await admin
        .from("meta_ad_accounts")
        .select("act_id,is_active")
        .eq("workspace_id", parsed.w)
        .eq("connection_id", conn.id);
      const existingMap = new Map((existing ?? []).map((e: any) => [e.act_id, e.is_active]));

      const rowsToUpsert = discovered.map((r: any) => ({
        ...r,
        // Keep prior is_active if account already existed; new ones default to false (pending picker)
        is_active: existingMap.has(r.act_id) ? existingMap.get(r.act_id) : false,
      }));

      await admin
        .from("meta_ad_accounts")
        .upsert(rowsToUpsert, { onConflict: "workspace_id,act_id" });
    }

    // Read back accounts (with selection state) to send to client picker
    const { data: pickable } = await admin
      .from("meta_ad_accounts")
      .select("id,act_id,account_name,business_name,currency,account_status,is_active")
      .eq("workspace_id", parsed.w)
      .eq("connection_id", conn.id)
      .order("account_name", { ascending: true });

    return json({
      ok: true,
      connectionId: conn.id,
      workspaceId: parsed.w,
      accountsDiscovered: discovered.length,
      accounts: pickable ?? [],
      metaUserName: me.name ?? null,
      grantedScopes,
      declinedScopes,
      tokenExpiresAt: expiresAt,
      isReconnect: !!parsed.r,
    });
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
