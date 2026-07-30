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
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const AI_SYSTEM = `You are an ad-account optimization analyst.
Given a client's recent metrics, their goals, custom KPIs, plain-English rules, and free-text context, propose 0–5 concrete actions for a human to approve.

Allowed action types: "pause_ads", "unpause_ads", "adjust_budget", "swap_creative", "flag_only".

Return ONLY JSON: { "actions": [ { "action_type": "...", "payload": {...}, "reasoning": "...", "confidence": 0.0-1.0, "severity": "info"|"warn"|"critical" } ] }
- Use "flag_only" when unsure or when human judgment is needed.
- "payload" for pause_ads/unpause_ads: { "ad_ids": ["..."] }
- "payload" for adjust_budget: { "adset_id": "...", "budget_percent": -25 }  (negative to reduce)
- "payload" for swap_creative: { "ad_id": "...", "new_creative_id": "..." }
- "payload" for flag_only: { "title": "...", "body": "...", "notify_severity": "warn" }
- Only propose actions justified by the data. If nothing is wrong, return { "actions": [] }.
- Respect the client's context (goals, constraints, hours of operation) above raw metrics.`;

async function proposeAiActions(admin: any, client: ClientRow): Promise<number> {
  if (!LOVABLE_KEY) return 0;
  try {
    const [rulesRes, aiRulesRes, kpisRes, ctxRes, adsRes] = await Promise.all([
      admin.from("client_optimization_rules").select("*").eq("client_id", client.client_id).maybeSingle(),
      admin.from("client_ai_rules").select("prompt,parsed_spec,enabled").eq("client_id", client.client_id).eq("enabled", true),
      admin.from("custom_kpis").select("name,kind,manual_value,last_external_value,direction,unit")
        .eq("workspace_id", client.workspace_id)
        .or(`client_id.is.null,client_id.eq.${client.client_id}`),
      admin.from("clients").select("ai_context").eq("id", client.client_id).maybeSingle(),
      admin.from("meta_ads").select("ad_id,name,spend,leads,cpl,ctr,frequency,effective_status,adset_id,creative_id")
        .eq("client_id", client.client_id).eq("effective_status", "ACTIVE").order("spend", { ascending: false }).limit(15),
    ]);

    const aiContext = (ctxRes.data as any)?.ai_context ?? "";
    const aiRules = (aiRulesRes.data ?? []) as any[];
    const kpis = (kpisRes.data ?? []) as any[];
    const ads = (adsRes.data ?? []) as any[];

    // Skip if no AI inputs at all
    if (!aiContext && aiRules.length === 0 && kpis.length === 0) return 0;

    const userPayload = {
      client: { id: client.client_id, name: client.name, status: client.status },
      metrics: {
        spend_7d: client.spend_7d, leads_7d: client.leads_7d, cpl_7d: client.cpl_7d,
        cpl_30d: client.cpl_30d, cpl_wow_pct: client.cpl_wow_pct, frequency_7d: client.frequency_7d,
      },
      context: aiContext,
      plain_english_rules: aiRules.map((r) => ({ prompt: r.prompt, spec: r.parsed_spec })),
      custom_kpis: kpis.map((k) => ({
        name: k.name, kind: k.kind, direction: k.direction, unit: k.unit,
        value: k.kind === "manual" ? k.manual_value : k.kind === "external" ? k.last_external_value : null,
      })),
      structured_rules: rulesRes.data,
      top_active_ads: ads,
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_SYSTEM },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    if (!aiRes.ok) {
      console.warn(`[ai-ops-scan] AI ${aiRes.status} for client ${client.client_id}`);
      return 0;
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content) return 0;
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { return 0; }
    const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    if (actions.length === 0) return 0;

    const rows = actions.slice(0, 5).map((a: any) => ({
      workspace_id: client.workspace_id,
      client_id: client.client_id,
      proposed_by: null,
      action_type: a.action_type,
      payload: { ...a.payload, context: userPayload, confidence: a.confidence, severity: a.severity },
      reasoning: a.reasoning || "AI proposal",
      status: "pending",
    }));
    const { error } = await admin.from("ai_pending_actions").insert(rows);
    if (error) {
      console.warn(`[ai-ops-scan] action insert failed: ${error.message}`);
      return 0;
    }
    return rows.length;
  } catch (e) {
    console.warn(`[ai-ops-scan] proposeAiActions error: ${(e as Error).message}`);
    return 0;
  }
}

interface ClientRow {
  client_id: number;
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

// Cancelled / pending-cancellation / blocked / paused clients are off the board:
// they must never produce insights, tasks or alerts.
const INACTIVE_STATUSES = ["CANCELLED", "PENDING_CANCELLATION", "BLOCKED", "PAUSED"];

async function scanWorkspace(admin: ReturnType<typeof createClient>, workspaceId?: string) {
  let q = admin
    .from("v_client_kpi_snapshot")
    .select("*")
    .not("status", "in", `(${INACTIVE_STATUSES.join(",")})`);
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
    // Skip clients with no meaningful 7-day activity — flagging "LEADS out of
    // threshold (0)" for a client that isn't actively spending is noise.
    const spend7 = Number(c.spend_7d ?? 0);
    if (spend7 < 25) return;
    try {
      // Run all reads for this client in parallel
      const [forecastRes, anomaliesRes, redKpisRes, guaranteeRes, rulesRes] = await Promise.all([
        admin.rpc("forecast_client_eom", { _client_id: c.client_id }),
        admin.rpc("detect_client_anomalies", { _client_id: c.client_id }),
        admin.rpc("client_red_kpis", { _client_id: c.client_id }),
        admin.from("client_guarantees").select("id,name,criteria,deadline,status").eq("workspace_id", c.workspace_id).eq("client_id", c.client_id).eq("status", "active").maybeSingle(),
        admin.from("client_optimization_rules").select("enabled,max_cpl_multiplier,min_spend_before_pause").eq("client_id", c.client_id).maybeSingle(),
      ]);

      const forecast = forecastRes.data as any;
      const anomalyArr = Array.isArray(anomaliesRes.data) ? (anomaliesRes.data as any[]) : [];
      const redArr = Array.isArray(redKpisRes.data) ? (redKpisRes.data as any[]) : [];
      const guarantee = guaranteeRes.data as any;
      const rules = rulesRes.data as any;

      if (redArr.length > 0) {
        const keys = redArr.map((r: any) => String(r.key).toUpperCase());
        const title =
          redArr.length === 1
            ? `${c.name} · ${keys[0]} out of threshold (${redArr[0].value})`
            : `${c.name} · ${redArr.length} KPIs out of threshold`;
        const body = redArr
          .map((r: any) => `${String(r.key).toUpperCase()}=${r.value} (${r.direction === "lower" ? "max" : r.direction === "higher" ? "min" : "band"} breached)`)
          .join(" · ");
        insightsBatch.push({
          workspace_id: c.workspace_id,
          client_id: c.client_id,
          kind: "recommendation",
          severity: "warn",
          title,
          body,
          metrics: { red_kpis: redArr },
          source: "ai-ops-scan",
        });
      }

      for (const a of anomalyArr) {
        const arrow = a.direction === "up" ? "↑" : "↓";
        insightsBatch.push({
          workspace_id: c.workspace_id,
          client_id: c.client_id,
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
          client_id: c.client_id,
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
          .eq("client_id", c.client_id)
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
              client_id: c.client_id,
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
              client_id: c.client_id,
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

      // AI-driven proposals (uses ai_context, client_ai_rules, custom_kpis).
      // Always status='pending' — never auto-executed.
      const proposed = await proposeAiActions(admin, c);
      if (proposed > 0) summary.actions_auto_queued += proposed;
    } catch (e) {
      summary.errors.push(`client ${c.client_id}: ${(e as Error).message}`);
    }
  }

  // Process clients in parallel chunks of 10
  const CHUNK = 10;
  for (let i = 0; i < list.length; i += CHUNK) {
    await Promise.all(list.slice(i, i + CHUNK).map(processClient));
  }

  console.log(`[ai-ops-scan] built ${insightsBatch.length} insights from ${list.length} clients; errors=${summary.errors.length}`);

  // Bulk insert all insights
  if (insightsBatch.length > 0) {
    const { error: insErr } = await admin.from("ai_insights").insert(insightsBatch);
    if (insErr) {
      console.error("[ai-ops-scan] insert failed:", insErr.message);
      summary.errors.push(`insights insert: ${insErr.message}`);
    } else {
      summary.insights_created = insightsBatch.length;
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
