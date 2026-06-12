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

  const summary = {
    clients_scanned: 0,
    insights_created: 0,
    actions_auto_queued: 0,
    errors: [] as string[],
  };

  for (const c of (clients ?? []) as ClientRow[]) {
    summary.clients_scanned++;
    try {
      // forecast
      const { data: forecast } = await admin.rpc("forecast_client_eom", { _client_id: c.id });
      // anomalies
      const { data: anomalies } = await admin.rpc("detect_client_anomalies", { _client_id: c.id });
      const anomalyArr = Array.isArray(anomalies) ? (anomalies as any[]) : [];

      // --- Anomaly insights ---
      for (const a of anomalyArr) {
        const sev = a.severity ?? "info";
        const arrow = a.direction === "up" ? "↑" : "↓";
        const title = `${c.name} · ${a.metric.toUpperCase()} ${arrow} (${a.recent} vs ${a.baseline} baseline)`;
        const body =
          `${a.metric.toUpperCase()} moved ${a.direction} to ${a.recent} ` +
          `from a 14-day baseline of ${a.baseline} (σ=${a.stddev}, z=${a.z_score}).`;
        await admin.from("ai_insights").insert({
          workspace_id: c.workspace_id,
          client_id: c.id,
          kind: "anomaly",
          severity: sev,
          title,
          body,
          metrics: a,
          source: "ai-ops-scan",
        });
        summary.insights_created++;
      }

      // --- Forecast insight (only if we have leads_30d > 0) ---
      const f = forecast as any;
      if (f && f.projected_leads != null) {
        // compare projected vs guarantee if any
        const { data: guarantee } = await admin
          .from("client_guarantees")
          .select("id,name,criteria,deadline,status")
          .eq("workspace_id", c.workspace_id)
          .eq("client_id", c.id)
          .eq("status", "active")
          .maybeSingle();
        let sev: "info" | "warn" | "critical" = "info";
        let body = `Projected end-of-month: $${f.projected_spend} spend, ${f.projected_leads} leads, CPL $${f.projected_cpl ?? "—"}.`;
        if (guarantee?.criteria) {
          const crit = guarantee.criteria as any;
          if (crit?.target_leads && f.projected_leads < crit.target_leads * 0.85) {
            sev = "warn";
            body += ` ⚠️ Pace is ~${Math.round((f.projected_leads / crit.target_leads) * 100)}% of the ${crit.target_leads}-lead guarantee.`;
          }
          if (crit?.target_leads && f.projected_leads < crit.target_leads * 0.6) sev = "critical";
        }
        await admin.from("ai_insights").insert({
          workspace_id: c.workspace_id,
          client_id: c.id,
          kind: "forecast",
          severity: sev,
          title: `${c.name} · EOM forecast`,
          body,
          metrics: f,
          source: "ai-ops-scan",
        });
        summary.insights_created++;
      }

      // --- Safe auto-action: pause worst ad when CPL > 3x baseline AND spend last 3d ≥ $50 ---
      const cplAnom = anomalyArr.find((a) => a.metric === "cpl" && a.direction === "up" && a.severity === "critical");
      if (cplAnom && (c.spend_7d ?? 0) >= 50) {
        const { data: rules } = await admin
          .from("client_optimization_rules")
          .select("enabled,max_cpl_multiplier,min_spend_before_pause")
          .eq("client_id", c.id)
          .maybeSingle();

        if (rules?.enabled) {
          // find the worst ad
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
                reasoning: `AI Operations auto-pause: client-level CPL spiked to ${cplAnom.recent} (z=${cplAnom.z_score}); worst ad "${worst.name}" was running CPL $${worst.cpl}.`,
                status: "approved",
                approved_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (action) {
              summary.actions_auto_queued++;
              await admin.from("ai_insights").insert({
                workspace_id: c.workspace_id,
                client_id: c.id,
                kind: "recommendation",
                severity: "warn",
                title: `${c.name} · Auto-paused worst ad`,
                body: `Paused "${worst.name}" (CPL $${worst.cpl}). Account CPL z-score ${cplAnom.z_score}.`,
                metrics: { ad: worst, anomaly: cplAnom },
                source: "ai-ops-scan",
                related_action_id: action.id,
                status: "acted_on",
              });
            }
          }
        }
      }
    } catch (e) {
      summary.errors.push(`client ${c.id}: ${(e as Error).message}`);
    }
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
