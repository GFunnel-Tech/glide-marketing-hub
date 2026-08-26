// Scan client_report_schedules for due runs and invoke report-generate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function computeNextRun(cadence: string, dayOfWeek: number | null, dayOfMonth: number | null, sendHour: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(sendHour ?? 9, 0, 0, 0);
  if (cadence === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    const target = ((dayOfWeek ?? 1) - next.getUTCDay() + 7) % 7 || 7;
    next.setUTCDate(next.getUTCDate() + target);
  } else if (cadence === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(dayOfMonth ?? 1);
  } else {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

function periodFor(cadence: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  if (cadence === "daily") start.setUTCDate(end.getUTCDate() - 1);
  else if (cadence === "monthly") start.setUTCMonth(end.getUTCMonth() - 1);
  else start.setUTCDate(end.getUTCDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: due } = await supabase
    .from("client_report_schedules")
    .select("*")
    .eq("active", true)
    .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`)
    .limit(50);


  const results: any[] = [];
  for (const s of due ?? []) {
    const { start, end } = periodFor(s.cadence);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/report-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          clientId: s.client_id,
          periodStart: start,
          periodEnd: end,
          scheduleId: s.id,
          recipients: s.recipients,
          triggerType: "scheduled",
        }),
      });
      const data = await r.json();
      const nextRun = computeNextRun(s.cadence, s.day_of_week, s.day_of_month, s.send_hour ?? 9);
      await supabase
        .from("client_report_schedules")
        .update({ last_run_at: new Date().toISOString(), next_run_at: nextRun.toISOString() })
        .eq("id", s.id);
      results.push({ scheduleId: s.id, ok: r.ok, ...data });
    } catch (e) {
      results.push({ scheduleId: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ processed: results.length, results });
});
