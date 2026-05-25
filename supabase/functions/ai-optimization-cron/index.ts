// Runs on a recurring cron schedule (every 15 min). For every active
// client_optimization_schedules row whose next_run_at <= now(), invokes the
// ai-agent with a synthetic system prompt and reschedules.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function computeNextRun(cadence: string, dayOfWeek: number | null, hour: number, tz: string): Date {
  // Compute next future occurrence in the given timezone (best-effort using UTC arithmetic).
  // For 'daily' -> tomorrow at hour. For 'weekly' -> next matching day_of_week at hour.
  const now = new Date();
  // Get current hour/day in tz
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const curWd = wdMap[parts.weekday as string] ?? 0;

  if (cadence === "weekly") {
    const targetWd = dayOfWeek ?? 1;
    let daysAhead = (targetWd - curWd + 7) % 7;
    if (daysAhead === 0) daysAhead = 7; // always next week to avoid double-run today
    const d = new Date(now.getTime() + daysAhead * 86400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  }
  // daily: tomorrow at hour UTC-ish
  const d = new Date(now.getTime() + 86400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const nowIso = new Date().toISOString();

    const { data: due, error } = await admin
      .from("client_optimization_schedules")
      .select("id,workspace_id,client_id,cadence,day_of_week,run_hour,timezone,prompt_override")
      .eq("active", true)
      .lte("next_run_at", nowIso)
      .limit(25);
    if (error) return json({ error: error.message }, 500);
    if (!due?.length) return json({ ran: 0 });

    const results: any[] = [];
    for (const s of due) {
      const prompt = s.prompt_override?.trim()
        || "Run the scheduled optimization. Pull current ad performance, apply the saved optimization rules for this client, and propose or execute pause / resume / budget changes to lower CPM and improve CPL. Be conservative; explain your reasoning.";

      let runStatus = "ok";
      let summary: string | null = null;
      let toolEvents: any = null;
      let runError: string | null = null;

      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Service role auth tells ai-agent this is a scheduled system run.
            Authorization: `Bearer ${SERVICE_KEY}`,
            "x-system-trigger": "scheduled-optimization",
          },
          body: JSON.stringify({
            workspaceId: s.workspace_id,
            clientId: s.client_id,
            scheduled: true,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `ai-agent ${r.status}`);
        summary = (j.reply || "").slice(0, 2000);
        toolEvents = j.toolEvents ?? [];
      } catch (e: any) {
        runStatus = "error";
        runError = e?.message || String(e);
      }

      const nextRun = computeNextRun(s.cadence, s.day_of_week, s.run_hour, s.timezone || "UTC");

      await admin.from("client_optimization_schedules")
        .update({
          last_run_at: nowIso,
          last_status: runStatus,
          last_summary: summary,
          next_run_at: nextRun.toISOString(),
        })
        .eq("id", s.id);

      await admin.from("optimization_run_log").insert({
        schedule_id: s.id,
        workspace_id: s.workspace_id,
        client_id: s.client_id,
        status: runStatus,
        summary,
        tool_events: toolEvents,
        error: runError,
      });

      results.push({ schedule_id: s.id, status: runStatus });
    }

    return json({ ran: results.length, results });
  } catch (e: any) {
    console.error("ai-optimization-cron fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
