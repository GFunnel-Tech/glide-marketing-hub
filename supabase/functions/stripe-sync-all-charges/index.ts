// Backfills the last N days of charges from every connected client's own
// Stripe account into public.stripe_charges. The caller must be a workspace
// member; we only sync accounts in that user's workspaces.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { recordPaymentEvent } from "../_shared/paymentEvents.ts";

const DAYS_DEFAULT = 90;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10; // safety cap = up to 1000 charges per account

async function syncOneAccount(admin: any, acct: any, sinceUnix: number) {
  let starting_after: string | undefined;
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      "created[gte]": String(sinceUnix),
    });
    if (starting_after) params.set("starting_after", starting_after);
    const resp = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
      headers: { Authorization: `Bearer ${acct.access_token}` },
    });
    const json = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: json?.error?.message ?? "Stripe error", synced: total };
    }
    const charges = json.data ?? [];
    if (charges.length === 0) break;

    const rows = charges.map((c: any) => ({
      client_id: acct.client_id,
      workspace_id: acct.workspace_id,
      stripe_user_id: acct.stripe_user_id,
      stripe_charge_id: c.id,
      stripe_customer_id: typeof c.customer === "string" ? c.customer : c.customer?.id ?? null,
      customer_email: c.billing_details?.email ?? c.receipt_email ?? null,
      amount: c.amount ?? 0,
      amount_refunded: c.amount_refunded ?? 0,
      currency: c.currency ?? "usd",
      status: c.status ?? "unknown",
      paid: !!c.paid,
      refunded: !!c.refunded,
      failure_code: c.failure_code ?? null,
      failure_message: c.failure_message ?? null,
      description: c.description ?? null,
      receipt_url: c.receipt_url ?? null,
      livemode: !!c.livemode,
      created_at_stripe: new Date((c.created ?? 0) * 1000).toISOString(),
      raw: c,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await admin
      .from("stripe_charges")
      .upsert(rows, { onConflict: "stripe_user_id,stripe_charge_id" });
    if (error) return { ok: false, error: error.message, synced: total };

    // Surface failed/refunded charges as payment events (idempotent).
    for (const c of charges) {
      const isFailed = c.status === "failed";
      const isRefunded = !!c.refunded || (c.amount_refunded ?? 0) > 0;
      if (!isFailed && !isRefunded) continue;
      await recordPaymentEvent(admin, {
        workspaceId: acct.workspace_id,
        clientId: acct.client_id,
        stripeUserId: acct.stripe_user_id,
        stripeChargeId: c.id,
        stripeCustomerId: typeof c.customer === "string" ? c.customer : c.customer?.id ?? null,
        customerEmail: c.billing_details?.email ?? c.receipt_email ?? null,
        eventType: isFailed ? "charge_failed" : "charge_refunded",
        amount: c.amount ?? 0,
        currency: c.currency ?? "usd",
        failureCode: c.failure_code ?? null,
        failureMessage: c.failure_message ?? null,
        description: c.description ?? null,
        raw: c,
        createdAt: new Date((c.created ?? 0) * 1000).toISOString(),
      });
    }

    total += rows.length;
    if (!json.has_more) break;
    starting_after = charges[charges.length - 1].id;
  }

  await admin.from("client_stripe_accounts").update({
    last_event_at: new Date().toISOString(),
    last_event_type: "backfill_sync",
  }).eq("client_id", acct.client_id);

  return { ok: true, synced: total };
}

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
  const days = Math.min(Math.max(Number(body?.days) || DAYS_DEFAULT, 1), 365);
  const requestedWorkspaceId = body?.workspaceId ? String(body.workspaceId) : null;
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Workspaces the user belongs to
  const { data: memberships, error: memErr } = await admin
    .from("workspace_members").select("workspace_id").eq("user_id", userId);
  if (memErr) {
    return new Response(JSON.stringify({ error: memErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let workspaceIds = (memberships ?? []).map((m: any) => m.workspace_id);
  if (requestedWorkspaceId) {
    if (!workspaceIds.includes(requestedWorkspaceId)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    workspaceIds = [requestedWorkspaceId];
  }
  if (workspaceIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, accounts: 0, synced: 0, results: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: accounts, error: acctErr } = await admin
    .from("client_stripe_accounts")
    .select("client_id, workspace_id, stripe_user_id, access_token, livemode")
    .in("workspace_id", workspaceIds)
    .is("disconnected_at", null);
  if (acctErr) {
    return new Response(JSON.stringify({ error: acctErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  let totalSynced = 0;
  let failed = 0;
  for (const acct of accounts ?? []) {
    try {
      const r = await syncOneAccount(admin, acct, sinceUnix);
      results.push({ client_id: acct.client_id, ...r });
      if (r.ok) totalSynced += r.synced;
      else failed++;
    } catch (e: any) {
      failed++;
      results.push({ client_id: acct.client_id, ok: false, error: e?.message ?? "unknown" });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    accounts: accounts?.length ?? 0,
    synced: totalSynced,
    failed,
    days,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
