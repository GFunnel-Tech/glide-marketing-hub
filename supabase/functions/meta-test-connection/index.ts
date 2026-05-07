// Tests an existing, stored Meta connection by re-running identity, permission,
// and ad-account discovery checks against Graph API. Reports whether the token
// still has the scopes required to sync ad data — without re-prompting the user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_SCOPES = ["ads_read", "read_insights"];
const RECOMMENDED_SCOPES = ["ads_management", "business_management", "leads_retrieval"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ ok: false, error: "Missing auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { connectionId } = await req.json().catch(() => ({}));
    if (!connectionId || typeof connectionId !== "string") {
      return json({ ok: false, error: "connectionId is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: connErr } = await admin
      .from("meta_connections")
      .select("id, workspace_id, access_token, meta_user_name, connection_type")
      .eq("id", connectionId)
      .maybeSingle();
    if (connErr || !conn) return json({ ok: false, error: "Connection not found" }, 404);

    // Caller must be a member of the connection's workspace
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", conn.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!member) return json({ ok: false, error: "Not a workspace member" }, 403);

    const accessToken = conn.access_token as string | null;
    if (!accessToken) {
      await markConnection(admin, conn.id, "error", "No access token stored.");
      return json({ ok: false, error: "No access token stored for this connection." });
    }

    // 1) Identity check
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const me = await meRes.json();
    if (!meRes.ok || me?.error) {
      const msg = me?.error?.message || "Token rejected by Meta.";
      await markConnection(admin, conn.id, "error", msg);
      return json({ ok: false, error: msg, code: me?.error?.code ?? null, stage: "identity" });
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
    const missingRecommended = RECOMMENDED_SCOPES.filter(s => !granted.includes(s));

    // 3) Ad account discovery (count only)
    let adAccountCount = 0;
    let adAccountError: string | null = null;
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id&limit=200&access_token=${encodeURIComponent(accessToken)}`,
      );
      const accs = await accRes.json();
      if (accs?.error) adAccountError = accs.error.message;
      else adAccountCount = (accs?.data ?? []).length;
    } catch (e) {
      adAccountError = String(e);
    }

    const ok = missingRequired.length === 0 && !adAccountError;
    const summary = ok
      ? `OK — ${adAccountCount} ad account${adAccountCount === 1 ? "" : "s"} accessible`
      : missingRequired.length
        ? `Missing required permissions: ${missingRequired.join(", ")}`
        : (adAccountError || "Connection test failed");

    await markConnection(admin, conn.id, ok ? "active" : "error", ok ? null : summary);

    return json({
      ok,
      connectionId: conn.id,
      metaUserName: me.name ?? conn.meta_user_name ?? null,
      adAccountCount,
      grantedScopes: granted,
      declinedScopes: declined,
      missingRequired,
      missingRecommended,
      adAccountError,
      summary,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

async function markConnection(admin: any, id: string, status: string, lastError: string | null) {
  await admin.from("meta_connections")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("id", id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
