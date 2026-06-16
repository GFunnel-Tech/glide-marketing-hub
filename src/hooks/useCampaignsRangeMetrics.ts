import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface RangeEntityMetrics {
  id: string;
  name: string;
  campaignId?: string | null;
  adsetId?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  ctr: number;
  frequency: number;
}

export interface CampaignsRangeMetrics {
  campaigns: Record<string, RangeEntityMetrics>;
  adsets: Record<string, RangeEntityMetrics>;
  ads: Record<string, RangeEntityMetrics>;
}

export const EMPTY_CAMPAIGNS_RANGE_METRICS: CampaignsRangeMetrics = {
  campaigns: {},
  adsets: {},
  ads: {},
};

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const finalize = (m: RangeEntityMetrics) => ({
  ...m,
  cpl: m.leads > 0 ? m.spend / m.leads : 0,
  cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
  ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
});

export function useCampaignsRangeMetrics() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, queryKey: rangeKey } = useDateRange();

  return useQuery({
    queryKey: ["campaigns-range-metrics-v1", wsId, ...rangeKey],
    enabled: !!wsId,
    queryFn: async (): Promise<CampaignsRangeMetrics> => {
      const fromStr = fmtDate(from);
      const toStr = fmtDate(to);

      const { data: campaignRows, error: campErr } = await (supabase as any)
        .from("campaigns")
        .select("id")
        .eq("workspace_id", wsId);
      if (campErr) throw campErr;

      const campaignIds = (campaignRows || []).map((c: any) => String(c.id));
      if (campaignIds.length === 0) return EMPTY_CAMPAIGNS_RANGE_METRICS;

      const rows: any[] = [];
      const chunkSize = 200;
      for (let i = 0; i < campaignIds.length; i += chunkSize) {
        const chunk = campaignIds.slice(i, i + chunkSize);
        const { data: campaignData, error: campaignErr } = await (supabase as any)
          .from("meta_insights_granular_daily")
          .select("level, object_id, object_name, parent_campaign_id, parent_adset_id, date, spend, impressions, clicks, leads, raw")
          .eq("level", "campaign")
          .in("object_id", chunk)
          .gte("date", fromStr)
          .lte("date", toStr);
        if (campaignErr) throw campaignErr;
        rows.push(...(campaignData || []));

        const { data: childData, error: childErr } = await (supabase as any)
          .from("meta_insights_granular_daily")
          .select("level, object_id, object_name, parent_campaign_id, parent_adset_id, date, spend, impressions, clicks, leads, raw")
          .in("level", ["adset", "ad"])
          .in("parent_campaign_id", chunk)
          .gte("date", fromStr)
          .lte("date", toStr);
        if (childErr) throw childErr;
        rows.push(...(childData || []));
      }

      const make = (id: string, name: string, campaignId?: string | null, adsetId?: string | null): RangeEntityMetrics => ({
        id,
        name: name || id,
        campaignId,
        adsetId,
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        cpl: 0,
        cpm: 0,
        ctr: 0,
        frequency: 0,
      });

      const campaigns = new Map<string, RangeEntityMetrics>();
      const adsets = new Map<string, RangeEntityMetrics>();
      const ads = new Map<string, RangeEntityMetrics>();
      const freq = new Map<string, { sum: number; weight: number }>();

      const bump = (map: Map<string, RangeEntityMetrics>, row: any, campaignId?: string | null, adsetId?: string | null) => {
        const id = String(row.object_id);
        const cur = map.get(id) ?? make(id, row.object_name, campaignId, adsetId);
        cur.name = cur.name || row.object_name || id;
        cur.campaignId = cur.campaignId ?? campaignId;
        cur.adsetId = cur.adsetId ?? adsetId;
        cur.spend += Number(row.spend || 0);
        cur.impressions += Number(row.impressions || 0);
        cur.clicks += Number(row.clicks || 0);
        cur.leads += Number(row.leads || 0);
        map.set(id, cur);
        return cur;
      };

      for (const row of rows) {
        if (row.level === "campaign") {
          const cur = bump(campaigns, row, String(row.object_id), null);
          const f = Number(row.raw?.frequency || 0);
          const imp = Number(row.impressions || 0);
          if (f > 0 && imp > 0) {
            const acc = freq.get(cur.id) ?? { sum: 0, weight: 0 };
            acc.sum += f * imp;
            acc.weight += imp;
            freq.set(cur.id, acc);
          }
        } else if (row.level === "adset") {
          bump(adsets, row, row.parent_campaign_id ? String(row.parent_campaign_id) : null, null);
        } else if (row.level === "ad") {
          bump(
            ads,
            row,
            row.parent_campaign_id ? String(row.parent_campaign_id) : null,
            row.parent_adset_id ? String(row.parent_adset_id) : null,
          );
        }
      }

      const toRecord = (map: Map<string, RangeEntityMetrics>) => {
        const out: Record<string, RangeEntityMetrics> = {};
        for (const [id, metric] of map) {
          const weightedFreq = freq.get(id);
          const next = finalize(metric);
          next.frequency = weightedFreq?.weight ? weightedFreq.sum / weightedFreq.weight : metric.frequency;
          out[id] = next;
        }
        return out;
      };

      return {
        campaigns: toRecord(campaigns),
        adsets: toRecord(adsets),
        ads: toRecord(ads),
      };
    },
  });
}