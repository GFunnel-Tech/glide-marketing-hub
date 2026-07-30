// Sync charges from the agency's single Stripe account.
// Pulls charges from the last `days` window (default 90), matches each charge's
// customer email to a client in the workspace, upserts into stripe_charges,
// and records payment_events for failures/refunds/disputes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordPaymentEvent } from "../_shared/paymentEvents.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  created: number;
  failure_code: string | null;
  failure_message: string | null;
  description: string | null;
  customer: string | null;
  receipt_url: string | null;
  payment_intent: string | null;
  invoice: string | null;
  metadata: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id ?? "");
    const days = Math.max(1, Math.min(365, Number(body.days ?? 90)));
    if (!workspaceId) return json({ error: "workspace_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return json({ error: "Not a workspace member" }, 403);

    // Load connection
    const { data: conn, error: connErr } = await admin
      .from("workspace_stripe_accounts")
      .select("api_key, account_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (connErr) return json({ error: connErr.message }, 500);
    if (!conn) return json({ error: "Stripe is not connected for this workspace" }, 400);

    // Build client email index
    const { data: clients } = await admin
      .from("clients")
      .select("id, name, email, brand")
      .eq("workspace_id", workspaceId);
    const emailToClient = new Map<string, number>();
    for (const c of clients ?? []) {
      const e = (c.email ?? "").trim().toLowerCase();
      if (e) emailToClient.set(e, c.id);
    }

    // Pull charges paginated, expanding customer for email
    const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
    let starting_after: string | undefined;
    let totalFetched = 0;
    let matched = 0;
    let upserts = 0;
    const paymentEvents: any[] = [];

    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams({
        limit: "100",
        "created[gte]": String(sinceUnix),
        "expand[]": "data.customer",
      });
      if (starting_after) params.set("starting_after", starting_after);

      const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
        headers: { Authorization: `Bearer ${conn.api_key}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await admin
          .from("workspace_stripe_accounts")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: err?.error?.message ?? `HTTP ${res.status}`,
          })
          .eq("workspace_id", workspaceId);
        return json({ error: err?.error?.message ?? "Stripe API error" }, 502);
      }
      const payload = await res.json();
      const data: StripeCharge[] = payload.data ?? [];

      for (const ch of data) {
        totalFetched++;

        // Customer email (expanded)
        const customerObj: any = ch.customer && typeof ch.customer === "object" ? ch.customer : null;
        const customerEmail = (customerObj?.email ?? "").trim().toLowerCase();
        const customerId = customerObj?.id ?? (typeof ch.customer === "string" ? ch.customer : null);
        const customerName = customerObj?.name ?? null;

        const clientId = customerEmail ? emailToClient.get(customerEmail) ?? null : null;
        if (clientId) matched++;

        // Mirror into stripe_charges (idempotent on stripe_charge_id)
        const chargeRow = {
          workspace_id: workspaceId,
          client_id: clientId,
          stripe_user_id: conn.account_id ?? "agency",
          stripe_charge_id: ch.id,
          stripe_customer_id: customerId,
          stripe_payment_intent_id: ch.payment_intent,
          stripe_invoice_id: ch.invoice,
          customer_email: customerObj?.email ?? null,
          customer_name: customerName,
          amount: ch.amount,
          amount_refunded: ch.amount_refunded,
          currency: ch.currency,
          status: ch.status,
          paid: ch.paid,
          refunded: ch.refunded,
          failure_code: ch.failure_code,
          failure_message: ch.failure_message,
          description: ch.description,
          receipt_url: ch.receipt_url,
          charge_created_at: new Date(ch.created * 1000).toISOString(),
          raw: ch as any,
        };

        const { error: upErr } = await admin
          .from("stripe_charges")
          .upsert(chargeRow, { onConflict: "stripe_charge_id" });
        if (!upErr) upserts++;

        // Record payment event for failures / refunds
        if (ch.status === "failed") {
          paymentEvents.push({
            workspace_id: workspaceId,
            client_id: clientId,
            stripe_user_id: conn.account_id ?? "agency",
            stripe_charge_id: ch.id,
            event_type: "charge_failed",
            amount: ch.amount,
            currency: ch.currency,
            failure_code: ch.failure_code,
            failure_message: ch.failure_message,
            customer_email: customerObj?.email ?? null,
            severity: ch.amount >= 5000 ? "critical" : "warn",
            status: "open",
            raw: ch as any,
            created_at: new Date(ch.created * 1000).toISOString(),
          });
        } else if (ch.refunded && ch.amount_refunded > 0) {
          paymentEvents.push({
            workspace_id: workspaceId,
            client_id: clientId,
            stripe_user_id: conn.account_id ?? "agency",
            stripe_charge_id: ch.id,
            event_type: "charge_refunded",
            amount: ch.amount_refunded,
            currency: ch.currency,
            customer_email: customerObj?.email ?? null,
            severity: "warn",
            status: "open",
            raw: ch as any,
            created_at: new Date(ch.created * 1000).toISOString(),
          });
        }
      }

      if (!payload.has_more || data.length === 0) break;
      starting_after = data[data.length - 1].id;
    }

    // Record payment events through the shared helper so each one also fans
    // out a high-priority notification to the workspace.
    for (const ev of paymentEvents) {
      await recordPaymentEvent(admin, {
        workspaceId: ev.workspace_id,
        clientId: ev.client_id ?? null,
        stripeUserId: ev.stripe_user_id ?? null,
        stripeChargeId: ev.stripe_charge_id ?? null,
        customerEmail: ev.customer_email ?? null,
        eventType: ev.event_type,
        amount: ev.amount,
        currency: ev.currency,
        failureCode: ev.failure_code ?? null,
        failureMessage: ev.failure_message ?? null,
        raw: ev.raw,
        createdAt: ev.created_at,
      });
    }

    await admin
      .from("workspace_stripe_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_error: null,
        last_sync_charges_count: totalFetched,
        last_sync_matched_count: matched,
      })
      .eq("workspace_id", workspaceId);

    return json({
      ok: true,
      fetched: totalFetched,
      upserts,
      matched,
      unmatched: totalFetched - matched,
      payment_events: paymentEvents.length,
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
