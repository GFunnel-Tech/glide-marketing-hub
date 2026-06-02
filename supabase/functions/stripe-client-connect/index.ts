// Connects a client's own Stripe account by validating an API key the
// client pasted in. We do NOT act as a Connect platform — the key belongs
// to the client, we just store it server-side so we can read charges and
// rebill on their behalf.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const clientId = Number(body?.clientId);
  const apiKey = String(body?.apiKey ?? "").trim();
  const webhookSecret = body?.webhookSecret ? String(body.webhookSecret).trim() : null;

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return new Response(JSON.stringify({ error: "Invalid clientId" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.test(apiKey)) {
    return new Response(JSON.stringify({ error: "Invalid Stripe secret/restricted key format" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (webhookSecret && !/^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret)) {
    return new Response(JSON.stringify({ error: "Invalid webhook signing secret format" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authorization: user must be a member of the client's workspace.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: clientRow, error: clientErr } = await admin
    .from("clients").select("id, workspace_id").eq("id", clientId).single();
  if (clientErr || !clientRow) {
    return new Response(JSON.stringify({ error: "Client not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isMember } = await admin.rpc("is_workspace_member", {
    _user_id: userId, _workspace_id: clientRow.workspace_id,
  });
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate the key by calling Stripe directly — no platform/gateway.
  const acctResp = await fetch("https://api.stripe.com/v1/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const acct = await acctResp.json();
  if (!acctResp.ok) {
    return new Response(JSON.stringify({
      error: acct?.error?.message ?? "Stripe rejected the API key",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const livemode = apiKey.startsWith("sk_live_") || apiKey.startsWith("rk_live_");

  const { error: upsertErr } = await admin.from("client_stripe_accounts").upsert({
    client_id: clientId,
    workspace_id: clientRow.workspace_id,
    stripe_user_id: acct.id,
    access_token: apiKey,
    publishable_key: null,
    webhook_signing_secret: webhookSecret,
    scope: "read_write",
    livemode,
    connect_type: "byok",
    connected_by: userId,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    raw_oauth_response: { account: { id: acct.id, business_profile: acct.business_profile ?? null, email: acct.email ?? null } },
  }, { onConflict: "client_id" });

  if (upsertErr) {
    console.error("upsert error", upsertErr);
    return new Response(JSON.stringify({ error: upsertErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    stripe_user_id: acct.id,
    livemode,
    business_name: acct.business_profile?.name ?? null,
    email: acct.email ?? null,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
