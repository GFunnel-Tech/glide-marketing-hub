// Generate a client performance report and store it in client_reports.
// Body: { clientId, periodStart?, periodEnd?, requestId?, scheduleId?, recipients?, triggerType? }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = Number(body.clientId);
    if (!Number.isFinite(clientId)) return json({ error: "clientId required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const end = body.periodEnd ? new Date(body.periodEnd) : new Date();
    const start = body.periodStart
      ? new Date(body.periodStart)
      : new Date(end.getFullYear(), end.getMonth(), 1);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const { data: client } = await supabase
      .from("clients")
      .select("id,name,brand,workspace_id,currency_code,website,bio")
      .eq("id", clientId)
      .maybeSingle();
    if (!client) return json({ error: "client not found" }, 404);

    // Ad accounts for this client
    const { data: accts } = await supabase
      .from("meta_ad_accounts")
      .select("id")
      .eq("client_id", clientId);
    const acctIds = (accts ?? []).map((a: any) => a.id);

    let insights: any[] = [];
    if (acctIds.length) {
      const { data } = await supabase
        .from("meta_insights_daily")
        .select("date,spend,leads,clicks,impressions,frequency")
        .in("ad_account_id", acctIds)
        .gte("date", startStr)
        .lte("date", endStr);
      insights = data ?? [];
    }

    const totals = insights.reduce(
      (a, r) => {
        a.spend += Number(r.spend || 0);
        a.leads += Number(r.leads || 0);
        a.clicks += Number(r.clicks || 0);
        a.impressions += Number(r.impressions || 0);
        return a;
      },
      { spend: 0, leads: 0, clicks: 0, impressions: 0 },
    );
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cvr = totals.clicks > 0 ? (totals.leads / totals.clicks) * 100 : 0;

    // Daily series for chart
    const daily = insights
      .map((r) => ({
        date: r.date,
        spend: Number(r.spend || 0),
        leads: Number(r.leads || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const shareToken =
      crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 8);

    const payload = {
      client: { id: client.id, name: client.name, brand: client.brand, currency: client.currency_code || "USD" },
      period: { start: startStr, end: endStr },
      totals: { ...totals, cpl, cpm, ctr, cvr },
      daily,
      generated_at: new Date().toISOString(),
    };

    const commentary =
      totals.leads > 0
        ? `Delivered ${totals.leads} leads at ${payload.client.currency} ${cpl.toFixed(2)} CPL across ${startStr} → ${endStr}.`
        : `No lead activity recorded in ${startStr} → ${endStr}.`;

    const { data: rep, error: repErr } = await supabase
      .from("client_reports")
      .insert({
        workspace_id: client.workspace_id,
        client_id: clientId,
        schedule_id: body.scheduleId ?? null,
        period_start: startStr,
        period_end: endStr,
        status: "ready",
        payload,
        commentary,
        share_token: shareToken,
        recipients: body.recipients ?? [],
        generated_at: new Date().toISOString(),
        trigger_type: body.triggerType || (body.scheduleId ? "scheduled" : "manual"),
      })
      .select()
      .single();
    if (repErr) return json({ error: repErr.message }, 500);

    if (body.requestId) {
      await supabase
        .from("report_requests")
        .update({ status: "ready", file_url: `/r/${shareToken}` })
        .eq("id", body.requestId);
    }

    return json({ ok: true, reportId: rep.id, shareToken, url: `/r/${shareToken}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
