// Deterministic AI Operations scan.
// Walks every active client in every workspace, computes anomalies + EOM forecast,
// inserts ai_insights rows, and auto-queues "safe" pause actions when CPL is
// catastrophically above baseline.
//
// Triggered by cron (every 30 min) and on-demand via POST.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ClientRow {
  id: number;
  workspace_id: string;
  name: string;
  status: string;
  spend_7d: number | null;
  leads_7d: number | null;
  cpl_7d: number | null;
  cpl_30d: number | null;
  cpl_wow_pct: number | null;
  frequency_7d: number | null;
}

async function scanWorkspace(admin: ReturnType<typeof createClient>, workspaceId?: string) {
  let q = admin.from("v_client_kpi_snapshot").select("*");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data: clients, error } = await q;
  if (error) throw new Error(error.message);

  // Clear previous open insights so we don't pile up duplicates each scan
  let delQ = admin.from("ai_insights").delete().eq("source", "ai-ops-scan").eq("status", "open");
  if (workspaceId) delQ = delQ.eq("workspace_id", workspaceId);
  await delQ;

  const summary = {
    clients_scanned: 0,
    insights_created: 0,
    actions_auto_queued: 0,
    errors: [] as string[],
  };

  const insightsBatch: any[] = [];
  const list = (clients ?? []) as ClientRow[];

  async function processClient(c: ClientRow) {
    summary.clients_scanned++;
    try {
      // Run all reads for this client in parallel
      const [forecastRes, anomaliesRes, redKpisRes, guaranteeRes, rulesRes] = await Promise.all([
        admin.rpc("forecast_client_eom", { _client_id: c.id }),
        admin.rpc("detect_client_anomalies", { _client_id: c.id }),
        admin.rpc("client_red_kpis", { _client_id: c.id }),
        admin.from("client_guarantees").select("id,name,criteria,deadline,status").eq("workspace_id", c.workspace_id).eq("client_id", c.id).eq("status", "active").maybeSingle(),
        admin.from("client_optimization_rules").select("enabled,max_cpl_multiplier,min_spend_before_pause").eq("client_id", c.id).maybeSingle(),
      ]);

      const forecast = forecastRes.data as any;
      const anomalyArr = Array.isArray(anomaliesRes.data) ? (anomaliesRes.data as any[]) : [];
      const redArr = Array.isArray(redKpisRes.data) ? (redKpisRes.data as any[]) : [];
      const guarantee = guaranteeRes.data as any;
      const rules = rulesRes.data as any;

      for (const r of redArr) {
        insightsBatch.push({
          workspace_id: c.workspace_id,
          client_id: c.id,
          kind: "recommendation",
          severity: "warn",
          title: `${c.name} · ${String(r.key).toUpperCase()} out of threshold (${r.value})`,
          body: `${r.key} is ${r.value}; configured ${r.direction === "lower" ? "max" : r.direction === "higher" ? "min" : "band"} threshold breached.`,
          metrics: r,
          source: "ai-ops-scan",
        });
      }

      for (const a of anomalyArr) {
        const arrow = a.direction === "up" ? "↑" : "↓";
        insightsBatch.push({
          workspace_id: c.workspace_id,
          client_id: c.id,
          kind: "anomaly",
          severity: a.severity ?? "info",
          title: `${c.name} · ${a.metric.toUpperCase()} ${arrow} (${a.recent} vs ${a.baseline} baseline)`,
          body: `${a.metric.toUpperCase()} moved ${a.direction} to ${a.recent} from a 14-day baseline of ${a.baseline} (σ=${a.stddev}, z=${a.z_score}).`,
          metrics: a,
          source: "ai-ops-scan",
        });
      }

      if (forecast && forecast.projected_leads != null && Number(forecast.projected_leads) > 0) {
        let sev: "info" | "warn" | "critical" = "info";
        let body = `Projected end-of-month: $${forecast.projected_spend} spend, ${forecast.projected_leads} leads, CPL $${forecast.projected_cpl ?? "—"}.`;
        if (guarantee?.criteria) {
          const crit = guarantee.criteria as any;
          if (crit?.target_leads && forecast.projected_leads < crit.target_leads * 0.85) {
            sev = "warn";
            body += ` ⚠️ Pace is ~${Math.round((forecast.projected_leads / crit.target_leads) * 100)}% of the ${crit.target_leads}-lead guarantee.`;
          }
          if (crit?.target_leads && forecast.projected_leads < crit.target_leads * 0.6) sev = "critical";
        }
        insightsBatch.push({
          workspace_id: c.workspace_id,
          client_id: c.id,
          kind: "forecast",
          severity: sev,
          title: `${c.name} · EOM forecast`,
          body,
          metrics: forecast,
          source: "ai-ops-scan",
        });
      }

      // Safe auto-action
      const cplAnom = anomalyArr.find((a) => a.metric === "cpl" && a.direction === "up" && a.severity === "critical");
      if (cplAnom && (c.spend_7d ?? 0) >= 50 && rules?.enabled) {
        const { data: ads } = await admin
          .from("meta_ads")
          .select("id,ad_id,name,spend,leads,cpl,effective_status")
          .eq("client_id", c.id)
          .eq("effective_status", "ACTIVE")
          .gte("spend", rules.min_spend_before_pause ?? 50)
          .order("cpl", { ascending: false })
          .limit(1);
        const worst = (ads ?? [])[0];
        if (worst) {
          const { data: action } = await admin
            .from("ai_pending_actions")
            .insert({
              workspace_id: c.workspace_id,
              client_id: c.id,
              proposed_by: null,
              action_type: "pause_ads",
              payload: { ad_ids: [worst.ad_id], reason: `Auto-paused: CPL $${worst.cpl} (z=${cplAnom.z_score}) on $${worst.spend} spend.` },
              reasoning: `AI Operations auto-pause: client-level CPL z=${cplAnom.z_score}; worst ad "${worst.name}" CPL $${worst.cpl}.`,
              status: "approved",
              approved_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (action) {
            summary.actions_auto_queued++;
            insightsBatch.push({
              workspace_id: c.workspace_id,
              client_id: c.id,
              kind: "recommendation",
              severity: "warn",
              title: `${c.name} · Auto-paused worst ad`,
              body: `Paused "${worst.name}" (CPL $${worst.cpl}). Account CPL z=${cplAnom.z_score}.`,
              metrics: { ad: worst, anomaly: cplAnom },
              source: "ai-ops-scan",
              related_action_id: action.id,
              status: "acted_on",
            });
          }
        }
      }
    } catch (e) {
      summary.errors.push(`client ${c.id}: ${(e as Error).message}`);
    }
  }

  // Process clients in parallel chunks of 10
  const CHUNK = 10;
  for (let i = 0; i < list.length; i += CHUNK) {
    await Promise.all(list.slice(i, i + CHUNK).map(processClient));
  }

  // Bulk insert all insights
  if (insightsBatch.length > 0) {
    const { error: insErr } = await admin.from("ai_insights").insert(insightsBatch);
    if (insErr) summary.errors.push(`insights insert: ${insErr.message}`);
    else summary.insights_created = insightsBatch.length;
  }

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let workspaceId: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      workspaceId = body?.workspaceId;
    }
    const result = await scanWorkspace(admin, workspaceId);
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
