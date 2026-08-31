// Full account audit for one client: pulls every signal we hold, computes the
// hard numbers deterministically, has the model write the narrative on top of
// them, renders a branded PDF, and opens assigned tasks for each finding.
// Body: { clientId, daysWindow?, audience?: "agency" | "client", createTasks?, recipients? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { computeAudit, type AuditData } from "../_shared/auditMetrics.ts";
import { buildAuditPdf, type AuditNarrative } from "../_shared/auditPdf.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SYSTEM_AGENCY = `You are a senior paid-media and CRM operations auditor writing an internal account audit for a mortgage/lending marketing agency.

Rules:
- Every number you cite MUST come from the JSON payload you are given. Never invent or estimate figures.
- Write like an analyst, not a marketer: direct, specific, no filler, no congratulation.
- Where the platform's own data is broken (sync failures, unlinked leads), say so plainly and explain what downstream reporting it invalidates.
- Findings must be ranked by business impact, each with a named owner role and a concrete corrective action.
- Owner roles must be one of: "Media Buyer", "Content Specialist", "Integrations / Engineering", "Account Manager", "Client", "Setter Ops".
- 3-6 sentences per section. No bullet characters, no markdown, plain prose paragraphs.`;

const SYSTEM_CLIENT = `You are the account strategist at a mortgage/lending marketing agency writing a performance review that will be sent to the client themselves.

Rules:
- Every number you cite MUST come from the JSON payload you are given. Never invent or estimate figures.
- Audience is the business owner, not a marketer: plain English, no platform jargon, no acronyms without explanation (say "cost per lead", not "CPL"; "cost per 1,000 views", not "CPM").
- Be honest but constructive. Frame problems as what is happening, what it costs them, and what we are doing about it. Never blame the client and never expose internal tooling failures, vendor names, engineering detail or internal staff names.
- Where the client's own follow-up speed or CRM usage is the constraint, say so respectfully and give them a specific ask.
- Findings are "priorities": each has a title, a short plain-English explanation, a severity, an owner_role of either "Our team" or "Client", and an action written as what will be done next.
- The action plan must read as commitments and requests, not internal tickets.
- 3-6 sentences per section. No bullet characters, no markdown, plain prose paragraphs.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One-line subtitle for the cover page" },
    executive_summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          owner_role: { type: "string" },
          action: { type: "string" },
        },
        required: ["title", "detail", "severity", "owner_role", "action"],
      },
    },
    paid_media: { type: "string" },
    compliance: { type: "string" },
    lead_quality: { type: "string" },
    crm_ops: { type: "string" },
    bottom_line: { type: "string" },
    action_plan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          when: { type: "string", description: "This week / Next 30 days / Ongoing" },
          owner_role: { type: "string" },
          task: { type: "string" },
        },
        required: ["when", "owner_role", "task"],
      },
    },
  },
  required: ["headline", "executive_summary", "findings", "paid_media", "compliance", "lead_quality", "crm_ops", "bottom_line", "action_plan"],
};

async function writeNarrative(data: AuditData, audience: "agency" | "client"): Promise<AuditNarrative> {
  const forClient = audience === "client";
  const SYSTEM = forClient ? SYSTEM_CLIENT : SYSTEM_AGENCY;
  const prompt =
    `Audit payload (all figures are authoritative):\n\`\`\`json\n${JSON.stringify(data, null, 1).slice(0, 90_000)}\n\`\`\`\n\n` +
    (forClient
      ? `Write the client-facing performance review. Cover: where the account stands, a short ranked list of priorities we are acting on (translate the machine-detected defects into plain business language, and drop anything that is purely internal tooling noise), advertising performance in plain terms, lead quality and what the form answers say about who is coming through, follow-up speed and pipeline/appointment discipline, a bottom line, and what happens next split between our team and theirs. Leave the compliance field as a short neutral note or an empty string.`
      : `Write the audit. Cover: executive summary, a ranked findings list (use the machine-detected defects as the backbone but merge, rank and explain them in business terms), paid media performance including CPL decomposition (CPL = CPM / (CTR x form CVR)), compliance flags, lead quality and form design, CRM operations including sync integrity, speed to first contact and pipeline/appointment discipline, a bottom line, and an ordered action plan.`);

  if (ANTHROPIC_API_KEY) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_OPS_MODEL") ?? "claude-sonnet-4-5",
        max_tokens: 6000,
        system: SYSTEM,
        tools: [{ name: "emit_audit", description: "Return the finished audit", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "emit_audit" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    if (r.ok) {
      const block = (j.content ?? []).find((b: any) => b.type === "tool_use");
      if (block?.input) return block.input as AuditNarrative;
    }
    console.error("anthropic audit failed", j?.error?.message ?? r.status);
  }

  if (LOVABLE_API_KEY) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
        tools: [{ type: "function", function: { name: "emit_audit", parameters: SCHEMA } }],
        tool_choice: { type: "function", function: { name: "emit_audit" } },
      }),
    });
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (args) return JSON.parse(args) as AuditNarrative;
    console.error("gateway audit failed", JSON.stringify(j).slice(0, 300));
  }

  // Deterministic fallback so an audit always renders.
  if (forClient) {
    return {
      headline: "Advertising results, lead quality and follow-up for the period",
      executive_summary:
        `Between ${data.meta.windowStart} and ${data.meta.windowEnd} we invested ${data.paid.spend.toFixed(2)} in advertising and delivered ${data.leadQuality.total} leads at an average cost per lead of ${data.paid.cpl.toFixed(2)}. ` +
        `${data.crm.appointments} appointments were booked and the median time to first contact a new lead was ${data.crm.medianFirstTouchHours.toFixed(1)} hours. ` +
        `The priorities below are the changes we are making next, plus anything we need from your team.`,
      findings: data.defects
        .filter((d) => d.category !== "sync" && d.category !== "scoring")
        .slice(0, 8)
        .map((d) => ({
          title: d.title,
          detail: d.evidence,
          severity: d.severity,
          owner_role: d.category === "setter" ? "Client" : "Our team",
          action: "We are addressing this in the coming weeks.",
        })),
      paid_media: `Spend ${data.paid.spend.toFixed(2)} reached ${data.paid.impressions} views and produced ${data.leadQuality.total} leads, a form completion rate of ${data.paid.cvr.toFixed(2)}%.`,
      compliance: "",
      lead_quality: `${data.leadQuality.duplicates} duplicate submissions and ${data.leadQuality.unqualifiedFormLeads} leads did not answer the qualifying questions.`,
      crm_ops: `Median time to first contact was ${data.crm.medianFirstTouchHours.toFixed(1)} hours across ${data.crm.dialledContacts} leads that were worked.`,
      bottom_line: "Faster follow-up and tighter targeting are the two levers with the most upside this period.",
      action_plan: data.defects.slice(0, 6).map((d) => ({
        when: d.severity === "critical" ? "This week" : "Next 30 days",
        owner_role: d.category === "setter" ? "Client" : "Our team",
        task: d.title,
      })),
    };
  }
  return {
    headline: "Paid media, lead delivery, CRM operations and pipeline integrity",
    executive_summary:
      `Between ${data.meta.windowStart} and ${data.meta.windowEnd} the account spent ${data.paid.spend.toFixed(2)} and produced ${data.leadQuality.total} leads at a reported cost per lead of ${data.paid.cpl.toFixed(2)}. ` +
      `${data.sync.linkedToGhl} of ${data.leadQuality.total} leads are linked to the CRM and ${data.crm.appointmentsWithOutcome} of ${data.crm.appointments} appointments carry an outcome. ` +
      `${data.defects.length} defects were detected automatically; see the register for evidence.`,
    findings: data.defects.map((d) => ({
      title: d.title, detail: d.evidence, severity: d.severity,
      owner_role: d.category === "sync" || d.category === "scoring" ? "Integrations / Engineering"
        : d.category === "paid-media" || d.category === "compliance" ? "Media Buyer"
        : d.category === "setter" ? "Setter Ops" : "Account Manager",
      action: "Investigate and resolve; see evidence.",
    })),
    paid_media: `Spend ${data.paid.spend.toFixed(2)}, CPM ${data.paid.cpm.toFixed(2)}, CTR ${data.paid.ctr.toFixed(2)}%, form CVR ${data.paid.cvr.toFixed(2)}%.`,
    compliance: data.nonSacLeads
      ? `${data.nonSacLeads} leads came from campaigns without a Special Ad Category declaration.`
      : "No campaign naming flags detected in the window.",
    lead_quality: `${data.leadQuality.duplicates} duplicate submissions and ${data.leadQuality.unqualifiedFormLeads} leads with no qualification captured.`,
    crm_ops: `Median speed to first contact ${data.crm.medianFirstTouchHours.toFixed(1)}h across ${data.crm.dialledContacts} worked contacts.`,
    bottom_line: "Resolve the critical defects before making further media changes.",
    action_plan: data.defects.slice(0, 6).map((d) => ({ when: d.severity === "critical" ? "This week" : "Next 30 days", owner_role: "Account Manager", task: d.title })),
  };
}

const ROLE_HINTS: Record<string, string[]> = {
  "media buyer": ["media buy", "media buyer", "paid", "buyer"],
  "content specialist": ["content", "creative", "design"],
  "integrations / engineering": ["integration", "engineer", "developer", "technical", "ops engineer"],
  "account manager": ["account manager", "account", "success", "am"],
  "setter ops": ["setter", "sales", "sdr", "appointment"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = Number(body.clientId);
    if (!Number.isFinite(clientId)) return json({ error: "clientId required" }, 400);
    const daysWindow = Math.min(365, Math.max(7, Number(body.daysWindow) || 90));
    const audience: "agency" | "client" = body.audience === "client" ? "client" : "agency";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: client } = await admin
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    if (!client) return json({ error: "client not found" }, 404);

    // ---- authorization -------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${SERVICE_KEY}`;
    let userId: string | null = null;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "unauthorized" }, 401);
      userId = user.id;
      const { data: member } = await admin
        .from("workspace_members")
        .select("user_id").eq("workspace_id", client.workspace_id).eq("user_id", user.id).maybeSingle();
      const { data: sa } = await admin.rpc("is_super_admin", { _user_id: user.id });
      if (!member && !sa) return json({ error: "forbidden" }, 403);
    }

    const end = new Date();
    const start = new Date(end.getTime() - daysWindow * 86400000);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const startIso = `${startStr}T00:00:00Z`;

    // ---- gather --------------------------------------------------------------
    const { data: accts } = await admin.from("meta_ad_accounts").select("id").eq("client_id", clientId);
    const acctIds = (accts ?? []).map((a: any) => a.id);

    const [insights, campaignRows] = await Promise.all([
      acctIds.length
        ? admin.from("meta_insights_daily")
            .select("date,spend,leads,clicks,impressions,frequency")
            .in("ad_account_id", acctIds).gte("date", startStr).lte("date", endStr)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      acctIds.length
        ? admin.from("meta_insights_granular_daily")
            .select("object_id,object_name,spend,leads,clicks,impressions")
            .eq("level", "campaign").in("ad_account_id", acctIds).gte("date", startStr).lte("date", endStr)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);

    const [leads, scores, contacts, notes, appointments, opportunities, actions, location] = await Promise.all([
      admin.from("meta_leads")
        .select("id,lead_id,full_name,email,phone,campaign_name,form_name,ad_name,created_time,field_data,sync_status,last_sync_error,ghl_contact_id,stage")
        .eq("client_id", clientId).gte("created_time", startIso).order("created_time", { ascending: true }).limit(3000)
        .then((r) => r.data ?? []),
      admin.from("lead_scores").select("score,grade,breakdown,computed_at")
        .eq("client_id", clientId).gte("created_at", startIso).limit(3000).then((r) => r.data ?? []),
      admin.from("ghl_contacts").select("contact_id,date_added,email,phone,tags,synced_at,created_at")
        .eq("client_id", clientId).gte("date_added", startIso).limit(5000).then((r) => r.data ?? []),
      admin.from("ghl_contact_notes").select("contact_id,body,date_added,created_by,created_at")
        .eq("client_id", clientId).gte("date_added", startIso).limit(5000).then((r) => r.data ?? []),
      admin.from("ghl_appointments").select("contact_id,title,start_time,status,outcome,calendar_name,assigned_user_name")
        .eq("client_id", clientId).gte("start_time", startIso).limit(2000).then((r) => r.data ?? []),
      admin.from("ghl_opportunities").select("contact_id,pipeline_name,stage_name,status,monetary_value,updated_at")
        .eq("client_id", clientId).limit(3000).then((r) => r.data ?? []),
      admin.from("ad_action_log").select("action,status,error_message,meta,created_at")
        .eq("client_id", clientId).gte("created_at", startIso).order("created_at", { ascending: false }).limit(200)
        .then((r) => r.data ?? []),
      client.ghl_location_id
        ? admin.from("ghl_locations").select("id,name,location_id,location_api_key")
            .eq("location_id", client.ghl_location_id).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);

    const data = computeAudit({
      client, location, insights, campaignRows, leads, scores, contacts, notes,
      appointments, opportunities, actions, windowStart: startStr, windowEnd: endStr,
    });

    const story = await writeNarrative(data, audience);

    // ---- render + store ------------------------------------------------------
    const bytes = await buildAuditPdf(data, story, audience);
    const stamp = new Date().toISOString().slice(0, 10);
    const prefix = audience === "client" ? "review" : "audit";
    const fileName = `${prefix}_${stamp}_${crypto.randomUUID().slice(0, 8)}.pdf`;
    const path = `${client.workspace_id}/${clientId}/${fileName}`;
    const up = await admin.storage.from("client-reports")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return json({ error: `PDF upload failed: ${up.error.message}` }, 500);
    const { data: signed } = await admin.storage.from("client-reports")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const pdfUrl = signed?.signedUrl ?? null;

    // ---- assigned tasks from findings ---------------------------------------
    let tasksCreated = 0;
    if (audience === "client" ? body.createTasks === true : body.createTasks !== false) {
      const { data: members } = await admin
        .from("workspace_members").select("user_id").eq("workspace_id", client.workspace_id);
      const memberIds = (members ?? []).map((m: any) => m.user_id);
      const { data: profiles } = memberIds.length
        ? await admin.from("profiles").select("id,display_name,position,department").in("id", memberIds)
        : { data: [] as any[] };
      const { data: rules } = await admin
        .from("task_routing_rules").select("category,assigned_user_id").eq("workspace_id", client.workspace_id);

      const resolveOwner = (role: string): string | null => {
        const r = (role || "").toLowerCase();
        const hints = ROLE_HINTS[r] ?? [r];
        const match = (profiles ?? []).find((p: any) =>
          hints.some((h) => `${p.position ?? ""} ${p.department ?? ""}`.toLowerCase().includes(h)),
        );
        if (match) return match.id;
        const rule = (rules ?? []).find((x: any) => hints.some((h) => String(x.category ?? "").toLowerCase().includes(h)));
        return rule?.assigned_user_id ?? null;
      };

      const brand = client.brand || client.name;
      const rows = story.findings.slice(0, 12).map((f) => {
        const owner = resolveOwner(f.owner_role);
        const due = new Date(Date.now() + (f.severity === "critical" ? 3 : f.severity === "high" ? 7 : 14) * 86400000);
        return {
          workspace_id: client.workspace_id,
          client_id: clientId,
          user_id: userId,
          kind: "task",
          title: `[Audit ${stamp}] ${f.title}`.slice(0, 180),
          content: `${brand} — ${f.detail}\n\nAction: ${f.action}\nOwner role: ${f.owner_role}`,
          priority: f.severity === "critical" || f.severity === "high" ? "high" : "normal",
          due_at: due.toISOString(),
          assigned_to: owner,
          assigned_to_ids: owner ? [owner] : [],
          visible_to_client: false,
        };
      });
      if (rows.length) {
        const { error: tErr, count } = await admin.from("client_notes").insert(rows, { count: "exact" });
        if (tErr) console.error("task insert failed", tErr.message);
        else tasksCreated = count ?? rows.length;
      }
    }

    await admin.from("client_audit_artifacts").insert({
      workspace_id: client.workspace_id,
      client_id: clientId,
      kind: "audit_pdf",
      audience,
      storage_path: path,
      file_name: fileName,
      days_window: daysWindow,
      findings: story.findings.length,
      defects: data.defects.length,
      tasks_created: tasksCreated,
      summary: story.executive_summary,
      is_permanent: false,
      created_by: userId,
    });

    await admin.from("clients").update({ last_audit: new Date().toISOString() }).eq("id", clientId);

    return json({
      ok: true,
      audience,
      pdfUrl,
      path,
      tasksCreated,
      findings: story.findings.length,
      defects: data.defects.length,
      summary: story.executive_summary,
      metrics: data,
    });
  } catch (e) {
    console.error("[client-audit-generate]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
