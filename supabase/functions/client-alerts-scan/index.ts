// Scans clients for status transitions to RED and for failed Stripe charges,
// and inserts in-app notifications for every workspace member.
// Schedule via pg_cron every 15 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_BASE_URL = "https://metahub.gfunnel.com";

function kpiLabel(k: string) {
  switch (k) {
    case "cpl": return "Cost Per Lead";
    case "cpm": return "CPM";
    case "frequency": return "Frequency";
    case "leads": return "Lead Volume";
    case "lead_quality": return "Lead Quality";
    default: return k;
  }
}

function describeRed(items: any[]) {
  return items.map((it) => {
    const label = kpiLabel(it.key);
    const v = Number(it.value);
    const valStr = Number.isFinite(v) ? (v % 1 === 0 ? v.toString() : v.toFixed(2)) : String(it.value);
    return `${label}: ${valStr}`;
  }).join(" · ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stats = { workspaces: 0, statusAlerts: 0, paymentAlerts: 0, errors: [] as string[] };

  try {
    const { data: workspaces } = await admin.from("workspaces").select("id, name");
    stats.workspaces = workspaces?.length ?? 0;

    for (const ws of workspaces ?? []) {
      // Resolve workspace members to notify
      const { data: members } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", ws.id);
      const memberIds = (members ?? []).map((m: any) => m.user_id);
      if (memberIds.length === 0) continue;

      // ===================== KPI RED status alerts =====================
      // Never alert on off/terminal accounts (cancelled, pending cancellation,
      // blocked, paused) — they're intentionally inactive.
      const { data: clients } = await admin
        .from("clients")
        .select("id, name, status, last_alert_status")
        .eq("workspace_id", ws.id)
        .not("status", "in", "(CANCELLED,PENDING_CANCELLATION,BLOCKED,PAUSED)");

      for (const c of clients ?? []) {
        try {
          const { data: newStatus } = await admin.rpc("compute_client_status" as any, { _client_id: c.id });
          if (!newStatus) continue;

          // Persist computed status onto clients (keeps row in sync between cron runs)
          if (newStatus !== c.status) {
            await admin.from("clients").update({ status: newStatus }).eq("id", c.id);
          }

          if (newStatus === "RED" && c.last_alert_status !== "RED") {
            const { data: redKpis } = await admin.rpc("client_red_kpis" as any, { _client_id: c.id });
            const reasons = Array.isArray(redKpis) ? redKpis : [];
            const body = reasons.length
              ? `Red KPIs — ${describeRed(reasons)}`
              : "Client health turned red.";

            const rows = memberIds.map((uid) => ({
              user_id: uid,
              workspace_id: ws.id,
              type: "client_status_red",
              title: `${c.name} is in the RED`,
              body,
              link: `${APP_BASE_URL}/clients/${c.id}`,
              meta: { client_id: c.id, status: newStatus, red_kpis: reasons },
            }));
            const { error: nerr } = await admin.from("notifications").insert(rows);
            if (nerr) stats.errors.push(`notif client ${c.id}: ${nerr.message}`);
            else stats.statusAlerts += rows.length;

            await admin.from("clients")
              .update({ last_alert_status: "RED", last_alert_at: new Date().toISOString() })
              .eq("id", c.id);
          } else if (newStatus !== "RED" && c.last_alert_status === "RED") {
            // recovered — reset so a future RED triggers a new alert
            await admin.from("clients").update({ last_alert_status: newStatus }).eq("id", c.id);
          }
        } catch (e: any) {
          stats.errors.push(`client ${c.id}: ${e?.message || e}`);
        }
      }

      // ===================== Failed Stripe charge alerts =====================
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: failedCharges } = await admin
        .from("stripe_charges")
        .select("id, client_id, amount, currency, failure_message, failure_code, customer_email, created_at_stripe")
        .eq("workspace_id", ws.id)
        .eq("status", "failed")
        .is("alert_sent_at", null)
        .gte("created_at_stripe", since);

      for (const ch of failedCharges ?? []) {
        try {
          const { data: cl } = await admin
            .from("clients").select("name").eq("id", ch.client_id).maybeSingle();
          const clientName = (cl as any)?.name ?? `Client #${ch.client_id}`;
          const amt = (ch.amount ?? 0) / 100;
          const cur = (ch.currency ?? "usd").toUpperCase();
          const why = ch.failure_message || ch.failure_code || "Payment failed";
          const rows = memberIds.map((uid) => ({
            user_id: uid,
            workspace_id: ws.id,
            type: "payment_failed",
            title: `Payment failed · ${clientName}`,
            body: `${cur} ${amt.toFixed(2)}${ch.customer_email ? ` · ${ch.customer_email}` : ""} — ${why}`,
            link: `${APP_BASE_URL}/clients/${ch.client_id}`,
            meta: {
              client_id: ch.client_id,
              charge_id: ch.id,
              amount: ch.amount,
              currency: ch.currency,
              failure_code: ch.failure_code,
            },
          }));
          const { error: nerr } = await admin.from("notifications").insert(rows);
          if (nerr) {
            stats.errors.push(`payment notif ${ch.id}: ${nerr.message}`);
            continue;
          }
          stats.paymentAlerts += rows.length;
          await admin.from("stripe_charges")
            .update({ alert_sent_at: new Date().toISOString() })
            .eq("id", ch.id);
        } catch (e: any) {
          stats.errors.push(`charge ${ch.id}: ${e?.message || e}`);
        }
      }
    }

    return json({ ok: true, ...stats });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e), ...stats }, 500);
  }
});
