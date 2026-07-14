// Auto-pause clients that are not actively spending.
// Any client currently in an "active" status (GREEN/YELLOW/RED/LEARNING/NEW/RELAUNCH/LAUNCHING)
// whose Meta spend over the last 2 days is $0 gets flipped to PAUSED so the main list
// stays focused on accounts that are actually delivering today.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ACTIVE_STATUSES = ["NEW", "LAUNCHING", "LEARNING", "RELAUNCH", "GREEN", "YELLOW", "RED"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let workspaceId: string | undefined;
  let dryRun = false;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceId = body?.workspaceId;
    dryRun = !!body?.dryRun;
  }

  try {
    let q = admin
      .from("clients")
      .select("id,name,workspace_id,status")
      .in("status", ACTIVE_STATUSES);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data: clients, error } = await q;
    if (error) throw error;

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 1); // yesterday + today
    const sinceDate = since.toISOString().slice(0, 10);

    const paused: { id: number; name: string }[] = [];
    const kept: number[] = [];

    // Chunk for parallel spend checks
    const CHUNK = 15;
    const list = clients ?? [];
    for (let i = 0; i < list.length; i += CHUNK) {
      await Promise.all(list.slice(i, i + CHUNK).map(async (c) => {
        const { data: accs } = await admin
          .from("meta_ad_accounts")
          .select("id")
          .eq("client_id", c.id);
        const accIds = (accs ?? []).map((a: any) => a.id);
        if (accIds.length === 0) {
          // No Meta accounts linked: not "actively spending" — pause it
          paused.push({ id: c.id, name: c.name });
          return;
        }
        const { data: rows } = await admin
          .from("meta_insights_daily")
          .select("spend")
          .in("ad_account_id", accIds)
          .gte("date", sinceDate);
        const spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.spend || 0), 0);
        if (spend <= 0) {
          paused.push({ id: c.id, name: c.name });
        } else {
          kept.push(c.id);
        }
      }));
    }

    if (!dryRun && paused.length > 0) {
      const ids = paused.map((p) => p.id);
      const { error: upErr } = await admin
        .from("clients")
        .update({ status: "PAUSED", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (upErr) throw upErr;
    }

    return json({
      ok: true,
      dryRun,
      scanned: list.length,
      paused_count: paused.length,
      kept_active: kept.length,
      paused,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
