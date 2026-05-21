// Computes lead quality scores for one workspace.
// Body: { workspaceId: string, leadIds?: [{source,leadId}], limit?: number }
// If leadIds omitted, picks the most recent N unscored or stale leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Src = "meta" | "google" | "linkedin" | "manual" | "ghl";
interface LeadRow {
  source: Src;
  lead_id: string;
  workspace_id: string;
  client_id: number | null;
  campaign_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  field_data: any[] | null;
  ad_id?: string | null;
  adset_id?: string | null;
  form_id?: string | null;
  created_time: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

function evalQualifyingRules(rules: any[], lead: LeadRow): { points: number; max: number; matched: string[] } {
  if (!Array.isArray(rules) || rules.length === 0) return { points: 0, max: 0, matched: [] };
  const fd: Record<string, string> = {};
  if (Array.isArray(lead.field_data)) {
    for (const f of lead.field_data) {
      const k = String(f.name ?? "").toLowerCase();
      const v = Array.isArray(f.values) ? String(f.values[0] ?? "") : String(f.values ?? "");
      fd[k] = v;
    }
  }
  if (lead.email) fd["email"] = lead.email;
  if (lead.phone) fd["phone"] = lead.phone;
  if (lead.full_name) fd["full_name"] = lead.full_name;

  let total = 0, max = 0;
  const matched: string[] = [];
  for (const r of rules) {
    const pts = Number(r.points ?? 1);
    max += Math.abs(pts);
    const v = fd[String(r.field ?? "").toLowerCase()];
    if (v == null) continue;
    const target = r.value;
    const op = String(r.op ?? "eq");
    let ok = false;
    const vn = parseFloat(v);
    const tn = parseFloat(target);
    switch (op) {
      case "eq": ok = String(v).toLowerCase() === String(target).toLowerCase(); break;
      case "neq": ok = String(v).toLowerCase() !== String(target).toLowerCase(); break;
      case "contains": ok = String(v).toLowerCase().includes(String(target).toLowerCase()); break;
      case "gte": ok = !isNaN(vn) && !isNaN(tn) && vn >= tn; break;
      case "lte": ok = !isNaN(vn) && !isNaN(tn) && vn <= tn; break;
      case "in": ok = Array.isArray(target) && target.map(String).map((s) => s.toLowerCase()).includes(String(v).toLowerCase()); break;
    }
    if (ok) { total += pts; matched.push(`${r.field} ${op} ${JSON.stringify(target)}`); }
  }
  return { points: total, max, matched };
}

function stageScore(stage: string | null | undefined): number {
  if (!stage) return 0;
  const s = stage.toLowerCase();
  if (s.includes("won") || s.includes("closed-won") || s.includes("closed_won")) return 1.0;
  if (s.includes("applied") || s.includes("application")) return 0.75;
  if (s.includes("appoint") || s.includes("booked") || s.includes("scheduled") || s.includes("show")) return 0.55;
  if (s.includes("qualified") || s.includes("contacted")) return 0.35;
  if (s.includes("intake") || s.includes("new") || s.includes("lead")) return 0.15;
  if (s.includes("lost") || s.includes("disqualified") || s.includes("dq")) return 0;
  return 0.2;
}

function outcomeFromStage(stage: string | null | undefined): "unknown" | "closed_won" | "closed_lost" | "disqualified" {
  if (!stage) return "unknown";
  const s = stage.toLowerCase();
  if (s.includes("won")) return "closed_won";
  if (s.includes("lost")) return "closed_lost";
  if (s.includes("disqualif") || s.includes("dq")) return "disqualified";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const workspaceId: string | undefined = body.workspaceId;
  const limit: number = Math.min(Number(body.limit ?? 200), 500);
  const explicit: { source: Src; leadId: string }[] | undefined = body.leadIds;

  if (!workspaceId) return json({ error: "workspaceId required" }, 400);

  // 1. Collect lead candidates
  const candidates: LeadRow[] = [];

  if (explicit && explicit.length > 0) {
    for (const { source, leadId } of explicit) {
      const row = await fetchLead(admin, source, leadId, workspaceId);
      if (row) candidates.push(row);
    }
  } else {
    // Pull recent leads from each source not yet scored OR stale (>6h)
    const sources: { tbl: string; src: Src; idCol: string }[] = [
      { tbl: "meta_leads",     src: "meta",     idCol: "lead_id" },
      { tbl: "google_leads",   src: "google",   idCol: "external_lead_id" },
      { tbl: "linkedin_leads", src: "linkedin", idCol: "external_lead_id" },
      { tbl: "leads",          src: "manual",   idCol: "id" },
    ];
    for (const s of sources) {
      const { data, error } = await admin
        .from(s.tbl)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) continue;
      for (const r of (data ?? [])) {
        candidates.push(normalize(s.src, r));
      }
    }
  }

  if (candidates.length === 0) return json({ scored: 0, message: "No leads" });

  // 2. Resolve rule set per (client_id, campaign_id) — cache
  const ruleSetCache = new Map<string, any>();
  async function getRuleSet(client_id: number | null, campaign_id: string | null) {
    const key = `${client_id ?? "_"}::${campaign_id ?? "_"}`;
    if (ruleSetCache.has(key)) return ruleSetCache.get(key);
    const { data, error } = await admin.rpc("resolve_lead_score_rule_set", {
      _workspace_id: workspaceId,
      _client_id: client_id,
      _campaign_id: campaign_id,
    });
    if (error) { ruleSetCache.set(key, null); return null; }
    ruleSetCache.set(key, data);
    return data;
  }

  let scored = 0;
  const errors: any[] = [];

  for (const lead of candidates) {
    try {
      const rs = await getRuleSet(lead.client_id, lead.campaign_id);
      if (!rs) continue;

      const w = rs.weights ?? {};
      const grades = rs.grade_thresholds ?? { A: 85, B: 70, C: 50 };
      const sourceMods = rs.source_modifiers ?? {};

      // signals --------------------------------------------------
      // completeness
      const required = ["full_name", "email", "phone"];
      const filled = required.filter((k) => (lead as any)[k]).length;
      const fdCount = Array.isArray(lead.field_data) ? lead.field_data.length : 0;
      const completeness = clamp01((filled / 3) * 0.7 + Math.min(fdCount, 5) / 5 * 0.3);

      // validity
      const emailValid = lead.email ? EMAIL_RE.test(lead.email) : false;
      const phoneValid = lead.phone ? PHONE_RE.test(lead.phone) : false;
      const validity = (emailValid ? 0.5 : 0) + (phoneValid ? 0.5 : 0);

      // CRM progression — best matching ghl opportunity
      let crm = 0;
      let outcome: "unknown" | "closed_won" | "closed_lost" | "disqualified" = "unknown";
      if (lead.client_id) {
        const { data: opp } = await admin
          .from("ghl_opportunities")
          .select("stage_name, status")
          .eq("client_id", lead.client_id)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (opp && opp.length > 0) {
          const stages = opp.map((o: any) => Math.max(stageScore(o.stage_name), stageScore(o.status)));
          crm = Math.max(...stages);
          const allStr = (opp.map((o: any) => `${o.status ?? ""} ${o.stage_name ?? ""}`).join(" ")).toLowerCase();
          if (allStr.includes("won")) outcome = "closed_won";
          else if (allStr.includes("lost")) outcome = "closed_lost";
          else if (allStr.includes("disqualif")) outcome = "disqualified";
        }
      }

      // engagement — count signals from lead_score_events
      const { data: evts } = await admin
        .from("lead_score_events")
        .select("signal_type, occurred_at")
        .eq("lead_source", lead.source)
        .eq("lead_id", lead.lead_id);
      const engagementSignals = (evts ?? []).filter((e: any) =>
        ["reply_received", "call_answered", "email_open", "sms_reply", "time_to_response"].includes(e.signal_type)
      ).length;
      const engagement = clamp01(engagementSignals / 4);

      // qualifying answers
      const q = evalQualifyingRules(rs.qualifying_rules ?? [], lead);
      const qualifying = q.max > 0 ? clamp01(q.points / q.max) : 0;

      // source modifier
      let sourceScore = 0.5;
      const modKeys = [lead.ad_id, lead.adset_id, lead.form_id, lead.campaign_id].filter(Boolean) as string[];
      for (const k of modKeys) {
        if (sourceMods[k] != null) sourceScore = clamp01(0.5 + Number(sourceMods[k]));
      }

      // weighted total
      const total =
        (Number(w.completeness ?? 0) * completeness) +
        (Number(w.validity ?? 0) * validity) +
        (Number(w.crm_progression ?? 0) * crm) +
        (Number(w.engagement ?? 0) * engagement) +
        (Number(w.qualifying_answers ?? 0) * qualifying) +
        (Number(w.source ?? 0) * sourceScore);
      const wSum =
        Number(w.completeness ?? 0) + Number(w.validity ?? 0) + Number(w.crm_progression ?? 0) +
        Number(w.engagement ?? 0) + Number(w.qualifying_answers ?? 0) + Number(w.source ?? 0);

      const score = Math.round((wSum > 0 ? (total / wSum) * 100 : 0) * 100) / 100;

      const grade: "A" | "B" | "C" | "D" =
        score >= Number(grades.A ?? 85) ? "A" :
        score >= Number(grades.B ?? 70) ? "B" :
        score >= Number(grades.C ?? 50) ? "C" : "D";

      const breakdown = {
        signals: { completeness, validity, crm_progression: crm, engagement, qualifying_answers: qualifying, source: sourceScore },
        weights: w,
        qualifying_matched: q.matched,
        engagement_signal_count: engagementSignals,
        weighted_total: total,
        weight_sum: wSum,
      };

      const { error: upErr } = await admin.from("lead_scores").upsert({
        workspace_id: workspaceId,
        client_id: lead.client_id,
        campaign_id: lead.campaign_id,
        lead_id: lead.lead_id,
        lead_source: lead.source,
        score,
        grade,
        rule_set_id: rs.id,
        rule_set_version: rs.version,
        breakdown,
        outcome,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "lead_source,lead_id" });

      if (upErr) errors.push({ lead_id: lead.lead_id, error: upErr.message });
      else scored++;
    } catch (e: any) {
      errors.push({ lead_id: lead.lead_id, error: String(e?.message ?? e) });
    }
  }

  return json({ scored, attempted: candidates.length, errors: errors.slice(0, 10) });
});

async function fetchLead(admin: any, src: Src, leadId: string, workspaceId: string): Promise<LeadRow | null> {
  const map: Record<Src, { tbl: string; idCol: string }> = {
    meta:     { tbl: "meta_leads",     idCol: "lead_id" },
    google:   { tbl: "google_leads",   idCol: "external_lead_id" },
    linkedin: { tbl: "linkedin_leads", idCol: "external_lead_id" },
    manual:   { tbl: "leads",          idCol: "id" },
    ghl:      { tbl: "leads",          idCol: "ghl_contact_id" },
  };
  const m = map[src];
  if (!m) return null;
  const { data } = await admin.from(m.tbl).select("*").eq(m.idCol, leadId).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return null;
  return normalize(src, data);
}

function normalize(src: Src, r: any): LeadRow {
  return {
    source: src,
    lead_id: r.lead_id ?? r.external_lead_id ?? r.id,
    workspace_id: r.workspace_id,
    client_id: r.client_id ?? null,
    campaign_id: r.campaign_id ?? null,
    full_name: r.full_name ?? r.name ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    field_data: r.field_data ?? [],
    ad_id: r.ad_id ?? null,
    adset_id: r.adset_id ?? null,
    form_id: r.form_id ?? null,
    created_time: r.created_time ?? r.created_at ?? null,
  };
}

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
