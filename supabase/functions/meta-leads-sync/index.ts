// Pulls Meta Lead Ads (Lead Gen Forms) leads for every active connection.
// For each ad account, lists lead-gen forms and fetches recent leads,
// then upserts them into meta_leads. If the access token lacks
// leads_retrieval permission the call will return an error and we just skip
// that account/form (the aggregated lead counts remain available).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let workspaceFilter: string | null = null;
  let clientFilter: number | null = null;
  // Default to exhaustive discovery so accounts without pre-synced meta_ads
  // (e.g. brand-new mappings) still pull their Lead Gen forms.
  let exhaustiveDiscovery = true;
  // Default lookback. Pass `sinceDays: null` for an all-time backfill.
  let sinceDays: number | null = 90;
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
  const errors: any[] = [];

  for (const conn of connections ?? []) {
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) continue;

    const { data: accounts } = await admin
      .from("meta_ad_accounts")
      .select("id, act_id, workspace_id, client_id")
      .eq("connection_id", conn.id)
      .eq("is_active", true);

    for (const acc of accounts ?? []) {
      // When scoped to a single client: skip accounts that don't serve that client
      // (either via account.client_id or via meta_ad_account_clients).
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

      // Detect shared accounts: if any membership rows exist, attribute leads
      // by campaign->client mapping rather than the account's single client_id.
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
        // Lead-gen forms live on Pages, not ad accounts. We discover the
        // forms used by this ad account by listing its lead-gen ads, then
        // fetch leads from each unique form id.
        // Filter to ads with objective LEAD_GENERATION when possible; fall
        // back to all ads (cheap, the form list is what matters).
        const sinceParam = sinceDays != null
          ? `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000)}}]`
          : "";

        // Treat per-client requests + all-time backfills as forced exhaustive,
        // so we don't miss forms whose meta_ads rows have leads=0 or aren't synced.
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
          "leadgen_form{id,name}",
          "creative{id,object_story_spec}",
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

        // Build form_id -> { name, ads: [{id,name,adset,campaign}] }
        const formMap = new Map<string, {
          name: string | null;
          ads: { id: string; name: string | null; adset_id: string | null; adset_name: string | null; campaign_id: string | null; campaign_name: string | null }[];
        }>();

        for (const ad of ads) {
          const forms = extractLeadForms(ad);
          for (const f of forms) {
            if (!f.id) continue;
            if (!formMap.has(f.id)) formMap.set(f.id, { name: f.name ?? null, ads: [] });
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

        for (const [formId, info] of formMap.entries()) {
          let url: string | null =
            `https://graph.facebook.com/v21.0/${formId}/leads` +
            `?fields=id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id` +
            sinceParam +
            `&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;
          let pages = 0;
          const adById = new Map(info.ads.map((a) => [a.id, a]));
          while (url && pages < 50) {
            const leadsRes = await fetch(url);
            const leadsJson = await leadsRes.json();
            if (!leadsRes.ok) {
              errors.push({ form: formId, act_id: acc.act_id, error: leadsJson });
              break;
            }
            const rows = buildLeadRows(leadsJson.data ?? [], acc, (lead: any) => lead.ad_id ? adById.get(lead.ad_id) : undefined, info.name, formId, resolveClient);
            // When scoped to a single client, drop rows whose resolved client doesn't match.
            const filtered = clientFilter != null ? rows.filter((r) => r.client_id === clientFilter) : rows;
            totalLeads += await upsertLeadRows(admin, filtered, errors, { form: formId });
            url = leadsJson.paging?.next ?? null;
            pages++;
          }
        }

      } catch (e) {
        errors.push({ act_id: acc.act_id, error: String(e) });
      }
    }
  }

  return json({ ok: true, leadsSynced: totalLeads, errors });
});

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

function extractLeadForms(ad: any): { id: string; name: string | null }[] {
  const forms = new Map<string, string | null>();
  const add = (id: unknown, name: unknown = null) => {
    if (typeof id === "string" && id) forms.set(id, typeof name === "string" ? name : null);
  };

  add(ad.leadgen_form?.id, ad.leadgen_form?.name);

  const story = ad.creative?.object_story_spec ?? {};
  const storyBlocks = [story.link_data, story.video_data, ...(story.template_data?.child_attachments ?? [])];
  for (const block of storyBlocks) {
    add(block?.call_to_action?.value?.lead_gen_form_id);
  }

  return Array.from(forms.entries()).map(([id, name]) => ({ id, name }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
