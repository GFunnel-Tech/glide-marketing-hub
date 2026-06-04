import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface RangeAdRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  ctr: number;
}

export interface RangeAdsetRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  ads: RangeAdRow[];
}

export interface RangeCampaignRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  frequency: number;
  adSets: RangeAdsetRow[];
}

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Returns per-campaign / per-adset / per-ad metrics for one client over the
 * currently-selected global date range, sourced from
 * `meta_insights_granular_daily`. Names for adsets/ads are enriched from
 * `meta_ads`. This drives the Campaigns tab so the numbers + drilldown react
 * to the date picker instead of showing the static `campaigns` snapshot.
 */
export function useClientCampaignsRange(clientId: number | null | undefined) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, queryKey: rangeKey } = useDateRange();

  return useQuery({
    queryKey: ["client-campaigns-range", wsId, clientId, ...rangeKey],
    enabled: !!wsId && !!clientId,
    queryFn: async (): Promise<RangeCampaignRow[]> => {
      const fromStr = fmt(from);
      const toStr = fmt(to);

      // 1. Client's ad accounts
      const { data: accts, error: aErr } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("client_id", clientId);
      if (aErr) throw aErr;
      const acctIds = (accts || []).map((a: any) => a.id);
      if (acctIds.length === 0) return [];

      // 2. Granular insights in window
      const { data: rows, error: gErr } = await (supabase as any)
        .from("meta_insights_granular_daily")
        .select(
          "level, object_id, object_name, parent_campaign_id, parent_adset_id, spend, impressions, clicks, leads, raw"
        )
        .eq("workspace_id", wsId)
        .in("ad_account_id", acctIds)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (gErr) throw gErr;

      // 3. Enrich ad creative info (optional, for nicer display)
      const { data: adRows } = await (supabase as any)
        .from("meta_ads")
        .select("id, name, adset_id, adset_name, campaign_id, campaign_name, thumbnail_url, image_url")
        .eq("workspace_id", wsId)
        .eq("client_id", clientId);
      const adMeta = new Map<string, any>();
      const adsetMeta = new Map<string, { name: string; campaignId: string | null }>();
      const campaignMeta = new Map<string, string>();
      for (const a of adRows || []) {
        adMeta.set(a.id, a);
        if (a.adset_id && !adsetMeta.has(a.adset_id)) {
          adsetMeta.set(a.adset_id, { name: a.adset_name || a.adset_id, campaignId: a.campaign_id ?? null });
        }
        if (a.campaign_id && !campaignMeta.has(a.campaign_id)) {
          campaignMeta.set(a.campaign_id, a.campaign_name || a.campaign_id);
        }
      }

      type Agg = { spend: number; impressions: number; clicks: number; leads: number; name: string; freqSum?: number; freqW?: number };
      const campaigns = new Map<string, Agg>();
      const adsets = new Map<string, Agg & { campaignId: string }>();
      const ads = new Map<string, Agg & { adsetId: string; campaignId: string }>();

      const bump = (m: Map<string, Agg>, key: string, name: string, r: any) => {
        const cur = m.get(key) || { spend: 0, impressions: 0, clicks: 0, leads: 0, name };
        cur.spend += Number(r.spend || 0);
        cur.impressions += Number(r.impressions || 0);
        cur.clicks += Number(r.clicks || 0);
        cur.leads += Number(r.leads || 0);
        if (!cur.name && name) cur.name = name;
        m.set(key, cur);
        return cur;
      };

      for (const r of rows || []) {
        if (r.level === "campaign") {
          const c = bump(campaigns, r.object_id, r.object_name || campaignMeta.get(r.object_id) || r.object_id, r);
          // Aggregate frequency (impression-weighted) from raw if available
          const freq = Number(r.raw?.frequency || 0);
          const imp = Number(r.impressions || 0);
          if (freq > 0 && imp > 0) {
            c.freqSum = (c.freqSum || 0) + freq * imp;
            c.freqW = (c.freqW || 0) + imp;
          }
        } else if (r.level === "adset") {
          const cur = bump(adsets as any, r.object_id, r.object_name || adsetMeta.get(r.object_id)?.name || r.object_id, r) as any;
          cur.campaignId = r.parent_campaign_id || adsetMeta.get(r.object_id)?.campaignId || "";
          adsets.set(r.object_id, cur);
        } else if (r.level === "ad") {
          const meta = adMeta.get(r.object_id);
          const cur = bump(ads as any, r.object_id, r.object_name || meta?.name || r.object_id, r) as any;
          cur.adsetId = r.parent_adset_id || meta?.adset_id || "";
          cur.campaignId = r.parent_campaign_id || meta?.campaign_id || "";
          ads.set(r.object_id, cur);
        }
      }

      const mkRow = (id: string, a: Agg) => {
        const cpl = a.leads > 0 ? a.spend / a.leads : 0;
        const cpm = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
        const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
        return { id, name: a.name, spend: a.spend, impressions: a.impressions, clicks: a.clicks, leads: a.leads, cpl, cpm, ctr };
      };

      // Build nested
      const adsByAdset = new Map<string, RangeAdRow[]>();
      for (const [id, a] of ads) {
        const list = adsByAdset.get(a.adsetId) || [];
        list.push(mkRow(id, a));
        adsByAdset.set(a.adsetId, list);
      }
      const adsetsByCampaign = new Map<string, RangeAdsetRow[]>();
      for (const [id, a] of adsets) {
        const base = mkRow(id, a);
        const list = adsetsByCampaign.get(a.campaignId) || [];
        list.push({ ...base, ads: (adsByAdset.get(id) || []).sort((x, y) => y.spend - x.spend) });
        adsetsByCampaign.set(a.campaignId, list);
      }

      const out: RangeCampaignRow[] = [];
      for (const [id, a] of campaigns) {
        const base = mkRow(id, a);
        const frequency = a.freqW && a.freqW > 0 ? (a.freqSum! / a.freqW) : 0;
        out.push({
          ...base,
          frequency,
          adSets: (adsetsByCampaign.get(id) || []).sort((x, y) => y.spend - x.spend),
        });
      }
      return out.sort((x, y) => y.spend - x.spend);
    },
  });
}
