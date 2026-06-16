// Connect (or update) an agency's single Stripe account for a workspace.
// Validates the restricted/secret key by calling Stripe's /v1/account endpoint,
// then stores it for later sync. Only workspace owners/admins can connect.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id ?? "");
    const apiKey = String(body.api_key ?? "").trim();

    if (!workspaceId) return json({ error: "workspace_id required" }, 400);
    if (!apiKey) return json({ error: "Stripe API key required" }, 400);
    if (!/^(sk|rk)_(test|live)_/.test(apiKey)) {
      return json({ error: "Key must start with sk_ or rk_ (test or live)" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorization: owner/admin only
    const { data: roleData } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: superRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuper = !!superRow;
    if (!isSuper && !(roleData && ["owner", "admin"].includes(String(roleData.role)))) {
      return json({ error: "Only workspace owners or admins can connect Stripe" }, 403);
    }

    // Validate the key with Stripe (and capture account metadata)
    const stripeRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!stripeRes.ok) {
      const errBody = await stripeRes.json().catch(() => ({}));
      return json(
        {
          error: errBody?.error?.message ?? "Stripe rejected the API key",
          stripe_error: errBody?.error ?? null,
        },
        400,
      );
    }
    const account = await stripeRes.json();

    // Upsert
    const { error: upsertErr } = await admin
      .from("workspace_stripe_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          api_key: apiKey,
          account_id: account.id ?? null,
          account_name: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
          account_email: account.email ?? null,
          livemode: account.charges_enabled ?? true,
          connected_by: userId,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({
      ok: true,
      account: {
        id: account.id,
        name: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
        email: account.email ?? null,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
