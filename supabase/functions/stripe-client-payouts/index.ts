// Lists the last N payouts from the client's own Stripe account.
// The API key is loaded server-side from client_stripe_accounts and is
// NEVER sent to the browser. Caller must be a workspace member.
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
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const clientId = Number(body?.clientId);
  const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return new Response(JSON.stringify({ error: "Invalid clientId" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: acct } = await admin
    .from("client_stripe_accounts")
    .select("workspace_id, access_token, livemode, stripe_user_id")
    .eq("client_id", clientId).maybeSingle();
  if (!acct) {
    return new Response(JSON.stringify({ error: "Stripe not connected for this client" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isMember } = await admin.rpc("is_workspace_member", {
    _user_id: userId, _workspace_id: acct.workspace_id,
  });
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resp = await fetch(`https://api.stripe.com/v1/payouts?limit=${limit}`, {
    headers: { Authorization: `Bearer ${acct.access_token}` },
  });
  const json = await resp.json();
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: json?.error?.message ?? "Stripe error" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payouts = (json.data ?? []).map((p: any) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    arrival_date: p.arrival_date,
    created: p.created,
    method: p.method,
    type: p.type,
    description: p.description,
    statement_descriptor: p.statement_descriptor,
    failure_code: p.failure_code,
    failure_message: p.failure_message,
    livemode: p.livemode,
  }));

  return new Response(JSON.stringify({ payouts, livemode: acct.livemode, stripe_user_id: acct.stripe_user_id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
