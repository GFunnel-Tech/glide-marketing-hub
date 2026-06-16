// Shared helper to record a payment problem into public.payment_events and
// fan out an in-app notification to every workspace member who has the
// `payment_failed` preference enabled. Idempotent via the
// (stripe_user_id, stripe_charge_id, event_type) unique index.

export type PaymentEventType =
  | "charge_failed"
  | "charge_refunded"
  | "charge_disputed"
  | "invoice_payment_failed";

export interface RecordPaymentEventInput {
  workspaceId: string;
  clientId: number | null;
  stripeUserId: string | null;
  stripeChargeId: string | null;
  stripeCustomerId?: string | null;
  customerEmail?: string | null;
  eventType: PaymentEventType;
  amount?: number;
  currency?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  description?: string | null;
  raw?: unknown;
  createdAt?: string;
}

const SEVERITY: Record<PaymentEventType, "warn" | "critical"> = {
  charge_failed: "critical",
  invoice_payment_failed: "critical",
  charge_disputed: "critical",
  charge_refunded: "warn",
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
    }).format((amount || 0) / 100);
  } catch {
    return `$${((amount || 0) / 100).toFixed(2)}`;
  }
}

const TITLES: Record<PaymentEventType, string> = {
  charge_failed: "Payment failed",
  invoice_payment_failed: "Invoice payment failed",
  charge_disputed: "Charge disputed",
  charge_refunded: "Charge refunded",
};

export async function recordPaymentEvent(admin: any, input: RecordPaymentEventInput) {
  const severity = SEVERITY[input.eventType];
  const row = {
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    stripe_user_id: input.stripeUserId,
    stripe_charge_id: input.stripeChargeId,
    stripe_customer_id: input.stripeCustomerId ?? null,
    customer_email: input.customerEmail ?? null,
    event_type: input.eventType,
    severity,
    status: "open",
    amount: input.amount ?? 0,
    currency: input.currency ?? "usd",
    failure_code: input.failureCode ?? null,
    failure_message: input.failureMessage ?? null,
    description: input.description ?? null,
    raw: input.raw ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
  };

  const { data: upserted, error } = await admin
    .from("payment_events")
    .upsert(row, { onConflict: "stripe_user_id,stripe_charge_id,event_type", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("payment_events upsert failed", error);
    return { ok: false, error: error.message };
  }
  // If the row already existed, upserted will be null with ignoreDuplicates — skip notification.
  if (!upserted?.id) return { ok: true, deduped: true };

  // Fan out a notification per workspace member with the pref enabled.
  let clientName: string | null = null;
  if (input.clientId) {
    const { data: client } = await admin
      .from("clients").select("name").eq("id", input.clientId).maybeSingle();
    clientName = client?.name ?? null;
  }
  const { data: members } = await admin
    .from("workspace_members").select("user_id").eq("workspace_id", input.workspaceId);

  const link = input.clientId ? `/billing?client=${input.clientId}` : "/billing";
  const moneyStr = formatMoney(input.amount ?? 0, input.currency ?? "usd");
  const title = `${TITLES[input.eventType]}${clientName ? ` · ${clientName}` : ""}`;
  const body = [
    moneyStr,
    input.failureMessage,
    input.customerEmail,
  ].filter(Boolean).join(" · ").slice(0, 200);

  const rows: any[] = [];
  for (const m of members ?? []) {
    // Check pref inline via RPC
    const { data: enabled } = await admin.rpc("notif_pref_enabled", {
      _user_id: m.user_id,
      _workspace_id: input.workspaceId,
      _event_type: "payment_failed",
    });
    if (enabled === false) continue;
    rows.push({
      user_id: m.user_id,
      workspace_id: input.workspaceId,
      type: "payment_failed",
      title,
      body,
      link,
      meta: {
        payment_event_id: upserted.id,
        client_id: input.clientId,
        event_type: input.eventType,
        severity,
        amount: input.amount,
        currency: input.currency,
        failure_code: input.failureCode,
      },
    });
  }
  if (rows.length > 0) {
    await admin.from("notifications").insert(rows);
  }
  return { ok: true, id: upserted.id, notified: rows.length };
}
