// Begins the "click and sync" Stripe Connect OAuth flow for a single client.
// The caller (a workspace member) gets back an authorize URL; the browser
// redirects there, the client approves on Stripe, and Stripe redirects to
// stripe-client-oauth-callback which finishes the link. No keys are pasted.
//
// If the platform hasn't configured STRIPE_CONNECT_CLIENT_ID we return
// { error: "oauth_not_configured" } so the UI can fall back to the manual
// restricted-key dialog.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const clientId = Number(body?.clientId);
  const returnUrl = body?.returnUrl ? String(body.returnUrl) : null;
  const connectType = body?.connectType === "express" ? "express" : "standard";
  if (!Number.isInteger(clientId) || clientId <= 0) return json({ error: "Invalid clientId" }, 400);

  const connectClientId = Deno.env.get("STRIPE_CONNECT_CLIENT_ID");
  if (!connectClientId) {
    // Platform OAuth app not set up — let the UI offer the manual key path.
    return json({ error: "oauth_not_configured" }, 200);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authorization: user must belong to the client's workspace.
  const { data: clientRow, error: clientErr } = await admin
    .from("clients").select("id, workspace_id").eq("id", clientId).single();
  if (clientErr || !clientRow) return json({ error: "Client not found" }, 404);

  const { data: isMember } = await admin.rpc("is_workspace_member", {
    _user_id: userId, _workspace_id: clientRow.workspace_id,
  });
  if (!isMember) return json({ error: "Forbidden" }, 403);

  // CSRF nonce — consumed once in the callback.
  const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const { error: stateErr } = await admin.from("stripe_connect_oauth_states").insert({
    state,
    client_id: clientId,
    workspace_id: clientRow.workspace_id,
    created_by: userId,
    connect_type: connectType,
    return_url: returnUrl,
  });
  if (stateErr) return json({ error: stateErr.message }, 500);

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-client-oauth-callback`;
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", connectClientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return json({ ok: true, url: url.toString() });
});
