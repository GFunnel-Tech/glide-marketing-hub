// supabase/functions/custom-kpi-evaluate/index.ts
// Evaluates all enabled custom KPIs for a workspace and fires alerts.
// Invokable by cron (service role) or by authenticated workspace members.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateFormula, validateFormula, type FormulaNode, type MetricSnapshot } from "../_shared/kpiFormula.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ClientSnapshot {
  client_id: number;
  period_start: string;
  period_end: string;
  snapshot: MetricSnapshot;
}

async function buildSnapshots(admin: any, workspaceId: string, windowDays = 7): Promise<ClientSnapshot[]> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowDays * 86_400_000);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  // Get clients in workspace
  const { data: clients } = await admin
    .from("clients")
    .select("id, double_count, reported_leads, true_leads")
    .eq("workspace_id", workspaceId);

  if (!clients?.length) return [];

  const clientIds = clients.map((c: any) => c.id);

  // Meta insights aggregated per client over the window
  const { data: adAccounts } = await admin
    .from("meta_ad_accounts")
    .select("id, client_id")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds);

  const accountByClient = new Map<number, string[]>();
  (adAccounts ?? []).forEach((a: any) => {
    if (!a.client_id) return;
    const arr = accountByClient.get(a.client_id) ?? [];
    arr.push(a.id);
    accountByClient.set(a.client_id, arr);
  });

  const allAccountIds = (adAccounts ?? []).map((a: any) => a.id);
  const metaByAcc = new Map<string, any>();
  if (allAccountIds.length) {
    const { data: insights } = await admin
      .from("meta_insights_daily")
      .select("ad_account_id, spend, impressions, clicks, leads, frequency")
      .in("ad_account_id", allAccountIds)
      .gte("date", periodStartStr)
      .lte("date", periodEndStr);
    for (const row of insights ?? []) {
      const cur = metaByAcc.get(row.ad_account_id) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0, freqSum: 0, freqN: 0 };
      cur.spend += Number(row.spend ?? 0);
      cur.impressions += Number(row.impressions ?? 0);
      cur.clicks += Number(row.clicks ?? 0);
      cur.leads += Number(row.leads ?? 0);
      if (row.frequency != null) { cur.freqSum += Number(row.frequency); cur.freqN += 1; }
      metaByAcc.set(row.ad_account_id, cur);
    }
  }

  // True leads (deduped) per client
  const { data: leads } = await admin
    .from("meta_leads")
    .select("client_id, lead_id, email, phone")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds)
    .gte("created_time", periodStart.toISOString());

  const trueLeadsByClient = new Map<number, number>();
  const reportedByClient = new Map<number, number>();
  const seenKeys = new Map<number, Set<string>>();
  for (const l of leads ?? []) {
    if (!l.client_id) continue;
    reportedByClient.set(l.client_id, (reportedByClient.get(l.client_id) ?? 0) + 1);
    const key = (l.email || l.phone || l.lead_id || "").toString().trim().toLowerCase();
    if (!key) continue;
    let set = seenKeys.get(l.client_id);
    if (!set) { set = new Set(); seenKeys.set(l.client_id, set); }
    if (!set.has(key)) {
      set.add(key);
      trueLeadsByClient.set(l.client_id, (trueLeadsByClient.get(l.client_id) ?? 0) + 1);
    }
  }

  // GHL aggregates
  const { data: opps } = await admin
    .from("ghl_opportunities")
    .select("client_id, monetary_value, status")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds)
    .gte("synced_at", periodStart.toISOString());
  const oppsByClient = new Map<number, { count: number; value: number; won: number }>();
  for (const o of opps ?? []) {
    if (!o.client_id) continue;
    const c = oppsByClient.get(o.client_id) ?? { count: 0, value: 0, won: 0 };
    c.count += 1;
    c.value += Number(o.monetary_value ?? 0);
    if ((o.status ?? "").toLowerCase() === "won") c.won += 1;
    oppsByClient.set(o.client_id, c);
  }

  const { data: appts } = await admin
    .from("ghl_appointments")
    .select("client_id")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds)
    .gte("start_time", periodStart.toISOString());
  const apptsByClient = new Map<number, number>();
  for (const a of appts ?? []) {
    if (!a.client_id) continue;
    apptsByClient.set(a.client_id, (apptsByClient.get(a.client_id) ?? 0) + 1);
  }

  // Per-client overrides
  const { data: overrides } = await admin
    .from("client_kpi_overrides")
    .select("client_id, overrides")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds);
  const overrideByClient = new Map<number, Record<string, number>>();
  for (const o of overrides ?? []) {
    overrideByClient.set(o.client_id, (o.overrides ?? {}) as Record<string, number>);
  }

  return clients.map((c: any) => {
    const accs = accountByClient.get(c.id) ?? [];
    let spend = 0, impressions = 0, clicks = 0, leads = 0, freqSum = 0, freqN = 0;
    for (const accId of accs) {
      const m = metaByAcc.get(accId);
      if (!m) continue;
      spend += m.spend; impressions += m.impressions; clicks += m.clicks; leads += m.leads;
      freqSum += m.freqSum; freqN += m.freqN;
    }
    const trueLeads = trueLeadsByClient.get(c.id) ?? 0;
    const reported = reportedByClient.get(c.id) ?? 0;
    const ghl = oppsByClient.get(c.id) ?? { count: 0, value: 0, won: 0 };
    const appts = apptsByClient.get(c.id) ?? 0;
    const snap: MetricSnapshot = {
      "meta.spend": spend,
      "meta.impressions": impressions,
      "meta.clicks": clicks,
      "meta.leads": leads,
      "meta.ctr": impressions > 0 ? (clicks / impressions) * 100 : 0,
      "meta.cpm": impressions > 0 ? (spend / impressions) * 1000 : 0,
      "meta.cpl": leads > 0 ? spend / leads : 0,
      "meta.frequency": freqN > 0 ? freqSum / freqN : 0,
      "ghl.opportunities": ghl.count,
      "ghl.appointments": appts,
      "ghl.pipeline_value": ghl.value,
      "ghl.opps_won": ghl.won,
      "leads.true": trueLeads,
      "leads.reported": reported,
      "leads.double_count": c.double_count ? 1 : 0,
    };
    const ovr = overrideByClient.get(c.id) ?? {};
    for (const [k, v] of Object.entries(ovr)) {
      snap[`override.${k}`] = Number(v) || 0;
    }
    return { client_id: c.id, period_start: periodStartStr, period_end: periodEndStr, snapshot: snap };
  });
}

async function evaluateAlerts(admin: any, kpi: any, alerts: any[], snapshots: ClientSnapshot[], evalRows: any[]) {
  const now = new Date();
  for (const alert of alerts) {
    if (!alert.enabled) continue;
    const cooldownMs = (alert.cooldown_minutes ?? 60) * 60_000;
    if (alert.last_fired_at && now.getTime() - new Date(alert.last_fired_at).getTime() < cooldownMs) continue;

    // Determine which clients this alert applies to
    const applicable = snapshots.filter((s) =>
      alert.client_id == null ? (kpi.client_id == null || kpi.client_id === s.client_id) : alert.client_id === s.client_id
    );

    let firedForAny = false;
    for (const snap of applicable) {
      const row = evalRows.find((r) => r.custom_kpi_id === kpi.id && r.client_id === snap.client_id);
      if (!row || row.value == null) continue;
      let triggered = false;
      let detail = "";

      if (alert.trigger_type === "threshold" && alert.threshold) {
        const t = alert.threshold;
        const v = row.value;
        if (t.op === "gt" && v > Number(t.value)) { triggered = true; detail = `${v.toFixed(2)} > ${t.value}`; }
        else if (t.op === "lt" && v < Number(t.value)) { triggered = true; detail = `${v.toFixed(2)} < ${t.value}`; }
        else if (t.op === "between" && (v < Number(t.value) || v > Number(t.value2))) {
          triggered = true; detail = `${v.toFixed(2)} outside [${t.value}, ${t.value2}]`;
        }
      } else if (alert.trigger_type === "trend" && alert.trend) {
        const win = Number(alert.trend.window_days ?? 7);
        const compareStart = new Date(now.getTime() - 2 * win * 86_400_000).toISOString().slice(0, 10);
        const compareEnd = new Date(now.getTime() - win * 86_400_000).toISOString().slice(0, 10);
        const { data: prior } = await admin
          .from("custom_kpi_evaluations")
          .select("value")
          .eq("custom_kpi_id", kpi.id)
          .eq("client_id", snap.client_id)
          .gte("period_end", compareStart)
          .lte("period_end", compareEnd)
          .order("period_end", { ascending: false })
          .limit(1);
        const priorVal = prior?.[0]?.value;
        if (priorVal != null && priorVal !== 0) {
          const pct = ((row.value - priorVal) / Math.abs(priorVal)) * 100;
          const dir = alert.trend.direction ?? "either";
          const threshold = Number(alert.trend.change_pct ?? 20);
          if (
            (dir === "up" && pct >= threshold) ||
            (dir === "down" && pct <= -threshold) ||
            (dir === "either" && Math.abs(pct) >= threshold)
          ) { triggered = true; detail = `${pct.toFixed(1)}% vs prior ${win}d`; }
        }
      }

      if (!triggered) continue;
      firedForAny = true;

      const { data: client } = await admin.from("clients").select("name").eq("id", snap.client_id).maybeSingle();
      const meta = {
        custom_kpi_id: kpi.id,
        alert_id: alert.id,
        client_id: snap.client_id,
        value: row.value,
        severity: alert.severity,
      };
      // Insert notifications for all workspace members who have the pref enabled.
      // Batch into a single statement so the notifications -> webhook trigger
      // dedupes and fires the `custom_kpi_alert` webhook once (not once per member).
      const { data: members } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", kpi.workspace_id);
      const rows = (members ?? []).map((m: any) => ({
        user_id: m.user_id,
        workspace_id: kpi.workspace_id,
        type: "custom_kpi_alert",
        title: `${kpi.name} alert${client?.name ? ` · ${client.name}` : ""}`,
        body: `${alert.severity.toUpperCase()}: ${detail}`,
        link: `/settings/custom-kpis?kpi=${kpi.id}`,
        meta,
      }));
      if (rows.length > 0) await admin.from("notifications").insert(rows);

      // Also fire the per-KPI event so webhooks can subscribe to a specific
      // custom-programmed metric rather than the broad custom_kpi_alert signal.
      await admin.rpc("dispatch_webhook_event", {
        _workspace_id: kpi.workspace_id,
        _event: `custom_kpi.${kpi.id}`,
        _payload: { ...meta, kpi_name: kpi.name, client_name: client?.name ?? null, detail },
      });
    }

    if (firedForAny) {
      await admin.from("custom_kpi_alerts").update({ last_fired_at: now.toISOString() }).eq("id", alert.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const workspaceId: string | undefined = body.workspace_id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Resolve workspaces to evaluate
    let workspaceIds: string[] = [];
    if (workspaceId) {
      workspaceIds = [workspaceId];
    } else {
      const { data: wsRows } = await admin
        .from("custom_kpis")
        .select("workspace_id")
        .eq("enabled", true);
      workspaceIds = Array.from(new Set((wsRows ?? []).map((r: any) => r.workspace_id)));
    }

    const summary: any[] = [];
    for (const wsId of workspaceIds) {
      const { data: kpis } = await admin
        .from("custom_kpis")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("enabled", true);
      if (!kpis?.length) continue;

      const snapshots = await buildSnapshots(admin, wsId, 7);
      const evalRows: any[] = [];

      for (const kpi of kpis) {
        const formula = kpi.formula as FormulaNode;
        if (validateFormula(formula)) continue;
        const applicable = snapshots.filter((s) => kpi.client_id == null || kpi.client_id === s.client_id);
        for (const s of applicable) {
          const value = evaluateFormula(formula, s.snapshot);
          evalRows.push({
            custom_kpi_id: kpi.id,
            workspace_id: wsId,
            client_id: s.client_id,
            period_start: s.period_start,
            period_end: s.period_end,
            value: Number.isFinite(value) ? value : null,
            inputs: s.snapshot,
          });
        }
      }

      if (evalRows.length) {
        await admin.from("custom_kpi_evaluations").insert(evalRows);
      }

      // Alert pass
      const { data: alerts } = await admin
        .from("custom_kpi_alerts")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("enabled", true);
      const byKpi = new Map<string, any[]>();
      for (const a of alerts ?? []) {
        const arr = byKpi.get(a.custom_kpi_id) ?? [];
        arr.push(a);
        byKpi.set(a.custom_kpi_id, arr);
      }
      for (const kpi of kpis) {
        const al = byKpi.get(kpi.id) ?? [];
        if (al.length) await evaluateAlerts(admin, kpi, al, snapshots, evalRows);
      }

      summary.push({ workspace_id: wsId, kpis: kpis.length, evaluations: evalRows.length });
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
