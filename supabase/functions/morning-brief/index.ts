// Morning Brief generator.
// Gathers the overnight state of a workspace (portfolio health, open AI insights,
// churn risk, outstanding tasks, pending approvals) and asks Claude to synthesise a
// short brief plus a set of suggested tasks for the day. The result is persisted to
// `morning_briefs`, one row per (workspace, user, day), and returned to the client.
//
// Body: { workspaceId: string, date?: "YYYY-MM-DD", regenerate?: boolean }
// Returns: { brief: MorningBriefRow }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("AI_OPS_MODEL") ?? "claude-sonnet-4-5";

type Severity = "info" | "warn" | "critical";
type Priority = "low" | "normal" | "high";

type TaskCategory =
  | "creative"
  | "media_buying"
  | "account_management"
  | "client_outreach"
  | "reporting"
  | "tech"
  | "general";

interface SuggestedTask {
  title: string;
  priority: Priority;
  client_id: number | null;
  reason: string;
  category: TaskCategory;
}
interface Highlight {
  label: string;
  detail: string;
  severity: Severity;
}

const SYSTEM = `You are the AI Operations lead for a Meta-ads agency, writing the user's morning brief.
You are given a JSON snapshot of the workspace taken this morning: portfolio health, open AI insights, churn risk, outstanding tasks, and pending approvals.

Write a concise, scannable brief of what happened and what needs attention today, then propose the concrete tasks the user should knock out.

Return ONLY a JSON object, no prose around it, with this exact shape:
{
  "headline": "one short sentence summarising the day's state",
  "summary": "2-5 short markdown paragraphs (or bullet lists) covering what changed overnight, the biggest concerns, and what's going well. Cite real numbers (CPL, spend, churn score, counts) from the snapshot.",
  "highlights": [ { "label": "short title", "detail": "one sentence", "severity": "info"|"warn"|"critical" } ],
  "suggested_tasks": [ { "title": "imperative task", "priority": "low"|"normal"|"high", "client_id": <number or null>, "reason": "why this matters today", "category": "creative"|"media_buying"|"account_management"|"client_outreach"|"reporting"|"tech"|"general" } ]
}

Rules:
- 0-5 highlights, ordered most-to-least urgent. Skip if nothing notable. Each highlight is a CONCERN that needs awareness — it explains WHAT is wrong.
- 0-4 suggested_tasks MAX, each genuinely actionable today. A task is the concrete WORK that fixes a concern. Fewer, sharper tasks beat a long list.
- DO NOT DUPLICATE between highlights and tasks. If a concern is a call to action ("Review X", "Fix Y"), put it ONLY in suggested_tasks. If it's an observation ("CPL up 40%"), put it ONLY in highlights. Never restate the same thing in both sections.
- MAXIMUM ONE task per client. If a client has several problems, combine them into a single task with the highest-impact action first.
- Never propose a task that already exists in tasks.existing_open (same client, same work) — even if worded differently. Those are already on the board.
- CPL breaches are HIGH priority. If a client's CPL is above target, the CPL fix task must have priority "high" and appear first.
- Task titles must be specific and actionable: start with a verb, name the client + metric + concrete next step (e.g. "Cut CPL for Acme — pause worst 2 ad sets, launch new hook creative"). Never write vague tasks like "Review client", "Check performance", "Look at metrics".
- The "reason" field must cite the specific number that triggered the task (CPL value, spend drop %, churn score, etc.).
- Only use client_id values that appear in the snapshot's clients list; otherwise use null.
- CRITICAL: Whenever you mention a client in headline, summary, highlights, or task titles, ALWAYS use the client's actual name or brand (as provided in the snapshot). NEVER write phrases like "Client #105", "Client 135", "client id 42", or any numeric placeholder. If you don't know a client's name, omit the reference entirely.
- Set category by the type of work required so the task can be auto-routed to the right teammate:
  * "creative" — ad copy, creative refresh, design, video, thumbnails, hooks
  * "media_buying" — budget changes, bid/targeting/audience tweaks, KPI audits, pausing/launching ads, CPL/CPM fixes
  * "account_management" — onboarding, contract, billing, internal coordination
  * "client_outreach" — calling/emailing/messaging a client (dark accounts, check-ins, status updates)
  * "reporting" — building reports, dashboards, monthly recaps
  * "tech" — integration/data sync issues, platform errors
  * "general" — anything that doesn't fit cleanly above
- Do not invent data. If the workspace is quiet, say so plainly and return few/no tasks.`;

function extractJson(text: string): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Models occasionally wrap JSON in prose or code fences — grab the first object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function gatherSignals(admin: ReturnType<typeof createClient>, workspaceId: string) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [snapRes, insightsRes, churnRes, tasksRes, pendingRes, clientsRes] = await Promise.all([
    admin.from("v_portfolio_snapshot").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    admin
      .from("ai_insights")
      .select("id,client_id,kind,severity,title,body,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .in("severity", ["warn", "critical"])
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("client_churn_risk")
      .select("client_id,risk_level,score,summary,reasons,suggested_actions")
      .eq("workspace_id", workspaceId)
      .in("risk_level", ["high", "medium"])
      .order("score", { ascending: false })
      .limit(15),
    admin
      .from("client_notes")
      .select("id,client_id,title,content,priority,due_at,next_due_at,assigned_to")
      .eq("workspace_id", workspaceId)
      .eq("kind", "task")
      .eq("done", false)
      .limit(300),
    admin
      .from("ai_pending_actions")
      .select("id,client_id,action_type,reasoning,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("clients").select("id,name,brand,status,website,bio").eq("workspace_id", workspaceId).not("status", "in", "(CANCELLED,PENDING_CANCELLATION,BLOCKED,PAUSED)"),
  ]);

  const clients = (clientsRes.data ?? []) as { id: number; name: string; brand: string | null; status: string; website: string | null; bio: string | null }[];
  // Build a lookup so we can also resolve IDs that may appear in insights/churn
  // even if they aren't in the workspace filter (defensive — should be rare).
  const referencedIds = new Set<number>();
  for (const arr of [insightsRes.data, churnRes.data, pendingRes.data, tasksRes.data] as any[]) {
    for (const row of (arr ?? [])) if (row?.client_id != null) referencedIds.add(Number(row.client_id));
  }
  // Exclude cancelled/paused clients from ALL brief data so they don't
  // resurface as concerns, churn risks, or suggested tasks.
  const EXCLUDED_STATUSES = new Set(["CANCELLED", "PENDING_CANCELLATION", "BLOCKED", "PAUSED"]);
  const activeClientIds = new Set(clients.map((c) => Number(c.id)));
  const missingIds = [...referencedIds].filter((id) => !clients.find((c) => Number(c.id) === id));
  if (missingIds.length) {
    const { data: extra } = await admin
      .from("clients")
      .select("id,name,brand,status,website,bio")
      .in("id", missingIds);
    for (const e of (extra ?? []) as any[]) {
      if (EXCLUDED_STATUSES.has(String(e.status))) continue;
      if (!clients.find((c) => Number(c.id) === Number(e.id))) {
        clients.push(e);
        activeClientIds.add(Number(e.id));
      }
    }
  }
  // Filter insights/churn/pending/tasks to active clients only.
  const keepActive = <T extends { client_id?: number | null }>(rows: T[] | null | undefined): T[] =>
    (rows ?? []).filter((r) => r.client_id == null || activeClientIds.has(Number(r.client_id)));
  insightsRes.data = keepActive(insightsRes.data as any[]);
  churnRes.data = keepActive(churnRes.data as any[]);
  pendingRes.data = keepActive(pendingRes.data as any[]);
  tasksRes.data = keepActive(tasksRes.data as any[]);
  const displayName = (c: { name: string; brand: string | null } | undefined) =>
    c ? (c.brand && c.brand.trim().length > 0 ? c.brand : c.name) : null;
  const nameOf = (id: number | null | undefined) => {
    if (id == null) return null;
    const c = clients.find((x) => Number(x.id) === Number(id));
    return displayName(c) ?? null; // null instead of "Client #N" — sanitiser strips placeholders
  };

  const tasks = (tasksRes.data ?? []) as any[];
  const overdue: any[] = [];
  const dueToday: any[] = [];
  for (const t of tasks) {
    const due = (t.next_due_at ?? t.due_at) as string | null;
    if (!due) continue;
    const d = due.slice(0, 10);
    if (d < todayIso) overdue.push(t);
    else if (d === todayIso) dueToday.push(t);
  }

  const summarizeTask = (t: any) => ({
    client: nameOf(t.client_id),
    title: t.title || (t.content ?? "").slice(0, 80),
    priority: t.priority,
    due: t.next_due_at ?? t.due_at,
  });

  return {
    today: todayIso,
    portfolio: snapRes.data ?? null,
    open_insights: ((insightsRes.data ?? []) as any[]).map((i) => ({
      client: nameOf(i.client_id),
      client_id: i.client_id,
      kind: i.kind,
      severity: i.severity,
      title: i.title,
      body: i.body,
    })),
    churn_risk: ((churnRes.data ?? []) as any[]).map((c) => ({
      client: nameOf(c.client_id),
      client_id: c.client_id,
      risk_level: c.risk_level,
      score: c.score,
      summary: c.summary,
      reasons: c.reasons,
      suggested_actions: c.suggested_actions,
    })),
    pending_approvals: ((pendingRes.data ?? []) as any[]).map((a) => ({
      client: nameOf(a.client_id),
      client_id: a.client_id,
      action_type: a.action_type,
      reasoning: a.reasoning,
    })),
    tasks: {
      open_total: tasks.length,
      overdue_count: overdue.length,
      due_today_count: dueToday.length,
      overdue: overdue.slice(0, 15).map(summarizeTask),
      due_today: dueToday.slice(0, 15).map(summarizeTask),
      // Full list of already-open tasks so the model (and the sanitizer) never
      // proposes work that's already on the board.
      existing_open: tasks.slice(0, 200).map((t: any) => ({
        client_id: t.client_id ?? null,
        client: nameOf(t.client_id),
        title: t.title || (t.content ?? "").slice(0, 120),
      })),
    },
    clients: clients.map((c) => ({
      id: c.id,
      name: displayName(c) ?? c.name,
      legal_name: c.name,
      brand: c.brand,
      status: c.status,
      website: c.website,
      bio: c.bio,
    })),
  };
}

// Deterministic fallback so the feature still works without an LLM key (or if the
// model call fails): build a serviceable brief straight from the signals.
function buildFallback(signals: any): {
  headline: string;
  summary: string;
  highlights: Highlight[];
  suggested_tasks: SuggestedTask[];
} {
  const p = signals.portfolio ?? {};
  const insights = signals.open_insights ?? [];
  const churn = signals.churn_risk ?? [];
  const pending = signals.pending_approvals ?? [];
  const tasks = signals.tasks ?? {};

  const critical = insights.filter((i: any) => i.severity === "critical");
  const warnings = insights.filter((i: any) => i.severity === "warn");
  const highChurn = churn.filter((c: any) => c.risk_level === "high");

  const lines: string[] = [];
  if (p.total_clients != null) {
    lines.push(
      `**Portfolio:** ${p.total_clients} clients — ${p.red_clients ?? 0} red, ${p.yellow_clients ?? 0} yellow, ${p.green_clients ?? 0} green.` +
        (p.portfolio_cpl_30d != null ? ` 30-day CPL is $${p.portfolio_cpl_30d}.` : ""),
    );
  }
  if (critical.length || warnings.length) {
    lines.push(`**AI insights:** ${critical.length} critical and ${warnings.length} warning(s) are open.`);
  }
  if (churn.length) {
    lines.push(`**Churn risk:** ${highChurn.length} high-risk and ${churn.length - highChurn.length} medium-risk client(s).`);
  }
  if (pending.length) lines.push(`**Approvals:** ${pending.length} AI action(s) waiting on you.`);
  if (tasks.overdue_count || tasks.due_today_count) {
    lines.push(`**Tasks:** ${tasks.overdue_count ?? 0} overdue, ${tasks.due_today_count ?? 0} due today.`);
  }
  if (lines.length === 0) lines.push("All quiet — nothing flagged across the portfolio this morning.");

  const highlights: Highlight[] = [];
  for (const c of critical.slice(0, 3))
    highlights.push({ label: c.title, detail: c.body ?? "", severity: "critical" });
  for (const c of highChurn.slice(0, 2))
    highlights.push({
      label: `${c.client} at high churn risk`,
      detail: c.summary ?? `Score ${c.score}.`,
      severity: "critical",
    });
  for (const w of warnings.slice(0, 3)) highlights.push({ label: w.title, detail: w.body ?? "", severity: "warn" });

  const suggested: SuggestedTask[] = [];
  for (const c of critical.slice(0, 4))
    suggested.push({
      title: `Resolve: ${c.title}`,
      priority: "high",
      client_id: c.client_id ?? null,
      reason: c.body ?? "Critical AI insight open.",
      category: "media_buying",
    });
  for (const c of highChurn.slice(0, 3))
    suggested.push({
      title: `Save ${c.client} — review churn risk`,
      priority: "high",
      client_id: c.client_id ?? null,
      reason: c.summary ?? `High churn risk (score ${c.score}).`,
      category: "client_outreach",
    });
  if (pending.length)
    suggested.push({
      title: `Review ${pending.length} pending AI action(s) for approval`,
      priority: "normal",
      client_id: null,
      reason: "AI actions are queued and waiting on your approval.",
      category: "account_management",
    });
  if (tasks.overdue_count)
    suggested.push({
      title: `Clear ${tasks.overdue_count} overdue task(s)`,
      priority: "normal",
      client_id: null,
      reason: "These were due before today.",
      category: "general",
    });

  return {
    headline:
      critical.length || highChurn.length
        ? `${critical.length + highChurn.length} thing(s) need attention this morning`
        : "Quiet morning across the portfolio",
    summary: lines.join("\n\n"),
    highlights,
    suggested_tasks: suggested.slice(0, 8),
  };
}

async function generateWithClaude(signals: any) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(signals) }],
      }),
    });
    if (!res.ok) {
      console.warn(`[morning-brief] Anthropic ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return extractJson(text);
  } catch (e) {
    console.warn(`[morning-brief] Claude error: ${(e as Error).message}`);
    return null;
  }
}

function sanitize(parsed: any, signals: any) {
  const clientList = (signals.clients ?? []) as Array<{ id: number; name: string }>;
  const validIds = new Set(clientList.map((c) => Number(c.id)));
  const nameById = new Map<number, string>(clientList.map((c) => [Number(c.id), String(c.name)]));
  const sev = (s: any): Severity => (s === "critical" || s === "warn" ? s : "info");
  const pri = (p: any): Priority => (p === "high" || p === "low" ? p : "normal");

  // Replace any "Client #105" / "client 135" / "client id: 42" placeholders the
  // model may emit with the real client name. If we can't resolve, drop the token.
  const scrub = (s: string): string => {
    if (!s) return s;
    return s.replace(/\bclient\s*(?:id[:\s]*|#)?\s*(\d{1,6})\b/gi, (_m, idStr) => {
      const id = Number(idStr);
      return nameById.get(id) ?? "a client";
    });
  };

  const highlights: Highlight[] = Array.isArray(parsed?.highlights)
    ? parsed.highlights
        .filter((h: any) => h && (h.label || h.detail))
        .slice(0, 5)
        .map((h: any) => ({
          label: scrub(String(h.label ?? "")).slice(0, 160),
          detail: scrub(String(h.detail ?? "")).slice(0, 400),
          severity: sev(h.severity),
        }))
    : [];

  const validCats: Set<TaskCategory> = new Set([
    "creative",
    "media_buying",
    "account_management",
    "client_outreach",
    "reporting",
    "tech",
    "general",
  ]);
  const cat = (c: any): TaskCategory => (validCats.has(c) ? c : "general");

  // Normalize for dedupe: lowercase, strip verbs/punct, so "Review CPL for Acme"
  // and "CPL for Acme" collapse to the same key.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(review|check|fix|resolve|address|handle|look at|investigate)\s+/i, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const highlightKeys = new Set(highlights.map((h) => norm(h.label)));

  const seenTaskKeys = new Set<string>();
  const seenClientProblem = new Set<string>(); // clientId + first-3-words dedupe
  const rawTasks: SuggestedTask[] = Array.isArray(parsed?.suggested_tasks)
    ? parsed.suggested_tasks
        .filter((t: any) => t && typeof t.title === "string" && t.title.trim().length >= 8)
        .map((t: any) => {
          const cid = t.client_id != null && validIds.has(Number(t.client_id)) ? Number(t.client_id) : null;
          let priority = pri(t.priority);
          const title = scrub(String(t.title)).slice(0, 200);
          const reason = scrub(String(t.reason ?? "")).slice(0, 400);
          // Force CPL fixes to high priority — user rule.
          if (/\bcpl\b/i.test(title) || /\bcpl\b/i.test(reason)) priority = "high";
          return {
            title,
            priority,
            client_id: cid,
            reason,
            category: cat(t.category),
          };
        })
    : [];

  // Token-overlap similarity — catches reworded duplicates like
  // "Cut CPL for Acme by pausing ad sets" vs "Lower Acme CPL — pause ad sets".
  const STOP = new Set(["the","a","an","for","to","and","or","of","on","in","with","by","at","from","new","launch","this","that","its","their"]);
  const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
  const similar = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return false;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    return inter / Math.min(a.size, b.size) >= 0.6;
  };

  // Tasks that already exist and are still open — never suggest them again.
  const existingOpen: { client_id: number | null; tokens: Set<string> }[] = (
    Array.isArray(signals?.tasks?.existing_open) ? signals.tasks.existing_open : []
  ).map((t: any) => ({
    client_id: t?.client_id == null ? null : Number(t.client_id),
    tokens: tokens(String(t?.title ?? "")),
  }));

  // Drop tasks that restate a highlight, duplicate each other, or duplicate an
  // already-open task. Also cap at one task per client so the list stays short.
  const suggested_tasks: SuggestedTask[] = [];
  const accepted: { client_id: number | null; tokens: Set<string> }[] = [];
  const clientCount = new Map<string, number>();
  for (const t of rawTasks) {
    const k = norm(t.title);
    if (!k || seenTaskKeys.has(k)) continue;
    if (highlightKeys.has(k)) continue; // pure duplicate of a concern
    const cpKey = `${t.client_id ?? "x"}::${k.split(" ").slice(0, 3).join(" ")}`;
    if (seenClientProblem.has(cpKey)) continue;
    const tk = tokens(t.title);
    // Same client (or global) + near-identical wording => duplicate.
    if (accepted.some((a) => (a.client_id === t.client_id || a.client_id == null || t.client_id == null) && similar(a.tokens, tk))) continue;
    if (existingOpen.some((a) => a.client_id === t.client_id && similar(a.tokens, tk))) continue;
    const ck = String(t.client_id ?? "x");
    if ((clientCount.get(ck) ?? 0) >= 1) continue; // one action per client per day
    seenTaskKeys.add(k);
    seenClientProblem.add(cpKey);
    clientCount.set(ck, (clientCount.get(ck) ?? 0) + 1);
    accepted.push({ client_id: t.client_id, tokens: tk });
    suggested_tasks.push(t);
    if (suggested_tasks.length >= 4) break;
  }

  // Sort: CPL high-priority first, then other high, then normal, then low.
  const prScore = (t: SuggestedTask) => {
    const isCpl = /\bcpl\b/i.test(t.title) || /\bcpl\b/i.test(t.reason);
    if (isCpl && t.priority === "high") return 0;
    if (t.priority === "high") return 1;
    if (t.priority === "normal") return 2;
    return 3;
  };
  suggested_tasks.sort((a, b) => prScore(a) - prScore(b));

  return {
    headline: scrub(String(parsed?.headline ?? "")).slice(0, 200) || "Your morning brief",
    summary: scrub(String(parsed?.summary ?? "")),
    highlights,
    suggested_tasks,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { workspaceId, date, regenerate } = await req.json().catch(() => ({}));
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    // Resolve the calling user from their JWT and confirm workspace membership.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: membership } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ error: "Forbidden" }, 403);

    const briefDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);

    // Return today's existing brief unless a regenerate was explicitly requested.
    const { data: existing } = await admin
      .from("morning_briefs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("brief_date", briefDate)
      .maybeSingle();
    if (existing && !regenerate) return json({ brief: existing });

    const signals = await gatherSignals(admin, workspaceId);
    const parsed = await generateWithClaude(signals);
    const content = parsed ? sanitize(parsed, signals) : buildFallback(signals);
    const usedModel = parsed ? MODEL : "fallback";

    const row = {
      workspace_id: workspaceId,
      user_id: userId,
      brief_date: briefDate,
      headline: content.headline,
      summary: content.summary,
      highlights: content.highlights,
      suggested_tasks: content.suggested_tasks,
      signals,
      model: usedModel,
      status: "new",
      applied_task_ids: [],
      applied_at: null,
      dismissed_at: null,
    };

    // Regenerating overwrites the day's row; otherwise insert a fresh one.
    const { data: saved, error: saveErr } = await admin
      .from("morning_briefs")
      .upsert(row, { onConflict: "workspace_id,user_id,brief_date" })
      .select("*")
      .single();
    if (saveErr) throw new Error(saveErr.message);

    return json({ brief: saved });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
