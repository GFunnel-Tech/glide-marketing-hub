// Per-client Stripe webhook receiver. The client adds an endpoint in
// THEIR Stripe dashboard pointing here with ?client_id=N. We verify the
// signature using the per-client webhook_signing_secret they pasted at
// connect time, then mirror charge events into public.stripe_charges so
// the UI can show charges/failures and offer rebill.
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordPaymentEvent, type PaymentEventType } from "../_shared/paymentEvents.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  let timestamp: string | undefined;
  const v1s: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    if (k === "v1") v1s.push(v);
  }
  if (!timestamp || v1s.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(new Uint8Array(sig));
  // Constant-time comparison
  return v1s.some((v) => v.length === expected.length && timingSafeEqual(v, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const clientId = Number(url.searchParams.get("client_id"));
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return new Response("Missing client_id", { status: 400 });
  }
  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) return new Response("Missing signature", { status: 400 });

  const rawBody = await req.text();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: acct } = await admin
    .from("client_stripe_accounts")
    .select("workspace_id, stripe_user_id, webhook_signing_secret, livemode")
    .eq("client_id", clientId).maybeSingle();
  if (!acct?.webhook_signing_secret) {
    // Return 200 so Stripe doesn't keep retrying for a misconfigured client.
    console.warn(`No webhook secret for client_id=${clientId}`);
    return new Response(JSON.stringify({ received: true, ignored: "not_configured" }), { status: 200 });
  }

  const ok = await verifyStripeSignature(rawBody, sigHeader, acct.webhook_signing_secret);
  if (!ok) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(rawBody);

  // Persist last-seen event regardless of type for connection health.
  await admin.from("client_stripe_accounts").update({
    last_event_at: new Date().toISOString(),
    last_event_type: event.type,
  }).eq("client_id", clientId);

  if (
    event.type === "charge.succeeded" ||
    event.type === "charge.failed" ||
    event.type === "charge.refunded" ||
    event.type === "charge.updated"
  ) {
    const c = event.data?.object ?? {};
    await admin.from("stripe_charges").upsert({
      client_id: clientId,
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
      created_at_stripe: new Date((c.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      raw: c,
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_user_id,stripe_charge_id" });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
