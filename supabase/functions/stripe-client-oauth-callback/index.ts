// Finishes the Stripe Connect OAuth flow. Stripe redirects the browser here
// with ?code=...&state=... (or ?error=...). We validate the one-time state
// nonce, exchange the code for the connected account's tokens using the
// platform secret key, store them server-side, then redirect the user back
// into the app. This endpoint is public (verify_jwt = false) because Stripe's
// redirect carries no Supabase session — security comes from the signed,
// single-use state nonce.
import { createClient } from "npm:@supabase/supabase-js@2";

const FALLBACK_RETURN = "/billing";

function redirect(base: string, params: Record<string, string>) {
  let target: URL;
  try {
    target = new URL(base);
  } catch {
    // Relative return_url — anchor it to the configured app origin.
    const origin = Deno.env.get("APP_BASE_URL") ?? "https://app.localhost";
    target = new URL(base.startsWith("/") ? base : `/${base}`, origin);
  }
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const appBase = Deno.env.get("APP_BASE_URL") ?? "";
  const homeReturn = appBase ? `${appBase.replace(/\/$/, "")}${FALLBACK_RETURN}` : FALLBACK_RETURN;

  if (!state) return redirect(homeReturn, { stripe: "error", reason: "missing_state" });

  // Look up and validate the nonce first so we know where to send the user back.
  const { data: stateRow } = await admin
    .from("stripe_connect_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  const returnTo = stateRow?.return_url || homeReturn;

  if (!stateRow) return redirect(homeReturn, { stripe: "error", reason: "invalid_state" });
  if (stateRow.consumed_at) return redirect(returnTo, { stripe: "error", reason: "state_used" });
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return redirect(returnTo, { stripe: "error", reason: "state_expired" });
  }

  // Burn the nonce immediately so it can't be replayed.
  await admin.from("stripe_connect_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state);

  if (oauthError) {
    return redirect(returnTo, { stripe: "error", reason: oauthError });
  }
  if (!code) return redirect(returnTo, { stripe: "error", reason: "missing_code" });

  const platformSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!platformSecret) {
    return redirect(returnTo, { stripe: "error", reason: "oauth_not_configured" });
  }

  // Exchange the authorization code for the connected account's tokens.
  const tokenResp = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_secret: platformSecret,
    }),
  });
  const tok = await tokenResp.json();
  if (!tokenResp.ok || !tok?.stripe_user_id || !tok?.access_token) {
    console.error("oauth token exchange failed", tok?.error_description ?? tok);
    return redirect(returnTo, {
      stripe: "error",
      reason: tok?.error ?? "token_exchange_failed",
    });
  }

  const { error: upsertErr } = await admin.from("client_stripe_accounts").upsert({
    client_id: stateRow.client_id,
    workspace_id: stateRow.workspace_id,
    stripe_user_id: tok.stripe_user_id,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? null,
    publishable_key: tok.stripe_publishable_key ?? null,
    scope: tok.scope ?? "read_write",
    livemode: !!tok.livemode,
    token_type: tok.token_type ?? "bearer",
    connect_type: stateRow.connect_type ?? "standard",
    connected_by: stateRow.created_by,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    raw_oauth_response: { stripe_user_id: tok.stripe_user_id, scope: tok.scope, livemode: tok.livemode },
  }, { onConflict: "client_id" });

  if (upsertErr) {
    console.error("oauth upsert failed", upsertErr);
    return redirect(returnTo, { stripe: "error", reason: "save_failed" });
  }

  return redirect(returnTo, { stripe: "connected", client: String(stateRow.client_id) });
});
