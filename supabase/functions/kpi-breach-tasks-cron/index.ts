// KPI-breach auto-task cron.
//
// Scans every active client per workspace, calls the SQL helper
// `client_red_kpis(client_id)` to surface KPIs that are currently in the RED
// band per the workspace's threshold preset, and creates one task per red KPI.
// Tasks are categorized (creative / media_buying / account_management) and
// routed to the workspace member whose profile.position matches — same
// mapping as the morning brief + dark-accounts cron.
//
// Dedupes per (client_id, kpi_key) by tagging each task title with
// "[KPI:<key>] " and skipping any open task with that prefix created in the
// last 3 days.
//
// Body: { workspaceId?: string }  (omit to fan out across every workspace)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const POSITION_KEYWORDS: Record<string, string[]> = {
  creative: ["content", "creative", "design", "video", "copywriter"],
  media_buying: ["media buy", "media buyer", "buying", "paid", "ads specialist", "ppc"],
  account_management: ["account manager", "account exec", "csm", "success", "operations"],
  client_outreach: ["account manager", "csm", "success", "sales"],
  reporting: ["analyst", "reporting", "data"],
  tech: ["engineer", "developer", "tech", "integration"],
};

// Map each KPI to the category that should own the fix.
// - cpl / cpm / leads → media_buying (bid, budget, audience levers)
// - frequency / lead_quality → creative (creative fatigue, hook/offer mismatch)
const KPI_CATEGORY: Record<string, string> = {
  cpl: "media_buying",
  cpm: "media_buying",
  leads: "media_buying",
  frequency: "creative",
  lead_quality: "creative",
};

const KPI_LABEL: Record<string, string> = {
  cpl: "CPL",
  cpm: "CPM",
  leads: "Lead volume",
  frequency: "Frequency",
  lead_quality: "Lead quality",
};

function pickAssignee(
  category: string,
  members: { user_id: string; role: string }[],
  positions: Map<string, string>,
  overrides: Map<string, string>,
): string | null {
  const override = overrides.get(category);
  if (override && members.some((m) => m.user_id === override)) return override;
  const kws = POSITION_KEYWORDS[category] ?? [];
  for (const kw of kws) {
    const hit = members.find((m) => (positions.get(m.user_id) ?? "").toLowerCase().includes(kw));
    if (hit) return hit.user_id;
  }
  return members.find((m) => m.role === "owner")?.user_id ?? members[0]?.user_id ?? null;
}


const ACTIVE_STATUSES = ["GREEN", "YELLOW", "RED", "LEARNING", "LAUNCHING", "RELAUNCH"];

function fmtValue(key: string, value: number): string {
  if (key === "cpl" || key === "cpm") return `$${Number(value).toFixed(2)}`;
  if (key === "frequency") return Number(value).toFixed(2);
  if (key === "lead_quality") return `${Number(value).toFixed(0)}%`;
  return String(Math.round(value));
}

function describeThreshold(spec: any): string {
  if (!spec) return "";
  const dir = spec.direction ?? "lower";
  if (dir === "lower") return `target ≤ ${spec.green}, red > ${spec.yellow}`;
  if (dir === "higher") return `target ≥ ${spec.green}, red < ${spec.yellow}`;
  return `band ${spec.green_min}–${spec.green_max}`;
}

async function processWorkspace(admin: ReturnType<typeof createClient>, workspaceId: string) {
  const sinceIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: clients, error: cErr } = await admin
    .from("clients")
    .select("id, name, brand, status, launched_at")
    .eq("workspace_id", workspaceId)
    .in("status", ACTIVE_STATUSES);
  if (cErr) throw cErr;
  if (!clients || clients.length === 0) return { workspace_id: workspaceId, breaches: 0, created: 0 };

  // Skip clients launched <3 days ago (still in learning).
  const eligible = clients.filter(
    (c: any) => !c.launched_at || Date.now() - new Date(c.launched_at).getTime() > 3 * 24 * 60 * 60 * 1000,
  );
  if (eligible.length === 0) return { workspace_id: workspaceId, breaches: 0, created: 0 };
  const clientIds = eligible.map((c: any) => c.id);

  // Existing open KPI tasks for dedupe (last 3 days, title starts with "[KPI:")
  const { data: openTasks } = await admin
    .from("client_notes")
    .select("client_id, title")
    .eq("workspace_id", workspaceId)
    .eq("kind", "task")
    .eq("done", false)
    .in("client_id", clientIds)
    .gte("created_at", sinceIso)
    .like("title", "[KPI:%");
  const alreadyOpen = new Set<string>();
  for (const t of (openTasks ?? []) as any[]) {
    const m = String(t.title ?? "").match(/^\[KPI:([^\]]+)\]/);
    if (m && t.client_id != null) alreadyOpen.add(`${t.client_id}:${m[1]}`);
  }

  // Workspace members + positions for routing.
  const { data: members } = await admin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  const memberIds = (members ?? []).map((m: any) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await admin.from("profiles").select("id, position").in("id", memberIds)
    : { data: [] as any[] };
  const positions = new Map<string, string>();
  for (const p of (profiles ?? []) as any[]) {
    if (p?.position) positions.set(p.id, String(p.position));
  }

  // Admin-defined per-category routing overrides.
  const { data: routingRows } = await admin
    .from("task_routing_rules")
    .select("category, assigned_user_id")
    .eq("workspace_id", workspaceId);
  const overrides = new Map<string, string>();
  for (const r of (routingRows ?? []) as any[]) {
    if (r?.category && r?.assigned_user_id) overrides.set(r.category, r.assigned_user_id);
  }


  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 0);
  const dueIso = endOfToday.toISOString();

  const rows: any[] = [];
  let breachCount = 0;

  for (const c of eligible as any[]) {
    const { data: redData, error: rErr } = await admin.rpc("client_red_kpis", { _client_id: c.id });
    if (rErr) {
      console.error("client_red_kpis failed", c.id, rErr);
      continue;
    }
    const red = (redData ?? []) as Array<{ key: string; value: number; direction: string; spec: any }>;
    if (red.length === 0) continue;
    breachCount += red.length;

    const display = c.brand || c.name || `Client ${c.id}`;

    for (const r of red) {
      const dedupeKey = `${c.id}:${r.key}`;
      if (alreadyOpen.has(dedupeKey)) continue;

      const category = KPI_CATEGORY[r.key] ?? "media_buying";
      const assignee = pickAssignee(category, (members ?? []) as any, positions);
      if (!assignee) continue;

      const label = KPI_LABEL[r.key] ?? r.key;
      const valStr = fmtValue(r.key, Number(r.value));
      const thresh = describeThreshold(r.spec);

      rows.push({
        workspace_id: workspaceId,
        client_id: c.id,
        user_id: assignee,
        assigned_to: assignee,
        title: `[KPI:${r.key}] ${label} breach — ${display} (${valStr})`,
        content:
          `${display} is in the RED on ${label}. Current value: ${valStr}` +
          (thresh ? ` (${thresh}).` : ".") +
          ` Category: ${category}. Investigate today and ship a fix — ` +
          (category === "creative"
            ? "review creative fatigue, rotate hooks/offers, and queue new variants."
            : "review budgets, audiences, placements, and bid strategy."),
        kind: "task",
        priority: "high",
        due_at: dueIso,
        next_due_at: dueIso,
      });
    }
  }

  if (rows.length === 0) {
    return { workspace_id: workspaceId, breaches: breachCount, created: 0 };
  }

  const { data: inserted, error: insErr } = await admin.from("client_notes").insert(rows).select("id");
  if (insErr) throw insErr;
  return { workspace_id: workspaceId, breaches: breachCount, created: inserted?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    let workspaceIds: string[] = [];
    if (body.workspaceId) {
      workspaceIds = [String(body.workspaceId)];
    } else {
      const { data, error } = await admin.from("workspaces").select("id");
      if (error) throw error;
      workspaceIds = (data ?? []).map((w: any) => w.id);
    }

    const results = [];
    for (const wid of workspaceIds) {
      try {
        results.push(await processWorkspace(admin, wid));
      } catch (e) {
        console.error("kpi-breach-tasks-cron workspace failed", wid, e);
        results.push({ workspace_id: wid, error: String((e as any)?.message ?? e) });
      }
    }
    return json({ ok: true, workspaces: results.length, results });
  } catch (e) {
    console.error("kpi-breach-tasks-cron fatal", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});
