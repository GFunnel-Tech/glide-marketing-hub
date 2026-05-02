// Pulls last 30 days of insights for every active Meta ad account in every
// active connection, upserts into meta_insights_daily, then rolls up the
// last 30 days into the clients table for each linked client.
//
// Triggered: hourly by pg_cron, manually from the UI, or per-workspace
// by passing { workspaceId } in the body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let workspaceFilter: string | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch active connections
  let connQ = admin
    .from("meta_connections")
    .select("id, workspace_id, access_token, status, token_expires_at")
    .eq("status", "active");
  if (workspaceFilter) connQ = connQ.eq("workspace_id", workspaceFilter);
  const { data: connections, error: connErr } = await connQ;
  if (connErr) return json({ error: connErr.message }, 500);

  let totalRows = 0;
  const errors: any[] = [];

  for (const conn of connections ?? []) {
    // skip expired
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      await admin.from("meta_connections").update({ status: "expired" }).eq("id", conn.id);
      continue;
    }

    const { data: accounts } = await admin
      .from("meta_ad_accounts")
      .select("id, act_id, workspace_id, client_id")
      .eq("connection_id", conn.id)
      .eq("is_active", true);

    for (const acc of accounts ?? []) {
      const log = await admin.from("meta_sync_log").insert({
        workspace_id: acc.workspace_id,
        connection_id: conn.id,
        ad_account_id: acc.id,
        trigger: workspaceFilter ? "manual" : "scheduled",
        status: "running",
      }).select().single();

      try {
        const fields = [
          "spend","impressions","clicks","ctr","cpm","frequency","reach",
          "actions","cost_per_action_type",
        ].join(",");
        const url = `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${fields}&time_increment=1&date_preset=last_30d&level=account&limit=500&access_token=${encodeURIComponent(conn.access_token)}`;

        const res = await fetch(url);
        const json_ = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(json_));

        const rows = (json_.data ?? []).map((d: any) => {
          const leadAction = (d.actions ?? []).find((a: any) =>
            a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
          );
          const leads = leadAction ? Number(leadAction.value) : 0;
          const spend = Number(d.spend ?? 0);
          return {
            workspace_id: acc.workspace_id,
            ad_account_id: acc.id,
            date: d.date_start,
            spend,
            impressions: Number(d.impressions ?? 0),
            clicks: Number(d.clicks ?? 0),
            leads,
            cpl: leads > 0 ? spend / leads : 0,
            cpm: Number(d.cpm ?? 0),
            ctr: Number(d.ctr ?? 0),
            frequency: Number(d.frequency ?? 0),
            reach: Number(d.reach ?? 0),
            raw: d,
          };
        });

        if (rows.length) {
          const { error: upErr } = await admin
            .from("meta_insights_daily")
            .upsert(rows, { onConflict: "ad_account_id,date" });
          if (upErr) throw upErr;
        }

        await admin.from("meta_ad_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acc.id);

        await admin.from("meta_sync_log").update({
          status: "success",
          rows_synced: rows.length,
          finished_at: new Date().toISOString(),
        }).eq("id", log.data!.id);

        totalRows += rows.length;
      } catch (e) {
        errors.push({ account: acc.act_id, error: String(e) });
        await admin.from("meta_sync_log").update({
          status: "error",
          error_message: String(e),
          finished_at: new Date().toISOString(),
        }).eq("id", log.data!.id);
      }
    }
  }

  // ROLLUP to clients table — sum last 30 days per linked client
  await rollupClients(admin, workspaceFilter);

  return json({ ok: true, rowsSynced: totalRows, errors });
});

async function rollupClients(admin: any, workspaceFilter: string | null) {
  let q = admin
    .from("meta_ad_accounts")
    .select("client_id, workspace_id")
    .not("client_id", "is", null);
  if (workspaceFilter) q = q.eq("workspace_id", workspaceFilter);
  const { data: links } = await q;
  const clientIds = Array.from(new Set((links ?? []).map((l: any) => l.client_id)));

  for (const cid of clientIds) {
    // get all ad accounts linked to this client
    const { data: accs } = await admin
      .from("meta_ad_accounts")
      .select("id")
      .eq("client_id", cid);
    const ids = (accs ?? []).map((a: any) => a.id);
    if (!ids.length) continue;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: rows } = await admin
      .from("meta_insights_daily")
      .select("spend,leads,cpm,frequency,impressions")
      .in("ad_account_id", ids)
      .gte("date", since);

    const sum = (rows ?? []).reduce((acc: any, r: any) => ({
      spend: acc.spend + Number(r.spend ?? 0),
      leads: acc.leads + Number(r.leads ?? 0),
      cpmW: acc.cpmW + Number(r.cpm ?? 0) * Number(r.impressions ?? 0),
      impressions: acc.impressions + Number(r.impressions ?? 0),
      freqW: acc.freqW + Number(r.frequency ?? 0) * Number(r.impressions ?? 0),
    }), { spend: 0, leads: 0, cpmW: 0, impressions: 0, freqW: 0 });

    const cpl = sum.leads > 0 ? sum.spend / sum.leads : 0;
    const cpm = sum.impressions > 0 ? sum.cpmW / sum.impressions : 0;
    const frequency = sum.impressions > 0 ? sum.freqW / sum.impressions : 0;

    await admin.from("clients").update({
      spend: sum.spend,
      leads: sum.leads,
      cpl,
      cpm,
      frequency,
    }).eq("id", cid);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
