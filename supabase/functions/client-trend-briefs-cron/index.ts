// Client Trend Briefs — daily detector & AI drafter.
// Scans active clients per workspace, computes 7d vs prior 14d trend for CPM/CPL/leads,
// detects spikes/drops + seasonal/holiday context (US calendar), and creates DRAFT briefs
// in `client_trend_briefs` for human review/approval before sending.
//
// Body (all optional): { workspaceId?: string, clientId?: number, force?: boolean, kind?: "weekly_digest" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { anthropicCompatMessages, getDeepseekKey } from "../_shared/deepseek.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_API_KEY = getDeepseekKey();
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = Deno.env.get("AI_OPS_MODEL") ?? Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-chat";

type Kind = "cpm_spike" | "cpl_spike" | "leads_drop" | "weekly_digest" | "seasonal";

interface TrendMetrics {
  recent: { spend: number; impressions: number; leads: number; cpm: number; cpl: number };
  prior: { spend: number; impressions: number; leads: number; cpm: number; cpl: number };
  delta: { cpm_pct: number; cpl_pct: number; leads_pct: number };
}

// Simple US holiday / seasonal pressure calendar (auction-pressure windows).
function seasonalContext(today: Date): string | null {
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (m === 7 && d <= 6) return "Independence Day (July 4) auction pressure — retailers and political advertisers dramatically increase Meta bids the week of July 4, inflating CPMs across nearly every vertical.";
  if (m === 11 && d >= 20) return "Black Friday / Cyber Monday auction pressure — Q4 retail spend peaks, pushing CPMs to their highest levels of the year.";
  if (m === 12 && d >= 1 && d <= 26) return "Holiday shopping season — heavy retail spend on Meta inflates CPMs and CPLs across most verticals.";
  if (m === 2 && d >= 1 && d <= 14) return "Super Bowl / Valentine's Day window — brand and retail spend surge briefly raises auction pressure.";
  if (m === 10 && d >= 25) return "Halloween + pre-election spend — political advertisers (in election years) and retail Halloween spend lift CPMs.";
  if (m === 5 && d >= 8 && d <= 14) return "Mother's Day retail surge — gifting verticals briefly raise CPMs.";
  return null;
}

function pct(a: number, b: number): number {
  if (!b) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

async function fetchTrend(supabase: any, workspaceId: string, clientId: number, today: Date): Promise<TrendMetrics | null> {
  // Pull last 21 days of meta_insights_daily for this client's ad accounts.
  const start = new Date(today); start.setUTCDate(start.getUTCDate() - 21);
  const startStr = start.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: map } = await supabase
    .from("meta_ad_account_clients")
    .select("ad_account_id")
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId);
  const accountIds = (map ?? []).map((m: any) => m.ad_account_id);
  if (!accountIds.length) return null;

  const { data: rows } = await supabase
    .from("meta_insights_daily")
    .select("date, spend, impressions, leads, cpm, cpl")
    .in("ad_account_id", accountIds)
    .gte("date", startStr)
    .lt("date", todayStr);
  if (!rows?.length) return null;

  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let R = { spend: 0, impressions: 0, leads: 0 };
  let P = { spend: 0, impressions: 0, leads: 0 };
  for (const r of rows) {
    const bucket = r.date >= cutoffStr ? R : P;
    bucket.spend += Number(r.spend ?? 0);
    bucket.impressions += Number(r.impressions ?? 0);
    bucket.leads += Number(r.leads ?? 0);
  }
  const calc = (b: typeof R) => ({
    ...b,
    cpm: b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0,
    cpl: b.leads > 0 ? b.spend / b.leads : 0,
  });
  const recent = calc(R);
  const prior = calc(P);
  return {
    recent, prior,
    delta: {
      cpm_pct: pct(recent.cpm, prior.cpm),
      cpl_pct: pct(recent.cpl, prior.cpl),
      leads_pct: pct(recent.leads, prior.leads),
    },
  };
}

function detect(metrics: TrendMetrics, thresholds: { cpm: number; cpl: number; leads: number }): { kinds: Kind[]; severity: "info" | "warning" | "critical" } {
  const kinds: Kind[] = [];
  if (metrics.delta.cpm_pct >= thresholds.cpm) kinds.push("cpm_spike");
  if (metrics.delta.cpl_pct >= thresholds.cpl) kinds.push("cpl_spike");
  if (metrics.delta.leads_pct <= -thresholds.leads && metrics.prior.leads >= 5) kinds.push("leads_drop");
  const worst = Math.max(metrics.delta.cpm_pct, metrics.delta.cpl_pct, -metrics.delta.leads_pct);
  const severity = worst >= 60 ? "critical" : worst >= 35 ? "warning" : "info";
  return { kinds, severity };
}

async function generateAi(payload: any): Promise<{ subject: string; body_markdown: string } | null> {
  const system = `You write short, calm, client-facing email briefings from a Meta ads agency to their client.
You will receive JSON with: the client's business name, what trends fired, the metrics, and any seasonal/holiday auction-pressure context.

Return ONLY a JSON object:
{
  "subject": "short, plain-English subject line (no emojis, no marketing words)",
  "body_markdown": "the email body in markdown. 3-5 short paragraphs. Open by naming the trend in human terms (e.g. 'CPMs are running ~32% higher than usual this week'). Explain the cause when there's seasonal context. Then describe the specific actions we are taking on their account this week to protect performance (creative refresh, audience tightening, dayparting, budget pacing, etc — pick what fits). Close with a confident, calm one-liner. No emoji. No buzzwords. No promises about results."
}

Rules:
- Always use the client's real business name. Never write "Client #123".
- Talk like a senior account manager writing to a smart business owner. No fluff.
- Cite the actual percent change from the metrics. Round to whole numbers.
- If seasonal context is provided, explicitly mention it as the likely cause.
- If multiple trends fired, cover them together — do not list them mechanically.
- Never give specific numeric guarantees.`;

  try {
    if (AI_API_KEY) {
      const { ok, data: j } = await anthropicCompatMessages({
        model: MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      });
      if (ok) {
        const txt = j?.content?.[0]?.text ?? "";
        const m = txt.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      }
      console.error("deepseek trend brief failed", j?.error?.message);
    }
    if (LOVABLE_API_KEY) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(payload) },
          ],
        }),
      });
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content ?? "";
      const m = txt.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    }
  } catch (e) {
    console.error("AI generation failed:", e);
  }
  return null;
}

async function processWorkspace(supabase: any, workspaceId: string, force: boolean, kindOverride?: "weekly_digest", onlyClient?: number) {
  const today = new Date();
  const isMonday = today.getUTCDay() === 1;

  const { data: settings } = await supabase
    .from("workspace_kpi_settings")
    .select("brief_cpm_spike_pct, brief_cpl_spike_pct, brief_leads_drop_pct, brief_weekly_digest_enabled, brief_auto_detect_enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const thresholds = {
    cpm: Number(settings?.brief_cpm_spike_pct ?? 25),
    cpl: Number(settings?.brief_cpl_spike_pct ?? 25),
    leads: Number(settings?.brief_leads_drop_pct ?? 30),
  };
  const weeklyOn = settings?.brief_weekly_digest_enabled ?? true;
  const autoOn = settings?.brief_auto_detect_enabled ?? true;

  let cq = supabase
    .from("clients")
    .select("id, name, status, launched_at, brief_enabled, brief_recipients, brief_seasonal_context")
    .eq("workspace_id", workspaceId)
    .eq("brief_enabled", true)
    .in("status", ["GREEN", "YELLOW", "RED", "LEARNING", "LAUNCHING", "RELAUNCH"]);
  if (onlyClient) cq = cq.eq("id", onlyClient);
  const { data: clients } = await cq;

  const season = seasonalContext(today);
  const results: any[] = [];

  for (const client of clients ?? []) {
    if (client.launched_at) {
      const launched = new Date(client.launched_at);
      const days = (today.getTime() - launched.getTime()) / 86400000;
      if (days < 3) continue;
    }
    const metrics = await fetchTrend(supabase, workspaceId, client.id, today);
    if (!metrics) continue;

    let kinds: Kind[] = [];
    let severity: "info" | "warning" | "critical" = "info";

    if (kindOverride === "weekly_digest" || (weeklyOn && isMonday)) {
      kinds.push("weekly_digest");
    }
    if (autoOn || force) {
      const det = detect(metrics, thresholds);
      kinds.push(...det.kinds);
      if (det.severity === "critical" || (severity !== "critical" && det.severity === "warning")) severity = det.severity;
    }
    if (season && (metrics.delta.cpm_pct >= 15 || metrics.delta.cpl_pct >= 15)) {
      if (!kinds.includes("seasonal")) kinds.push("seasonal");
    }
    if (!kinds.length) continue;

    const primaryKind: Kind = kinds.includes("leads_drop") ? "leads_drop"
      : kinds.includes("cpl_spike") ? "cpl_spike"
      : kinds.includes("cpm_spike") ? "cpm_spike"
      : kinds.includes("seasonal") ? "seasonal"
      : "weekly_digest";

    const dedupe = `${primaryKind}-${today.toISOString().slice(0, 10)}`;
    if (!force) {
      const { data: existing } = await supabase
        .from("client_trend_briefs")
        .select("id")
        .eq("client_id", client.id)
        .eq("dedupe_key", dedupe)
        .maybeSingle();
      if (existing) continue;
    }

    const aiPayload = {
      business_name: client.name,
      trends_fired: kinds,
      metrics: {
        last_7d: {
          spend: Math.round(metrics.recent.spend),
          leads: metrics.recent.leads,
          cpm: Math.round(metrics.recent.cpm * 100) / 100,
          cpl: Math.round(metrics.recent.cpl * 100) / 100,
        },
        prior_14d_avg: {
          spend: Math.round(metrics.prior.spend / 2),
          leads: Math.round(metrics.prior.leads / 2),
          cpm: Math.round(metrics.prior.cpm * 100) / 100,
          cpl: Math.round(metrics.prior.cpl * 100) / 100,
        },
        change_pct: {
          cpm: Math.round(metrics.delta.cpm_pct),
          cpl: Math.round(metrics.delta.cpl_pct),
          leads: Math.round(metrics.delta.leads_pct),
        },
      },
      seasonal_context: client.brief_seasonal_context || season,
    };

    const ai = await generateAi(aiPayload);
    if (!ai) continue;

    const recipients = (client.brief_recipients ?? []).filter((e: string) => e && e.includes("@"));

    const insert = {
      workspace_id: workspaceId,
      client_id: client.id,
      trigger_kind: primaryKind,
      severity,
      metrics: aiPayload.metrics,
      seasonal_context: aiPayload.seasonal_context,
      subject: ai.subject,
      body_markdown: ai.body_markdown,
      recipients,
      status: "draft",
      dedupe_key: dedupe,
    };
    const { data: row, error } = await supabase.from("client_trend_briefs").insert(insert).select("id").single();
    if (error) {
      console.error("insert failed", error);
      continue;
    }
    results.push({ client_id: client.id, brief_id: row.id, kinds, severity });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { workspaceId, clientId, force, kind } = body as { workspaceId?: string; clientId?: number; force?: boolean; kind?: "weekly_digest" };

    let workspaceIds: string[] = [];
    if (workspaceId) {
      workspaceIds = [workspaceId];
    } else {
      const { data } = await supabase.from("workspaces").select("id");
      workspaceIds = (data ?? []).map((w: any) => w.id);
    }

    const all: any[] = [];
    for (const ws of workspaceIds) {
      try {
        const r = await processWorkspace(supabase, ws, !!force, kind, clientId);
        all.push({ workspace_id: ws, drafts: r });
      } catch (e) {
        console.error("workspace failed", ws, e);
        all.push({ workspace_id: ws, error: String(e) });
      }
    }
    return json({ ok: true, results: all });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
