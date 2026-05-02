// Verifies a Meta access token against Graph API without persisting anything.
// Returns the Meta user identity, granted permissions, and discovered ad-account count.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_SCOPES = ["ads_read", "read_insights"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require an authenticated caller so this can't be abused as a free token-check oracle.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Missing auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "Invalid auth" }, 401);

    const body = await req.json().catch(() => ({}));
    const accessToken: string | undefined = body?.accessToken?.trim();
    if (!accessToken) return json({ ok: false, error: "Access token is required." }, 400);
    if (accessToken.length < 50 || accessToken.length > 2000 || /\s/.test(accessToken)) {
      return json({ ok: false, error: "Token format looks invalid." }, 400);
    }

    // 1) Identity
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();
    if (!meRes.ok || me?.error) {
      const msg = me?.error?.message || "Token rejected by Meta.";
      return json({ ok: false, error: msg, code: me?.error?.code ?? null });
    }

    // 2) Permissions
    let granted: string[] = [];
    let declined: string[] = [];
    try {
      const permsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      const perms = await permsRes.json();
      for (const p of perms?.data ?? []) {
        if (p.status === "granted") granted.push(p.permission);
        else declined.push(p.permission);
      }
    } catch (_) { /* non-fatal */ }

    const missingRequired = REQUIRED_SCOPES.filter(s => !granted.includes(s));

    // 3) Ad account discovery (count only)
    let adAccountCount = 0;
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id&limit=200&access_token=${encodeURIComponent(accessToken)}`,
      );
      const accs = await accRes.json();
      adAccountCount = (accs?.data ?? []).length;
    } catch (_) { /* non-fatal */ }

    return json({
      ok: missingRequired.length === 0,
      metaUserName: me.name ?? null,
      metaUserId: me.id ?? null,
      adAccountCount,
      grantedScopes: granted,
      declinedScopes: declined,
      missingRequired,
      error: missingRequired.length === 0
        ? null
        : `Token is valid but missing required permissions: ${missingRequired.join(", ")}.`,
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
