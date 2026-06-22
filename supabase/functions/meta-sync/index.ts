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
  let adAccountFilter: string | null = null;
  // Default to true so scheduled (cron) syncs always refresh granular
  // campaign/adset/ad insights — otherwise the per-campaign breakdown in the
  // Client Profile / date-range views drifts out of date.
  let includeDetails = true;
  let adsOnly = false;
  // Tier controls polling cost & freshness window:
  //   hot  -> today only, account-level only (cheapest, runs every 20 min)
  //   warm -> last 3 days, account + campaign rollup (hourly, attribution catch-up)
  //   cold -> last 28 days + full granular ads/campaigns/adsets (nightly)
  // Default is null = legacy behavior (last_30d + granular) so the manual
  // "Sync now" button keeps working unchanged.
  let tier: "hot" | "warm" | "cold" | null = null;
  // Manual UI invocations should return immediately and let the long-running
  // Meta API loop finish in the background (avoids "connection closed before
  // message completed" timeouts when a workspace has many ad accounts).
  let waitForCompletion = false;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
    adAccountFilter = body.adAccountId ?? null;
    adsOnly = body.adsOnly === true || (body.syncAds === true && body.includeDetails !== true);
    if (body.tier === "hot" || body.tier === "warm" || body.tier === "cold") {
      tier = body.tier;
    }
    // Explicit `includeDetails: false` opts out; otherwise granular sync runs.
    // For hot/warm tiers, force granular OFF unless caller overrides.
    const tierGranular = tier === "cold" ? true : tier ? false : true;
    includeDetails = body.includeDetails === false
      ? false
      : (body.includeDetails === true || body.syncAds === true || adsOnly || tierGranular);
    waitForCompletion = body.wait === true;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const work = async () => {
    return await runSync(admin, { workspaceFilter, includeDetails, adsOnly, tier });
  };

  // Background mode: return 202 immediately, keep the loop running via waitUntil.
  if (!waitForCompletion) {
    // @ts-ignore -- EdgeRuntime is provided by Supabase's Deno runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work().catch((e) => console.error("meta-sync bg error", e)));
    } else {
      work().catch((e) => console.error("meta-sync bg error", e));
    }
    return json({ ok: true, queued: true, message: "Sync started in background" }, 202);
  }

  const result = await work();
  return json(result);
});

async function runSync(
  admin: any,
  opts: { workspaceFilter: string | null; includeDetails: boolean; adsOnly: boolean; tier: "hot" | "warm" | "cold" | null },
) {
  const { workspaceFilter, includeDetails, adsOnly, tier } = opts;
  // Meta finalizes attribution within ~72h. Once a day is stored it doesn't
  // need to be re-pulled — that's why the cold tier window is only 7 days,
  // not 30. Older days are already frozen in meta_insights_daily.
  const datePreset = tier === "hot" ? "today" : tier === "warm" ? "last_3d" : tier === "cold" ? "last_7d" : "last_7d";


  // Fetch active connections
  let connQ = admin
    .from("meta_connections")
    .select("id, workspace_id, access_token, status, token_expires_at")
    .eq("status", "active");
  if (workspaceFilter) connQ = connQ.eq("workspace_id", workspaceFilter);
  const { data: connections, error: connErr } = await connQ;
  if (connErr) return { error: connErr.message };

  let totalRows = 0;
  let skippedRateLimited = 0;
  let skippedColdHot = 0;
  const errors: any[] = [];

  // Hot-tier filter: only clients that are actively running or had spend today.
  const HOT_STATUSES = new Set(["LAUNCHING", "LEARNING", "GREEN", "YELLOW", "RED", "RELAUNCH"]);

  for (const conn of connections ?? []) {
    // skip expired
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      await admin.from("meta_connections").update({ status: "expired" }).eq("id", conn.id);
      continue;
    }

    const { data: accounts } = await admin
      .from("meta_ad_accounts")
      .select("id, act_id, workspace_id, client_id, rate_limited_until")
      .eq("connection_id", conn.id)
      .eq("is_active", true);

    // Shuffle so the same accounts aren't always processed last (and starved
    // if the function hits its execution-time limit before reaching them).
    const shuffled = [...(accounts ?? [])].sort(() => Math.random() - 0.5);

    const CONCURRENCY = 6;
    const syncOneAccount = async (acc: any) => {
      // Respect Meta rate-limit backoff stamped from a prior run.
      if (acc.rate_limited_until && new Date(acc.rate_limited_until) > new Date()) {
        skippedRateLimited++;
        return;
      }

      // Hot tier: skip accounts whose client isn't actively running AND had
      // no spend today. Keeps the 20-min loop dirt-cheap.
      if (tier === "hot") {
        let isHot = false;
        if (acc.client_id) {
          const { data: c } = await admin
            .from("clients").select("status").eq("id", acc.client_id).maybeSingle();
          if (c?.status && HOT_STATUSES.has(String(c.status))) isHot = true;
        }
        if (!isHot) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: todayRow } = await admin
            .from("meta_insights_daily")
            .select("spend")
            .eq("ad_account_id", acc.id)
            .eq("date", today)
            .gt("spend", 0)
            .limit(1)
            .maybeSingle();
          if (todayRow) isHot = true;
        }
        if (!isHot) { skippedColdHot++; return; }
      }

      const log = await admin.from("meta_sync_log").insert({
        workspace_id: acc.workspace_id,
        connection_id: conn.id,
        ad_account_id: acc.id,
        trigger: workspaceFilter ? "manual" : (tier ? `scheduled-${tier}` : "scheduled"),
        status: "running",
      }).select().single();

      try {
        if (adsOnly) {
          const adRows = await syncAds(admin, acc, conn.access_token);
          await admin.from("meta_ad_accounts")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", acc.id);

          await admin.from("meta_sync_log").update({
            status: "success",
            rows_synced: adRows,
            finished_at: new Date().toISOString(),
          }).eq("id", log.data!.id);

          totalRows += adRows;
          return;
        }

        const fields = [
          "spend","impressions","clicks","ctr","cpm","frequency","reach",
          "actions","cost_per_action_type",
        ].join(",");
        const url = `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${fields}&time_increment=1&date_preset=${datePreset}&level=account&limit=500&access_token=${encodeURIComponent(conn.access_token)}`;

        const { res, json: json_ } = await fetchJsonWithTimeout(url);
        if (!res.ok) {
          // Meta rate-limit codes — stamp backoff and skip cleanly.
          const code = json_?.error?.code;
          const sub = json_?.error?.error_subcode;
          if (code === 17 || code === 4 || code === 32 || sub === 2446079 || code === 80004) {
            await admin.from("meta_ad_accounts")
              .update({ rate_limited_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
              .eq("id", acc.id);
            await admin.from("meta_sync_log").update({
              status: "rate_limited",
              error_message: JSON.stringify(json_).slice(0, 500),
              finished_at: new Date().toISOString(),
            }).eq("id", log.data!.id);
            skippedRateLimited++;
            return;
          }
          throw new Error(JSON.stringify(json_));
        }

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
        // Only re-fetch the window Meta could still revise. Older days are
        // already stored and frozen — pulling them again wastes rate-limit.
        const granularPreset =
          tier === "hot" ? "today" :
          tier === "warm" ? "last_3d" :
          tier === "cold" ? "last_7d" :
          "last_7d";
        const granularRows = includeDetails
          ? await syncGranularInsights(admin, acc, conn.access_token, granularPreset)
          : 0;


        // ---- Ad-level creatives + 30d performance (for the Creatives page) ----
        let adRows = 0;
        let adsError: string | null = null;
        if (includeDetails) {
          try { adRows = await syncAds(admin, acc, conn.access_token); }
          catch (e) {
            adsError = String(e);
            errors.push({ account: acc.act_id, scope: "ads", error: adsError });
          }
        }

        await admin.from("meta_ad_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acc.id);

        await admin.from("meta_sync_log").update({
          // Surface partial failures: if ads failed but insights/campaigns
          // succeeded, mark as "partial" and stamp the error so the UI can
          // show why the Creatives/Hierarchy dropdown is empty for this
          // account.
          status: adsError ? "partial" : "success",
          error_message: adsError ? ("ads: " + adsError).slice(0, 2000) : null,
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
    };

    // Process accounts in parallel batches so a single slow account can't
    // starve the rest of the workspace within the function's time budget.
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < shuffled.length) {
        const acc = shuffled[cursor++];
        await syncOneAccount(acc);
      }
    });
    await Promise.all(workers);
  }

  // ROLLUP — sums last-30d insights + dedupes leads per client in one
  // SQL round-trip, so it's now cheap enough to run on every tier
  // (including hot) and keep client KPIs always current.
  await rollupClients(admin, workspaceFilter);


  return { ok: true, tier, datePreset, rowsSynced: totalRows, skippedRateLimited, skippedColdHot, errors };
}

async function rollupClients(admin: any, workspaceFilter: string | null) {
  // Single bulk SQL aggregation (replaces the old per-client loop that
  // routinely timed out partway through, leaving most clients with stale
  // spend/leads/CPL). Sums last-30-day insights and dedupes meta_leads for
  // every linked client in one round-trip.
  const { error } = await admin.rpc("rollup_client_kpis_for_workspace", {
    _workspace_id: workspaceFilter,
  });
  if (error) console.error("rollup_client_kpis_for_workspace error:", error);
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

  // Shared accounts: preserve user-set campaigns.client_id rather than overwriting
  // with acc.client_id (which is null when the account is shared between clients).
  const { data: members } = await admin
    .from("meta_ad_account_clients")
    .select("client_id")
    .eq("ad_account_id", acc.id);
  const memberClientIds: number[] = (members ?? []).map((r: any) => r.client_id);
  const isShared = memberClientIds.length > 0;
  const { data: existing } = await admin
    .from("campaigns")
    .select("id, client_id")
    .in("id", campaigns.map((c: any) => c.id));
  const existingClientById = new Map<string, number | null>(
    (existing ?? []).map((r: any) => [r.id, r.client_id ?? null]),
  );
  // First member is the default target for newly-discovered campaigns on a shared
  // account, so they show up in the mapping UI ready to be reassigned.
  const defaultSharedClientId = memberClientIds[0] ?? null;

  // 3. Upsert into the existing public.campaigns table
  const rows = campaigns.map((c: any) => {
    const ins = insightsByCampaign.get(c.id) ?? {};
    const leads = extractLeads(ins.actions);
    const spend = Number(ins.spend ?? 0);
    const status = (c.effective_status === "ACTIVE" || c.status === "ACTIVE") ? "active" : "paused";
    const ISSUE_STATUSES = new Set([
      "DISAPPROVED",
      "WITH_ISSUES",
      "PENDING_REVIEW",
      "PENDING_BILLING_INFO",
      "IN_PROCESS",
    ]);
    const issues_status = ISSUE_STATUSES.has(c.effective_status) ? c.effective_status : null;
    // Attribution:
    //  - shared accounts → keep existing mapping; for brand-new campaigns, fall
    //    back to the first member client so the row is insertable and visible
    //    in the campaign mapping UI for reassignment.
    //  - single-owner accounts → inherit owner client_id.
    let client_id: number | null;
    if (isShared) {
      client_id = existingClientById.has(c.id)
        ? existingClientById.get(c.id)!
        : defaultSharedClientId;
    } else {
      client_id = acc.client_id;
    }
    return {
      id: c.id,
      client_id,
      workspace_id: acc.workspace_id,
      ad_account_id: acc.id,
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

  const insertable = rows.filter((r) => r.client_id != null);
  if (insertable.length) {
    const { error } = await admin.from("campaigns").upsert(insertable, { onConflict: "id" });
    if (error) throw new Error("campaigns upsert: " + error.message);
  }
  return insertable.length;
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

async function syncGranularInsights(
  admin: any,
  acc: any,
  accessToken: string,
  datePreset: string = "last_7d",
): Promise<number> {
  const fields = [
    "campaign_id","campaign_name","adset_id","adset_name","ad_id","ad_name",
    "spend","impressions","clicks","actions",
  ].join(",");

  let total = 0;
  for (const level of ["campaign", "adset", "ad"] as const) {
    const url = `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${fields}&level=${level}&time_increment=1&date_preset=${datePreset}&limit=500&access_token=${encodeURIComponent(accessToken)}`;

    let next: string | null = url;
    const rows: any[] = [];
    while (next) {
      const res: Response = await fetch(next);
      const j: any = await res.json();
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
function storyPageId(storyId: string | null | undefined): string | null {
  if (!storyId || typeof storyId !== "string") return null;
  return storyId.includes("_") ? storyId.split("_")[0] : null;
}

function firstAssetUrl(images: any): string | null {
  if (!Array.isArray(images)) return null;
  const img = images.find((i: any) => i?.url || i?.permalink_url || i?.thumbnail_url) ?? null;
  return img?.url ?? img?.permalink_url ?? img?.thumbnail_url ?? null;
}

async function syncAds(admin: any, acc: any, accessToken: string): Promise<number> {
  const adFields = [
    "id","name","status","effective_status","created_time",
    "campaign_id","campaign{name}","adset_id","adset{name,targeting}",
    // Field expansion modifiers ensure Graph returns a 600px thumbnail
    // instead of the default ~64px (which renders blurry when scaled up).
    "creative{id,thumbnail_url.width(600).height(600),image_url,image_hash,video_id,body,title,call_to_action_type,object_story_spec,effective_object_story_id,asset_feed_spec}",
  ].join(",");

  const ads: any[] = [];
  let next: string | null =
    `https://graph.facebook.com/v21.0/${acc.act_id}/ads?fields=${adFields}&thumbnail_width=600&thumbnail_height=600&limit=200&access_token=${encodeURIComponent(accessToken)}`;

  // safety cap: 5 pages = 1000 ads per account
  let page = 0;
  while (next && page < 5) {
    const r: Response = await fetch(next);
    const j: any = await r.json();
    if (!r.ok) throw new Error("ads list: " + JSON.stringify(j));
    for (const a of j.data ?? []) ads.push(a);
    next = j.paging?.next ?? null;
    page++;
  }
  if (!ads.length) return 0;

  // Some /ads field expansions ignore the requested thumbnail size and return
  // the tiny 64px URL. Refetch creatives directly by ID to get larger images.
  const creativeIds = Array.from(new Set(
    ads.map((a) => a.creative?.id).filter((id: any) => typeof id === "string" && id.length > 0)
  )) as string[];
  const creativeMap = new Map<string, any>();
  for (let i = 0; i < creativeIds.length; i += 50) {
    const batch = creativeIds.slice(i, i + 50).map((id) => ({
      method: "GET",
      relative_url: `${id}?fields=id,thumbnail_url,image_url,image_hash,video_id,body,title,call_to_action_type,object_story_spec,effective_object_story_id,asset_feed_spec&thumbnail_width=600&thumbnail_height=600`,
    }));
    try {
      const r: Response = await fetch("https://graph.facebook.com/v21.0/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: accessToken,
          batch: JSON.stringify(batch),
          include_headers: "false",
        }),
      });
      const j: any = await r.json();
      if (Array.isArray(j)) {
        j.forEach((res: any, idx: number) => {
          if (res?.code === 200 && res.body) {
            try {
              const body = JSON.parse(res.body);
              creativeMap.set(creativeIds[i + idx], body);
            } catch { /* ignore */ }
          }
        });
      }
    } catch { /* non-fatal */ }
  }
  for (const ad of ads) {
    const fresh = ad.creative?.id ? creativeMap.get(ad.creative.id) : null;
    if (fresh) ad.creative = { ...ad.creative, ...fresh };
  }

  // Pull last-30d insights at ad level in one call
  const insFields = "ad_id,spend,impressions,clicks,ctr,actions";
  const insMap = new Map<string, any>();
  let insNext: string | null =
    `https://graph.facebook.com/v21.0/${acc.act_id}/insights?fields=${insFields}&level=ad&date_preset=last_30d&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  let ip = 0;
  while (insNext && ip < 10) {
    const r: Response = await fetch(insNext);
    const j: any = await r.json();
    if (!r.ok) break;
    for (const row of j.data ?? []) insMap.set(row.ad_id, row);
    insNext = j.paging?.next ?? null;
    ip++;
  }
  // For ads missing image_url (video / page-post creatives), batch-fetch the
  // post's full_picture so we render a high-res image instead of the tiny
  // thumbnail_url. Graph allows up to 50 sub-requests per batch.
  const postIds = Array.from(new Set(
    ads
      .map((a) => a.creative?.effective_object_story_id)
      .filter((id: any) => typeof id === "string" && id.length > 0)
      .filter((id: string) => {
        const ad = ads.find((x) => x.creative?.effective_object_story_id === id);
        return ad && !ad.creative?.image_url;
      })
  )) as string[];
  const fullPicMap = new Map<string, string>();
  for (let i = 0; i < postIds.length; i += 50) {
    const batch = postIds.slice(i, i + 50).map((id) => ({
      method: "GET",
      relative_url: `${id}?fields=full_picture`,
    }));
    try {
      const r = await fetch("https://graph.facebook.com/v21.0/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: accessToken,
          batch: JSON.stringify(batch),
          include_headers: "false",
        }),
      });
      const j = await r.json();
      if (Array.isArray(j)) {
        j.forEach((res: any, idx: number) => {
          if (res?.code === 200 && res.body) {
            try {
              const body = JSON.parse(res.body);
              if (body.full_picture) fullPicMap.set(postIds[i + idx], body.full_picture);
            } catch { /* ignore */ }
          }
        });
      }
    } catch { /* non-fatal */ }
  }

  // Fetch Facebook Page name + avatar for every unique page referenced by an ad
  // so the Creatives grid can render a real Meta-style post header.
  const pageIds = Array.from(new Set(
    ads
      .map((a) => a.creative?.object_story_spec?.page_id ?? storyPageId(a.creative?.effective_object_story_id))
      .filter((id: any) => typeof id === "string" && id.length > 0)
  )) as string[];
  const pageMap = new Map<string, { name: string | null; avatar: string | null }>();
  for (let i = 0; i < pageIds.length; i += 50) {
    const batch = pageIds.slice(i, i + 50).map((id) => ({
      method: "GET",
      relative_url: `${id}?fields=name,picture.width(120).height(120)`,
    }));
    try {
      const r = await fetch("https://graph.facebook.com/v21.0/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: accessToken,
          batch: JSON.stringify(batch),
          include_headers: "false",
        }),
      });
      const j = await r.json();
      if (Array.isArray(j)) {
        j.forEach((res: any, idx: number) => {
          if (res?.code === 200 && res.body) {
            try {
              const body = JSON.parse(res.body);
              pageMap.set(pageIds[i + idx], {
                name: body.name ?? null,
                avatar: body.picture?.data?.url ?? null,
              });
            } catch { /* ignore */ }
          }
        });
      }
    } catch { /* non-fatal */ }
  }

  const now = Date.now();

  // Attribute each ad to the correct client. On shared accounts the account
  // owner (acc.client_id) is NOT the campaign owner — we honor the campaign's
  // current client_id so ads land under the right client in the hierarchy.
  const campaignIds = Array.from(new Set(
    ads.map((a: any) => a.campaign_id).filter((x: any) => typeof x === "string" && x.length > 0),
  )) as string[];
  const campaignClientMap = new Map<string, number | null>();
  if (campaignIds.length > 0) {
    const { data: campRows } = await admin
      .from("campaigns")
      .select("id, client_id")
      .in("id", campaignIds);
    for (const r of campRows ?? []) campaignClientMap.set(r.id, r.client_id ?? null);
  }

  const rows = ads.map((a: any) => {
    const ins = insMap.get(a.id) ?? {};
    const leads = extractLeads(ins.actions);
    const spend = Number(ins.spend ?? 0);
    const cre = a.creative ?? {};
    const story = cre.object_story_spec ?? {};
    const linkData = story.link_data ?? story.video_data ?? {};
    const assetFeed = cre.asset_feed_spec ?? {};
    const assetImageUrl = firstAssetUrl(assetFeed.images);
    const assetVideo = Array.isArray(assetFeed.videos) ? assetFeed.videos[0] : null;

    // body/title may live either directly on creative or inside object_story_spec
    const body = cre.body ?? linkData.message ?? linkData.description ?? null;
    const title = cre.title ?? linkData.name ?? null;
    const cta = cre.call_to_action_type ?? linkData.call_to_action?.type ?? null;
    const linkUrl = linkData.link ?? null;

    // creative_hash: image_hash if available, else video_id, else creative_id —
    // lets us group "same visual reused across ads".
    const creativeHash = cre.image_hash ?? cre.video_id ?? cre.id ?? null;
    const pageId = story.page_id ?? storyPageId(cre.effective_object_story_id);
    const pageInfo = pageId ? pageMap.get(pageId) : null;
    const mediaType = (cre.video_id || assetVideo?.video_id) ? "video" : (cre.image_url || assetImageUrl || cre.image_hash) ? "image" : null;

    const createdAt = a.created_time ? new Date(a.created_time) : null;
    const daysActive = createdAt
      ? Math.max(0, Math.floor((now - createdAt.getTime()) / 86_400_000))
      : 0;

    return {
      id: a.id,
      workspace_id: acc.workspace_id,
      client_id: campaignClientMap.get(a.campaign_id) ?? acc.client_id,
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
      image_url: cre.image_url ?? assetImageUrl ?? linkData.picture ?? fullPicMap.get(cre.effective_object_story_id) ?? null,
      video_id: cre.video_id ?? assetVideo?.video_id ?? null,
      page_name: pageInfo?.name ?? null,
      page_avatar_url: pageInfo?.avatar ?? null,
      media_type: mediaType,
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
