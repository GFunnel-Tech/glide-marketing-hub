// Detects ad-account billing / payment problems (Meta account_status) and
// raises TOP-PRIORITY payment alerts: a row in public.payment_events plus an
// in-app notification for every workspace member. Auto-resolves alerts once
// the account is healthy again. Runs hourly on cron, right after
// meta-accounts-refresh has updated account_status.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Meta ad account statuses that mean "money problem / cannot deliver".
// 2 = DISABLED, 3 = UNSETTLED (unpaid balance), 7 = PENDING_RISK_REVIEW,
// 8 = PENDING_SETTLEMENT, 9 = IN_GRACE_PERIOD (payment overdue).
const BILLING_STATUS: Record<number, { type: string; label: string; severity: "critical" | "warn" }> = {
  2: { type: "ad_account_disabled", label: "Ad account disabled", severity: "critical" },
  3: { type: "ad_account_unsettled", label: "Ad account has an unpaid balance", severity: "critical" },
  7: { type: "ad_account_risk_review", label: "Ad account pending risk review", severity: "warn" },
  8: { type: "ad_account_pending_settlement", label: "Ad account pending settlement", severity: "critical" },
  9: { type: "ad_account_grace_period", label: "Ad account payment overdue (grace period)", severity: "critical" },
};

const ALERT_TYPES = Object.values(BILLING_STATUS).map((v) => v.type);

// Clients we intentionally stop nagging about.
const DEAD_CLIENT_STATUSES = ["CANCELLED"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: accounts, error: accErr } = await admin
      .from("meta_ad_accounts")
      .select("id,workspace_id,client_id,act_id,account_name,account_status");
    if (accErr) throw accErr;

    const { data: clients } = await admin.from("clients").select("id,name,status");
    const clientById = new Map<number, { name: string; status: string }>();
    for (const c of clients ?? []) clientById.set(c.id, { name: c.name, status: c.status });

    // Workspace members cached per workspace so we notify once per person.
    const membersCache = new Map<string, string[]>();
    async function membersOf(wsId: string): Promise<string[]> {
      if (membersCache.has(wsId)) return membersCache.get(wsId)!;
      const { data } = await admin
        .from("workspace_members").select("user_id").eq("workspace_id", wsId);
      const ids = (data ?? []).map((m: any) => m.user_id);
      membersCache.set(wsId, ids);
      return ids;
    }

    // Existing open alerts keyed by act_id + type so we can dedupe / resolve.
    const { data: openEvents } = await admin
      .from("payment_events")
      .select("id,stripe_charge_id,event_type,status,client_id,workspace_id")
      .eq("stripe_user_id", "meta")
      .neq("status", "resolved");
    const openByKey = new Map<string, any>();
    for (const e of openEvents ?? []) openByKey.set(`${e.stripe_charge_id}|${e.event_type}`, e);

    let created = 0, notified = 0, resolved = 0;
    const stillBroken = new Set<string>();

    // De-dup accounts: the same act_id can be linked through several connections.
    const seen = new Set<string>();

    for (const a of accounts ?? []) {
      if (!a.workspace_id || !a.act_id) continue;
      const status = Number(a.account_status ?? 1);
      const rule = BILLING_STATUS[status];
      if (!rule) continue;
      if (seen.has(`${a.act_id}|${rule.type}`)) continue;
      seen.add(`${a.act_id}|${rule.type}`);

      const client = a.client_id ? clientById.get(a.client_id) : null;
      if (client && DEAD_CLIENT_STATUSES.includes(client.status)) continue;

      const key = `${a.act_id}|${rule.type}`;
      stillBroken.add(key);
      if (openByKey.has(key)) continue; // already alerted and unresolved

      const label = client?.name ?? a.account_name ?? a.act_id;
      const { data: inserted, error: insErr } = await admin
        .from("payment_events")
        .insert({
          workspace_id: a.workspace_id,
          client_id: a.client_id ?? null,
          stripe_user_id: "meta",
          stripe_charge_id: a.act_id,
          customer_email: null,
          event_type: rule.type,
          severity: rule.severity,
          status: "open",
          amount: 0,
          currency: "usd",
          failure_code: `meta_account_status_${status}`,
          failure_message: `${rule.label} — Meta ad account ${a.act_id} (status ${status}). Ads cannot deliver until billing is fixed.`,
          description: a.account_name ?? null,
          raw: { source: "ad-account-billing-scan", act_id: a.act_id, account_status: status },
        })
        .select("id")
        .maybeSingle();
      if (insErr) { console.error("payment_events insert failed", insErr); continue; }
      created++;

      // Payment alerts are top priority: notify every member, ignore prefs.
      const rows = (await membersOf(a.workspace_id)).map((uid) => ({
        user_id: uid,
        workspace_id: a.workspace_id,
        type: "payment_failed",
        title: `Payment issue · ${label}`,
        body: `${rule.label} (${a.act_id}). Ads can't deliver until billing is fixed.`,
        link: a.client_id ? `/billing?client=${a.client_id}` : "/billing",
        meta: {
          payment_event_id: inserted?.id ?? null,
          client_id: a.client_id,
          act_id: a.act_id,
          event_type: rule.type,
          severity: rule.severity,
          priority: "critical",
        },
      }));
      if (rows.length) {
        await admin.from("notifications").insert(rows);
        notified += rows.length;
      }
    }

    // Auto-resolve alerts whose account is healthy again.
    for (const [key, ev] of openByKey) {
      if (stillBroken.has(key)) continue;
      if (!ALERT_TYPES.includes(ev.event_type)) continue;
      await admin
        .from("payment_events")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_note: "Ad account billing back to normal (auto-resolved).",
        })
        .eq("id", ev.id);
      resolved++;
    }

    console.log(`[ad-account-billing-scan] created=${created} notified=${notified} resolved=${resolved}`);
    return json({ ok: true, created, notified, resolved, open: stillBroken.size });
  } catch (e) {
    console.error("[ad-account-billing-scan]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
