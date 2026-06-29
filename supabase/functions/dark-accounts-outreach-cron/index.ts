// Dark-account outreach cron.
//
// Scans every workspace for "dark" client accounts — active clients with no
// meaningful Meta activity in the last 7 days — and creates one outreach task
// per dark client (kind=task, category=client_outreach). Tasks are routed to
// the workspace member whose profile.position matches the category (same
// mapping used by the morning brief). Falls back to the workspace owner.
//
// Dedupes by tagging each task with `signals.dark_outreach_key` and skipping
// any client that already has an open dark-outreach task within the last 7
// days. Designed to be invoked daily by pg_cron.
//
// Body: { workspaceId?: string }  (omit to run across every workspace)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Categories an outreach task can be routed under. Mirrors the keyword map in
// src/hooks/useMorningBrief.ts so cron-generated tasks land with the same
// teammate the morning brief would have picked.
const POSITION_KEYWORDS: Record<string, string[]> = {
  creative: ["content", "creative", "design", "video", "copywriter"],
  media_buying: ["media buy", "media buyer", "buying", "paid", "ads specialist", "ppc"],
  account_management: ["account manager", "account exec", "csm", "success", "operations"],
  client_outreach: ["account manager", "csm", "success", "sales"],
  reporting: ["analyst", "reporting", "data"],
  tech: ["engineer", "developer", "tech", "integration"],
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


// Active statuses we consider for outreach. We deliberately skip clients that
// are paused, cancelled, blocked, or still in onboarding — they aren't "dark",
// they're intentionally off.
const ACTIVE_STATUSES = ["GREEN", "YELLOW", "RED", "LEARNING", "LAUNCHING", "RELAUNCH"];

async function processWorkspace(admin: ReturnType<typeof createClient>, workspaceId: string) {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  // 1) Candidate clients in the workspace.
  const { data: clients, error: cErr } = await admin
    .from("clients")
    .select("id, name, brand, status, spend, leads, launched_at")
    .eq("workspace_id", workspaceId)
    .in("status", ACTIVE_STATUSES);
  if (cErr) throw cErr;
  if (!clients || clients.length === 0) return { workspace_id: workspaceId, dark: 0, created: 0 };

  const clientIds = clients.map((c: any) => c.id);

  // 2) Recent Meta spend per client (last 7 days).
  const { data: spendRows } = await admin
    .from("meta_insights_daily")
    .select("ad_account_id, spend, leads, date, meta_ad_accounts!inner(client_id, workspace_id)")
    .gte("date", sinceDate)
    .eq("meta_ad_accounts.workspace_id", workspaceId);
  const spendByClient = new Map<number, { spend: number; leads: number }>();
  for (const row of (spendRows ?? []) as any[]) {
    const cid = row.meta_ad_accounts?.client_id;
    if (!cid) continue;
    const prev = spendByClient.get(cid) ?? { spend: 0, leads: 0 };
    spendByClient.set(cid, {
      spend: prev.spend + Number(row.spend ?? 0),
      leads: prev.leads + Number(row.leads ?? 0),
    });
  }

  // 3) Recent Meta leads per client.
  const { data: leadRows } = await admin
    .from("meta_leads")
    .select("client_id")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds)
    .gte("created_time", sinceIso);
  const leadsByClient = new Map<number, number>();
  for (const r of (leadRows ?? []) as any[]) {
    if (r.client_id == null) continue;
    leadsByClient.set(r.client_id, (leadsByClient.get(r.client_id) ?? 0) + 1);
  }

  // 4) Existing open dark-outreach tasks, so we don't pile up duplicates.
  // We tag every cron-generated task with the title prefix "Reach out to "
  // and dedupe per client over the last 7 days.
  const { data: openTasks } = await admin
    .from("client_notes")
    .select("client_id, title")
    .eq("workspace_id", workspaceId)
    .eq("kind", "task")
    .eq("done", false)
    .in("client_id", clientIds)
    .gte("created_at", sinceIso)
    .like("title", "Reach out to %");
  const alreadyOpen = new Set<number>();
  for (const t of (openTasks ?? []) as any[]) {
    if (t.client_id != null) alreadyOpen.add(t.client_id);
  }

  // 5) Determine dark clients: zero spend AND zero leads in the last 7 days,
  //    and at least 3 days past launch so brand-new launches don't trip it.
  const dark = clients.filter((c: any) => {
    if (alreadyOpen.has(c.id)) return false;
    const s = spendByClient.get(c.id);
    const l = leadsByClient.get(c.id) ?? 0;
    const noSpend = !s || s.spend < 1;
    const noLeads = l === 0 && (!s || s.leads === 0);
    const launchedLongEnough =
      !c.launched_at || Date.now() - new Date(c.launched_at).getTime() > 3 * 24 * 60 * 60 * 1000;
    return noSpend && noLeads && launchedLongEnough;
  });

  if (dark.length === 0) return { workspace_id: workspaceId, dark: 0, created: 0 };

  // 6) Resolve workspace members + their positions for assignment.
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
  const assignee = pickAssignee("client_outreach", (members ?? []) as any, positions);
  if (!assignee) return { workspace_id: workspaceId, dark: dark.length, created: 0 };

  // 7) Build one outreach task per dark client.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 0);
  const dueIso = endOfToday.toISOString();
  

  const rows = dark.map((c: any) => {
    const display = c.brand || c.name || `Client ${c.id}`;
    return {
      workspace_id: workspaceId,
      client_id: c.id,
      user_id: assignee,
      assigned_to: assignee,
      title: `Reach out to ${display} — no activity in 7 days`,
      content:
        `${display} has had no Meta spend and no new leads in the last 7 days. ` +
        `Call/email the client today to confirm status, surface blockers, and get the account back live.`,
      kind: "task",
      priority: "high",
      due_at: dueIso,
      next_due_at: dueIso,
    };
  });

  const { data: inserted, error: insErr } = await admin.from("client_notes").insert(rows).select("id");
  if (insErr) throw insErr;
  return { workspace_id: workspaceId, dark: dark.length, created: inserted?.length ?? 0 };
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
        console.error("dark-accounts-outreach-cron workspace failed", wid, e);
        results.push({ workspace_id: wid, error: String((e as any)?.message ?? e) });
      }
    }
    return json({ ok: true, workspaces: results.length, results });
  } catch (e) {
    console.error("dark-accounts-outreach-cron fatal", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});
