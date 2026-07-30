// Pulls Meta Lead Ads (Lead Gen Forms) leads for every active connection.
// Tracks per-form sync state in `meta_lead_form_sync_state` so transient
// Meta rate limits (error code 4) and other errors don't silently swallow
// missing leads. Failed forms get exponential backoff; persistent failures
// fire a `lead_sync_failed` notification so the team is alerted instead of
// blind. Accounts with no recent insights-lead activity are throttled to
// conserve Meta's app-level rate quota.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Backoff schedule for failed form pulls (minutes).
// Rate-limit failures clear within ~1h on Meta's side.
const BACKOFF_MINUTES = [5, 15, 30, 60, 120, 240];
// Notify on the Nth consecutive failure (>= ~30 min of broken sync).
const NOTIFY_AFTER_FAILURES = 3;
// Cold accounts (no leads in N days) only run every COLD_INTERVAL_MIN minutes
const COLD_LOOKBACK_DAYS = 14;
const COLD_INTERVAL_MIN = 120;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let workspaceFilter: string | null = null;
  let clientFilter: number | null = null;
  let exhaustiveDiscovery = true;
  let sinceDays: number | null = 90;
  let force = false; // if true, ignore next_retry_at backoff
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
    clientFilter = typeof body.clientId === "number" ? body.clientId : null;
    if (typeof body.exhaustiveDiscovery === "boolean") {
      exhaustiveDiscovery = body.exhaustiveDiscovery;
    }
    if (body.sinceDays === null) {
      sinceDays = null;
    } else if (typeof body.sinceDays === "number" && body.sinceDays > 0) {
      sinceDays = body.sinceDays;
    }
    force = body.force === true || clientFilter != null;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let connQ = admin
    .from("meta_connections")
    .select("id, workspace_id, access_token, status, token_expires_at")
    .eq("status", "active");
  if (workspaceFilter) connQ = connQ.eq("workspace_id", workspaceFilter);
  const { data: connections, error: connErr } = await connQ;
  if (connErr) return json({ error: connErr.message }, 500);

  let totalLeads = 0;
  let skippedColdAccounts = 0;
  let skippedBackoffForms = 0;
  let retriedForms = 0;
  let firedNotifications = 0;
  const errors: any[] = [];

  for (const conn of connections ?? []) {
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) continue;

    const { data: accountsRaw } = await admin
      .from("meta_ad_accounts")
      .select("id, act_id, workspace_id, client_id")
      .eq("connection_id", conn.id)
      .eq("is_active", true);

    // Don't spend Meta lead-retrieval quota on paused/cancelled clients.
    const DEAD_STATUSES = new Set([
      "CANCELLED", "PENDING_CANCELLATION", "BLOCKED", "PAUSED",
    ]);
    const deadClients = new Set<number>();
    const leadClientIds = Array.from(
      new Set((accountsRaw ?? []).map((a: any) => a.client_id).filter(Boolean)),
    );
    if (leadClientIds.length) {
      const { data: cs } = await admin
        .from("clients").select("id, status").in("id", leadClientIds);
      for (const c of cs ?? []) {
        if (DEAD_STATUSES.has(String(c.status))) deadClients.add(c.id);
      }
    }
    const accounts = (accountsRaw ?? []).filter(
      (a: any) => !(a.client_id && deadClients.has(a.client_id)),
    );


    // Build a Page-id -> Page access token map for this connection ONCE.
    // Meta's /{form_id}/leads endpoint frequently rejects user tokens with
    // error 100 ("does not exist / missing permissions") even when the user
    // has leads_retrieval. Using a Page access token is the reliable path.
    const pageTokens = new Map<string, string>();
    try {
      let pgUrl: string | null =
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;
      let pgPages = 0;
      while (pgUrl && pgPages < 20) {
        const r = await fetch(pgUrl);
        const j = await r.json();
        if (!r.ok) { errors.push({ scope: "me/accounts", error: j }); break; }
        for (const p of j.data ?? []) {
          if (p?.id && p?.access_token) pageTokens.set(String(p.id), String(p.access_token));
        }
        pgUrl = j.paging?.next ?? null;
        pgPages++;
      }
    } catch (e) {
      errors.push({ scope: "me/accounts", error: String(e) });
    }

    for (const acc of accounts ?? []) {
      if (clientFilter != null) {
        if (acc.client_id !== clientFilter) {
          const { data: m } = await admin
            .from("meta_ad_account_clients")
            .select("client_id")
            .eq("ad_account_id", acc.id)
            .eq("client_id", clientFilter)
            .maybeSingle();
          if (!m) continue;
        }
      }

      // Adaptive scheduling: cold accounts run less often (unless forced).
      if (!force) {
        const cold = await isAccountCold(admin, acc.id);
        if (cold) {
          skippedColdAccounts++;
          continue;
        }
      }

      const { data: members } = await admin
        .from("meta_ad_account_clients")
        .select("client_id")
        .eq("ad_account_id", acc.id);
      const isShared = (members ?? []).length > 0;
      let campaignClientMap: Map<string, number | null> | null = null;
      if (isShared) {
        const { data: camps } = await admin
          .from("campaigns")
          .select("id, client_id")
          .eq("ad_account_id", acc.id);
        campaignClientMap = new Map((camps ?? []).map((c: any) => [c.id, c.client_id ?? null]));
      }
      const resolveClient = (campaignId: string | null | undefined): number | null => {
        if (isShared && campaignClientMap && campaignId) {
          return campaignClientMap.get(campaignId) ?? null;
        }
        return acc.client_id ?? null;
      };

      try {
        const sinceParam = sinceDays != null
          ? `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000)}}]`
          : "";

        const forceExhaustive = clientFilter != null || sinceDays == null;

        let leadAdsQ = admin
          .from("meta_ads")
          .select("id,name,adset_id,adset_name,campaign_id,campaign_name")
          .eq("ad_account_id", acc.id)
          .gt("leads", 0)
          .order("leads", { ascending: false })
          .limit(500);
        if (clientFilter != null) {
          leadAdsQ = leadAdsQ.eq("client_id", clientFilter);
        }
        const { data: leadAds } = await leadAdsQ;

        if (leadAds?.length) {
          for (const ad of leadAds) {
            let url: string | null =
              `https://graph.facebook.com/v21.0/${ad.id}/leads` +
              `?fields=id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id` +
              sinceParam +
              `&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;
            let pages = 0;
            while (url && pages < 50) {
              const leadsRes = await fetch(url);
              const leadsJson = await leadsRes.json();
              if (!leadsRes.ok) {
                errors.push({ ad_id: ad.id, act_id: acc.act_id, error: leadsJson });
                break;
              }
              const rows = buildLeadRows(leadsJson.data ?? [], acc, ad, null, undefined, resolveClient);
              totalLeads += await upsertLeadRows(admin, rows, errors, { ad_id: ad.id });
              url = leadsJson.paging?.next ?? null;
              pages++;
            }
          }
          if (!forceExhaustive) continue;
        }

        if (!exhaustiveDiscovery && !forceExhaustive) continue;

        const adFields = [
          "id",
          "name",
          "adset_id",
          "campaign_id",
          "campaign{name}",
          "adset{name}",
          "leadgen_form{id,name,page{id}}",
          "creative{id,object_story_spec,effective_object_story_id}",
        ].join(",");

        const ads: any[] = [];
        let adsUrl: string | null =
          `https://graph.facebook.com/v21.0/${acc.act_id}/ads` +
          `?fields=${encodeURIComponent(adFields)}` +
          `&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;
        let adsPage = 0;

        while (adsUrl && adsPage < 10) {
          const adsRes = await fetch(adsUrl);
          const adsJson = await adsRes.json();
          if (!adsRes.ok) {
            errors.push({ act_id: acc.act_id, scope: "ads", error: adsJson });
            break;
          }
          ads.push(...(adsJson.data ?? []));
          adsUrl = adsJson.paging?.next ?? null;
          adsPage++;
        }
        if (!ads.length) continue;

        const formMap = new Map<string, {
          name: string | null;
          page_id: string | null;
          ads: { id: string; name: string | null; adset_id: string | null; adset_name: string | null; campaign_id: string | null; campaign_name: string | null }[];
        }>();

        for (const ad of ads) {
          const forms = extractLeadForms(ad);
          for (const f of forms) {
            if (!f.id) continue;
            if (!formMap.has(f.id)) {
              formMap.set(f.id, { name: f.name ?? null, page_id: f.page_id ?? null, ads: [] });
            } else if (f.page_id && !formMap.get(f.id)!.page_id) {
              formMap.get(f.id)!.page_id = f.page_id;
            }
            formMap.get(f.id)!.ads.push({
              id: ad.id,
              name: ad.name ?? null,
              adset_id: ad.adset_id ?? null,
              adset_name: ad.adset?.name ?? null,
              campaign_id: ad.campaign_id ?? null,
              campaign_name: ad.campaign?.name ?? null,
            });
          }
        }

        // Load existing sync state for all forms on this account in one shot
        const formIds = Array.from(formMap.keys());
        const stateMap = new Map<string, any>();
        if (formIds.length) {
          const { data: states } = await admin
            .from("meta_lead_form_sync_state")
            .select("*")
            .eq("ad_account_id", acc.id)
            .in("form_id", formIds);
          for (const s of states ?? []) stateMap.set(s.form_id, s);
        }

        for (const [formId, info] of formMap.entries()) {
          const state = stateMap.get(formId);
          // Skip forms in backoff (unless forced)
          if (!force && state?.next_retry_at && new Date(state.next_retry_at) > new Date()) {
            skippedBackoffForms++;
            continue;
          }
          if (state) retriedForms++;

          // Pick the best token for this form:
          //  1) known Page token via form's page_id
          //  2) probe form -> page id via any Page token we have (some pages
          //     let the form be introspected with their token)
          //  3) fall back to user token (works for own pages)
          let tokenForForm = conn.access_token;
          if (info.page_id && pageTokens.has(info.page_id)) {
            tokenForForm = pageTokens.get(info.page_id)!;
          }

          const buildUrl = (tok: string) =>
            `https://graph.facebook.com/v21.0/${formId}/leads` +
            `?fields=id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id` +
            sinceParam +
            `&limit=200&access_token=${encodeURIComponent(tok)}`;

          let url: string | null = buildUrl(tokenForForm);
          let pages = 0;
          let formError: { code: string | null; message: string } | null = null;
          let formLeadCount = 0;
          let retriedWithPageToken = false;
          const adById = new Map(info.ads.map((a) => [a.id, a]));
          while (url && pages < 50) {
            const leadsRes = await fetch(url);
            const leadsJson = await leadsRes.json();
            if (!leadsRes.ok) {
              const e = leadsJson?.error ?? {};
              // On error 100 (missing perms), attempt to resolve a Page token
              // by probing the form with each Page token we hold. First hit wins.
              if (!retriedWithPageToken && (e.code === 100 || e.code === 200) && pageTokens.size) {
                retriedWithPageToken = true;
                let resolved: string | null = null;
                for (const [pid, ptok] of pageTokens.entries()) {
                  const probe = await fetch(
                    `https://graph.facebook.com/v21.0/${formId}?fields=id,name,page{id}&access_token=${encodeURIComponent(ptok)}`,
                  );
                  const probeJson = await probe.json();
                  if (probe.ok && probeJson?.page?.id) {
                    const owningPage = String(probeJson.page.id);
                    const owningToken = pageTokens.get(owningPage) ?? ptok;
                    resolved = owningToken;
                    // Update in-memory cache so subsequent forms benefit
                    if (!info.page_id) info.page_id = owningPage;
                    break;
                  }
                }
                if (resolved) {
                  url = buildUrl(resolved);
                  continue; // retry loop iteration
                }
              }
              formError = {
                code: e.code != null ? String(e.code) : String(leadsRes.status),
                message: e.message ?? JSON.stringify(leadsJson).slice(0, 500),
              };
              errors.push({ form: formId, act_id: acc.act_id, error: leadsJson });
              break;
            }
            const rows = buildLeadRows(leadsJson.data ?? [], acc, (lead: any) => lead.ad_id ? adById.get(lead.ad_id) : undefined, info.name, formId, resolveClient);
            const filtered = clientFilter != null ? rows.filter((r) => r.client_id === clientFilter) : rows;
            const n = await upsertLeadRows(admin, filtered, errors, { form: formId });
            totalLeads += n;
            formLeadCount += n;
            url = leadsJson.paging?.next ?? null;
            pages++;
          }

          // Record sync state for this form
          const notified = await recordFormSyncState(admin, {
            workspace_id: acc.workspace_id,
            ad_account_id: acc.id,
            form_id: formId,
            form_name: info.name,
            existing: state,
            error: formError,
            leads_synced: formLeadCount,
          });
          if (notified) firedNotifications++;
        }

      } catch (e) {
        errors.push({ act_id: acc.act_id, error: String(e) });
      }
    }
  }

  return json({
    ok: true,
    leadsSynced: totalLeads,
    skippedColdAccounts,
    skippedBackoffForms,
    retriedForms,
    firedNotifications,
    errors,
  });
});

async function isAccountCold(admin: any, adAccountId: string): Promise<boolean> {
  const since = new Date(Date.now() - COLD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data } = await admin
    .from("meta_insights_daily")
    .select("leads")
    .eq("ad_account_id", adAccountId)
    .gte("date", since)
    .gt("leads", 0)
    .limit(1);
  if (data && data.length > 0) return false;

  // No recent leads — has this account been attempted within the cold interval?
  const { data: lastAttempt } = await admin
    .from("meta_lead_form_sync_state")
    .select("last_attempt_at")
    .eq("ad_account_id", adAccountId)
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!lastAttempt?.last_attempt_at) return false; // never attempted — try once
  const ageMin = (Date.now() - new Date(lastAttempt.last_attempt_at).getTime()) / 60000;
  return ageMin < COLD_INTERVAL_MIN;
}

async function recordFormSyncState(
  admin: any,
  params: {
    workspace_id: string;
    ad_account_id: string;
    form_id: string;
    form_name: string | null;
    existing: any;
    error: { code: string | null; message: string } | null;
    leads_synced: number;
  },
): Promise<boolean> {
  const now = new Date();
  let firedNotification = false;

  if (!params.error) {
    await admin.from("meta_lead_form_sync_state").upsert({
      workspace_id: params.workspace_id,
      ad_account_id: params.ad_account_id,
      form_id: params.form_id,
      form_name: params.form_name,
      last_attempt_at: now.toISOString(),
      last_success_at: now.toISOString(),
      last_error: null,
      last_error_code: null,
      consecutive_failures: 0,
      next_retry_at: null,
      notified_at: null,
    }, { onConflict: "ad_account_id,form_id" });
    return false;
  }

  const prevFailures = params.existing?.consecutive_failures ?? 0;
  const failures = prevFailures + 1;
  const backoffMin = BACKOFF_MINUTES[Math.min(failures - 1, BACKOFF_MINUTES.length - 1)];
  const nextRetry = new Date(now.getTime() + backoffMin * 60000);

  await admin.from("meta_lead_form_sync_state").upsert({
    workspace_id: params.workspace_id,
    ad_account_id: params.ad_account_id,
    form_id: params.form_id,
    form_name: params.form_name,
    last_attempt_at: now.toISOString(),
    last_error: params.error.message,
    last_error_code: params.error.code,
    consecutive_failures: failures,
    next_retry_at: nextRetry.toISOString(),
  }, { onConflict: "ad_account_id,form_id" });

  // Fire notification once when threshold crossed
  if (failures >= NOTIFY_AFTER_FAILURES && !params.existing?.notified_at) {
    const { data: acc } = await admin
      .from("meta_ad_accounts")
      .select("account_name, client_id")
      .eq("id", params.ad_account_id)
      .maybeSingle();
    let clientName: string | null = null;
    let link = "/leads";
    if (acc?.client_id) {
      const { data: c } = await admin.from("clients").select("name").eq("id", acc.client_id).maybeSingle();
      clientName = c?.name ?? null;
      link = `/client/${acc.client_id}`;
    }
    const { data: members } = await admin
      .from("workspace_members").select("user_id").eq("workspace_id", params.workspace_id);
    if (members?.length) {
      await admin.from("notifications").insert(members.map((m: any) => ({
        user_id: m.user_id,
        workspace_id: params.workspace_id,
        type: "lead_sync_failed",
        title: `Lead sync failing${clientName ? ` — ${clientName}` : ""}`,
        body: `Meta form ${params.form_name ?? params.form_id} on ${acc?.account_name ?? "ad account"} has failed ${failures}x. Latest error: ${params.error.message.slice(0, 200)}`,
        link,
        meta: {
          ad_account_id: params.ad_account_id,
          form_id: params.form_id,
          error_code: params.error.code,
        },
      })));
    }
    await admin.from("meta_lead_form_sync_state")
      .update({ notified_at: now.toISOString() })
      .eq("ad_account_id", params.ad_account_id)
      .eq("form_id", params.form_id);
    firedNotification = true;
  }

  return firedNotification;
}

function buildLeadRows(leads: any[], acc: any, adRefOrResolver: any, formName: string | null, fallbackFormId?: string, resolveClient?: (campaignId: string | null | undefined) => number | null) {
  return leads.map((l: any) => {
    const fd = (l.field_data ?? []) as { name: string; values: string[] }[];
    const find = (keys: string[]) => {
      const item = fd.find((f) => keys.some((k) => f.name?.toLowerCase().includes(k)));
      return item?.values?.[0] ?? null;
    };
    const adRef = typeof adRefOrResolver === "function" ? adRefOrResolver(l) : adRefOrResolver;
    const campaignId = l.campaign_id ?? adRef?.campaign_id ?? null;
    const resolvedClient = resolveClient ? resolveClient(campaignId) : (acc.client_id ?? null);
    return {
      workspace_id: acc.workspace_id,
      ad_account_id: acc.id,
      client_id: resolvedClient,
      lead_id: l.id,
      form_id: l.form_id ?? fallbackFormId ?? null,
      form_name: formName,
      campaign_id: campaignId,
      campaign_name: l.campaign_name ?? adRef?.campaign_name ?? null,
      adset_id: l.adset_id ?? adRef?.adset_id ?? null,
      adset_name: l.adset_name ?? adRef?.adset_name ?? null,
      ad_id: l.ad_id ?? adRef?.id ?? null,
      ad_name: l.ad_name ?? adRef?.name ?? null,
      created_time: l.created_time ?? null,
      full_name: find(["full_name", "name"]),
      email: find(["email"]),
      phone: find(["phone"]),
      field_data: fd,
      raw: l,
    };
  });
}

async function upsertLeadRows(admin: any, rows: any[], errors: any[], context: Record<string, unknown>) {
  if (!rows.length) return 0;
  const { error } = await admin
    .from("meta_leads")
    .upsert(rows, { onConflict: "ad_account_id,lead_id" });
  if (error) {
    errors.push({ ...context, error: error.message });
    return 0;
  }
  return rows.length;
}

function extractLeadForms(ad: any): { id: string; name: string | null; page_id: string | null }[] {
  const forms = new Map<string, { name: string | null; page_id: string | null }>();
  // Prefer the page id declared on the ad's leadgen_form; fall back to the
  // creative's own page reference so form-only ads still resolve.
  const adPageId: string | null =
    (typeof ad?.leadgen_form?.page?.id === "string" && ad.leadgen_form.page.id) ||
    (typeof ad?.creative?.object_story_spec?.page_id === "string" && ad.creative.object_story_spec.page_id) ||
    null;
  const add = (id: unknown, name: unknown = null, pageId: string | null = adPageId) => {
    if (typeof id === "string" && id) {
      const prev = forms.get(id);
      forms.set(id, {
        name: prev?.name ?? (typeof name === "string" ? name : null),
        page_id: prev?.page_id ?? pageId ?? null,
      });
    }
  };

  add(ad.leadgen_form?.id, ad.leadgen_form?.name);

  const story = ad.creative?.object_story_spec ?? {};
  const storyBlocks = [story.link_data, story.video_data, ...(story.template_data?.child_attachments ?? [])];
  for (const block of storyBlocks) {
    add(block?.call_to_action?.value?.lead_gen_form_id);
  }

  return Array.from(forms.entries()).map(([id, v]) => ({ id, name: v.name, page_id: v.page_id }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
