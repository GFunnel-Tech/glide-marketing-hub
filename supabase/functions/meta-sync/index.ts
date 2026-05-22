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
  let includeDetails = false;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
    includeDetails = body.includeDetails === true;
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

        const { res, json: json_ } = await fetchJsonWithTimeout(url);
        if (!res.ok) throw new Error(JSON.stringify(json_));

        const rows = (json_.data ?? []).map((d: any) => {
          const leads = extractLeads(d.actions);
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

        // ---- Campaigns sync (per ad account) ----
        let campaignRows = 0;
        if (acc.client_id) {
          campaignRows = await syncCampaigns(admin, acc, conn.access_token);
        }

        // ---- Granular daily insights (campaign + adset + ad) ----
        // The bulk workspace sync must finish quickly so account analytics
        // populate reliably. Detailed creative/ad scans are intentionally opt-in.
        const granularRows = includeDetails ? await syncGranularInsights(admin, acc, conn.access_token) : 0;

        // ---- Ad-level creatives + 30d performance (for the Creatives page) ----
        let adRows = 0;
        if (includeDetails) {
          try { adRows = await syncAds(admin, acc, conn.access_token); }
          catch (e) { errors.push({ account: acc.act_id, scope: "ads", error: String(e) }); }
        }

        await admin.from("meta_ad_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acc.id);

        await admin.from("meta_sync_log").update({
          status: "success",
          rows_synced: rows.length + campaignRows + granularRows + adRows,
          finished_at: new Date().toISOString(),
        }).eq("id", log.data!.id);

        totalRows += rows.length + campaignRows + granularRows + adRows;
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

  // 30-day window — same boundary for spend, reported leads AND lead dedup
  // so the resulting CPLs reconcile.
  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sinceDate = new Date(sinceMs).toISOString().slice(0, 10);
  const sinceIso = new Date(sinceMs).toISOString();

  for (const cid of clientIds) {
    // All ad accounts linked to this client
    const { data: accs } = await admin
      .from("meta_ad_accounts")
      .select("id")
      .eq("client_id", cid);
    const ids = (accs ?? []).map((a: any) => a.id);
    if (!ids.length) continue;

    // ---- 1) Spend + Meta-reported leads from daily insights ----
    const { data: rows } = await admin
      .from("meta_insights_daily")
      .select("spend,leads,cpm,frequency,impressions,clicks")
      .in("ad_account_id", ids)
      .gte("date", sinceDate);

    const sum = (rows ?? []).reduce((acc: any, r: any) => ({
      spend: acc.spend + Number(r.spend ?? 0),
      leads: acc.leads + Number(r.leads ?? 0),
      clicks: acc.clicks + Number(r.clicks ?? 0),
      impressions: acc.impressions + Number(r.impressions ?? 0),
      cpmW: acc.cpmW + Number(r.cpm ?? 0) * Number(r.impressions ?? 0),
      freqW: acc.freqW + Number(r.frequency ?? 0) * Number(r.impressions ?? 0),
    }), { spend: 0, leads: 0, clicks: 0, impressions: 0, cpmW: 0, freqW: 0 });

    const reportedLeads = sum.leads;
    const cpl = reportedLeads > 0 ? sum.spend / reportedLeads : 0;
    const cpm = sum.impressions > 0 ? sum.cpmW / sum.impressions : 0;
    const frequency = sum.impressions > 0 ? sum.freqW / sum.impressions : 0;

    // ---- 2) Form CVR = leads / link_clicks (Meta convention) ----
    const formCvr = sum.clicks > 0 ? (reportedLeads / sum.clicks) * 100 : 0;

    // ---- 3) True (deduplicated) leads from meta_leads ----
    // Dedup key: lowercased email OR digits-only phone OR lead_id fallback.
    const { data: leadRows } = await admin
      .from("meta_leads")
      .select("lead_id,email,phone")
      .eq("client_id", cid)
      .gte("created_time", sinceIso)
      .limit(50000);

    const seen = new Set<string>();
    for (const l of leadRows ?? []) {
      const email = (l.email ?? "").trim().toLowerCase();
      const phone = (l.phone ?? "").replace(/\D+/g, "");
      const key = email || phone || `lid:${l.lead_id}`;
      if (key) seen.add(key);
    }
    const trueLeadsCount = seen.size;
    // Only trust dedup when we actually have lead-level data; otherwise
    // fall back to the Meta-reported number rather than silently writing 0.
    const haveLeadDetails = (leadRows ?? []).length > 0;
    const trueLeads = haveLeadDetails ? trueLeadsCount : reportedLeads;
    const trueCpl = trueLeads > 0 ? sum.spend / trueLeads : 0;
    // Flag double-count when Meta reports >15% more leads than we can dedupe
    const doubleCount = haveLeadDetails && reportedLeads > 0
      && reportedLeads > trueLeads * 1.15;

    await admin.from("clients").update({
      spend: sum.spend,
      leads: reportedLeads,
      reported_leads: reportedLeads,
      true_leads: trueLeads,
      cpl,
      true_cpl: trueCpl,
      cpm,
      frequency,
      form_cvr: formCvr,
      double_count: doubleCount,
      last_audit: new Date().toISOString().slice(0, 10),
    }).eq("id", cid);
  }
}

async function syncCampaigns(admin: any, acc: any, accessToken: string): Promise<number> {
  // 1. List campaigns for the ad account
  const campFields = "id,name,status,effective_status,objective,daily_budget,lifetime_budget";
  const campUrl = `https://graph.facebook.com/v21.0/${acc.act_id}/campaigns?fields=${campFields}&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  const campRes = await fetch(campUrl);
  const campJson = await campRes.json();
  if (!campRes.ok) throw new Error("campaigns: " + JSON.stringify(campJson));
  const campaigns = campJson.data ?? [];
  if (!campaigns.length) return 0;

  // 2. Pull last-30d insights at campaign level for the whole account in one call
  const insFields = "campaign_id,spend,impressions,clicks,cpm,ctr,frequency,actions";
  const insUrl = `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${insFields}&level=campaign&date_preset=last_30d&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  const insRes = await fetch(insUrl);
  const insJson = await insRes.json();
  const insightsByCampaign = new Map<string, any>();
  if (insRes.ok) {
    for (const row of insJson.data ?? []) {
      insightsByCampaign.set(row.campaign_id, row);
    }
  }

  // 3. Upsert into the existing public.campaigns table
  const rows = campaigns.map((c: any) => {
    const ins = insightsByCampaign.get(c.id) ?? {};
    const leads = extractLeads(ins.actions);
    const spend = Number(ins.spend ?? 0);
    const status = (c.effective_status === "ACTIVE" || c.status === "ACTIVE") ? "active" : "paused";
    // Surface ad-delivery problems Meta flags at campaign level.
    // Common values: DISAPPROVED, WITH_ISSUES, PENDING_REVIEW, PENDING_BILLING_INFO,
    // CAMPAIGN_PAUSED (when an ad inside is rejected and Meta paused delivery).
    const ISSUE_STATUSES = new Set([
      "DISAPPROVED",
      "WITH_ISSUES",
      "PENDING_REVIEW",
      "PENDING_BILLING_INFO",
      "IN_PROCESS",
    ]);
    const issues_status = ISSUE_STATUSES.has(c.effective_status) ? c.effective_status : null;
    return {
      id: c.id, // Meta's campaign id (text PK)
      client_id: acc.client_id,
      workspace_id: acc.workspace_id,
      name: c.name,
      status,
      spend,
      leads,
      true_leads: leads,
      cpl: leads > 0 ? spend / leads : 0,
      true_cpl: leads > 0 ? spend / leads : 0,
      cpm: Number(ins.cpm ?? 0),
      frequency: Number(ins.frequency ?? 0),
      ad_sets: 0,
      ads: 0,
      double_count: false,
      issues_status,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await admin.from("campaigns").upsert(rows, { onConflict: "id" });
  if (error) throw new Error("campaigns upsert: " + error.message);
  return rows.length;
}

// Pick the most accurate "lead" count from Meta's actions array.
// Meta returns multiple action_types; using find() picks whichever comes first
// and the aggregate "lead" bucket can include misconfigured pixel events
// (page views, clicks, video plays mislabeled as "Lead"). We prefer precise
// Lead Ads form submissions, then the standard pixel Lead event, and only
// fall back to the aggregate "lead" bucket as a last resort.
function extractLeads(actions: any[] | undefined | null): number {
  if (!Array.isArray(actions) || !actions.length) return 0;
  const byType = new Map<string, number>();
  for (const a of actions) {
    if (!a?.action_type) continue;
    byType.set(a.action_type, Number(a.value ?? 0));
  }
  // Priority order: native Lead Ads form > pixel Lead > offline > aggregate.
  const priority = [
    "onsite_conversion.lead_grouped", // Instant Forms (Meta Lead Ads)
    "leadgen.other",
    "offsite_conversion.fb_pixel_lead", // Website pixel Lead event
    "offline_conversion.lead",
    "lead", // Aggregate — least trustworthy, may include mislabeled events
  ];
  for (const t of priority) {
    if (byType.has(t)) return byType.get(t) || 0;
  }
  return 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json();
    return { res, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function syncGranularInsights(admin: any, acc: any, accessToken: string): Promise<number> {
  const fields = [
    "campaign_id","campaign_name","adset_id","adset_name","ad_id","ad_name",
    "spend","impressions","clicks","actions",
  ].join(",");

  let total = 0;
  for (const level of ["campaign", "adset", "ad"] as const) {
    const url = `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${fields}&level=${level}&time_increment=1&date_preset=last_30d&limit=500&access_token=${encodeURIComponent(accessToken)}`;
    let next: string | null = url;
    const rows: any[] = [];
    while (next) {
      const res = await fetch(next);
      const j = await res.json();
      if (!res.ok) break;
      for (const d of j.data ?? []) {
        const leads = extractLeads(d.actions);
        const objectId = level === "campaign" ? d.campaign_id : level === "adset" ? d.adset_id : d.ad_id;
        const objectName = level === "campaign" ? d.campaign_name : level === "adset" ? d.adset_name : d.ad_name;
        if (!objectId) continue;
        rows.push({
          workspace_id: acc.workspace_id,
          ad_account_id: acc.id,
          level,
          object_id: objectId,
          object_name: objectName,
          parent_campaign_id: d.campaign_id ?? null,
          parent_adset_id: d.adset_id ?? null,
          date: d.date_start,
          spend: Number(d.spend ?? 0),
          impressions: Number(d.impressions ?? 0),
          clicks: Number(d.clicks ?? 0),
          leads,
          raw: d,
        });
      }
      next = j.paging?.next ?? null;
    }
    if (rows.length) {
      // chunk to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await admin
          .from("meta_insights_granular_daily")
          .upsert(chunk, { onConflict: "ad_account_id,level,object_id,date" });
        if (error) throw new Error(`granular ${level}: ${error.message}`);
      }
      total += rows.length;
    }
  }
  return total;
}

// Pull every ad in the account with its creative + targeting + last-30d
// performance, and upsert into meta_ads for the Creatives page.
async function syncAds(admin: any, acc: any, accessToken: string): Promise<number> {
  const adFields = [
    "id","name","status","effective_status","created_time",
    "campaign_id","campaign{name}","adset_id","adset{name,targeting}",
    "creative{id,thumbnail_url,image_url,image_hash,video_id,body,title,call_to_action_type,object_story_spec,effective_object_story_id}",
  ].join(",");

  const ads: any[] = [];
  // Request a larger thumbnail (default is ~64px which looks blurry).
  let next: string | null =
    `https://graph.facebook.com/v21.0/${acc.act_id}/ads?fields=${adFields}&thumbnail_width=600&thumbnail_height=600&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  // safety cap: 5 pages = 1000 ads per account
  let page = 0;
  while (next && page < 5) {
    const r = await fetch(next);
    const j = await r.json();
    if (!r.ok) throw new Error("ads list: " + JSON.stringify(j));
    for (const a of j.data ?? []) ads.push(a);
    next = j.paging?.next ?? null;
    page++;
  }
  if (!ads.length) return 0;

  // Pull last-30d insights at ad level in one call
  const insFields = "ad_id,spend,impressions,clicks,ctr,actions";
  const insMap = new Map<string, any>();
  let insNext: string | null =
    `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${insFields}&level=ad&date_preset=last_30d&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  let ip = 0;
  while (insNext && ip < 10) {
    const r = await fetch(insNext);
    const j = await r.json();
    if (!r.ok) break;
    for (const row of j.data ?? []) insMap.set(row.ad_id, row);
    insNext = j.paging?.next ?? null;
    ip++;
  }

  const now = Date.now();
  const rows = ads.map((a: any) => {
    const ins = insMap.get(a.id) ?? {};
    const leads = extractLeads(ins.actions);
    const spend = Number(ins.spend ?? 0);
    const cre = a.creative ?? {};
    const story = cre.object_story_spec ?? {};
    const linkData = story.link_data ?? story.video_data ?? {};

    // body/title may live either directly on creative or inside object_story_spec
    const body = cre.body ?? linkData.message ?? linkData.description ?? null;
    const title = cre.title ?? linkData.name ?? null;
    const cta = cre.call_to_action_type ?? linkData.call_to_action?.type ?? null;
    const linkUrl = linkData.link ?? null;

    // creative_hash: image_hash if available, else video_id, else creative_id —
    // lets us group "same visual reused across ads".
    const creativeHash = cre.image_hash ?? cre.video_id ?? cre.id ?? null;

    const createdAt = a.created_time ? new Date(a.created_time) : null;
    const daysActive = createdAt
      ? Math.max(0, Math.floor((now - createdAt.getTime()) / 86_400_000))
      : 0;

    return {
      id: a.id,
      workspace_id: acc.workspace_id,
      client_id: acc.client_id,
      ad_account_id: acc.id,
      campaign_id: a.campaign_id ?? null,
      campaign_name: a.campaign?.name ?? null,
      adset_id: a.adset_id ?? null,
      adset_name: a.adset?.name ?? null,
      name: a.name ?? null,
      effective_status: a.effective_status ?? a.status ?? null,
      creative_id: cre.id ?? null,
      creative_hash: creativeHash,
      thumbnail_url: cre.thumbnail_url ?? null,
      video_id: cre.video_id ?? null,
      title,
      body,
      call_to_action_type: cta,
      link_url: linkUrl,
      targeting_summary: a.adset?.targeting ?? null,
      spend,
      impressions: Number(ins.impressions ?? 0),
      clicks: Number(ins.clicks ?? 0),
      leads,
      ctr: Number(ins.ctr ?? 0),
      cpl: leads > 0 ? spend / leads : 0,
      days_active: daysActive,
      first_seen_at: createdAt ? createdAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("meta_ads").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error("meta_ads upsert: " + error.message);
  }
  return rows.length;
}
