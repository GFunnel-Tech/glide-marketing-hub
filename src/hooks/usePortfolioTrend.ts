import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface TrendPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reportedLeads: number;
  trueLeads: number;
  cpl: number;
  trueCpl: number;
  cpm: number;
  ctr: number;
  frequency: number;
  // legacy aliases for existing consumers
  reported: number;
  true: number;
}

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Daily portfolio trend over the selected date range.
 * Provides spend, leads (reported + deduped true), CPL, true CPL, CPM, CTR, frequency.
 */
export function usePortfolioTrend() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, queryKey: rangeKey } = useDateRange();

  return useQuery({
    queryKey: ["portfolio-trend", wsId, ...rangeKey],
    enabled: !!wsId,
    queryFn: async (): Promise<TrendPoint[]> => {
      const fromStr = fmtDate(from);
      const toStr = fmtDate(to);
      const fromISO = new Date(from).toISOString();
      const toISO = new Date(to).toISOString();

      const { data: insights, error: iErr } = await (supabase as any)
        .from("meta_insights_daily")
        .select("date, spend, leads, impressions, clicks, reach, frequency")
        .eq("workspace_id", wsId)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (iErr) throw iErr;

      const { data: leads, error: lErr } = await (supabase as any)
        .from("meta_leads")
        .select("created_time, email, phone, lead_id")
        .eq("workspace_id", wsId)
        .gte("created_time", fromISO)
        .lte("created_time", toISO);
      if (lErr) throw lErr;

      type Bucket = {
        spend: number;
        reported: number;
        impressions: number;
        clicks: number;
        reachSum: number;
        freqWeighted: number;
        rows: number;
        keys: Set<string>;
      };
      const byDay = new Map<string, Bucket>();
      const bucket = (d: string): Bucket => {
        if (!byDay.has(d)) byDay.set(d, { spend: 0, reported: 0, impressions: 0, clicks: 0, reachSum: 0, freqWeighted: 0, rows: 0, keys: new Set() });
        return byDay.get(d)!;
      };

      for (const r of insights || []) {
        const b = bucket(r.date);
        const imps = Number(r.impressions || 0);
        b.spend += Number(r.spend || 0);
        b.reported += Number(r.leads || 0);
        b.impressions += imps;
        b.clicks += Number(r.clicks || 0);
        b.reachSum += Number(r.reach || 0);
        b.freqWeighted += Number(r.frequency || 0) * (imps || 1);
        b.rows += imps || 1;
      }
      for (const l of leads || []) {
        const d = String(l.created_time).slice(0, 10);
        const b = bucket(d);
        const email = (l.email || "").toString().trim().toLowerCase();
        const phone = (l.phone || "").toString().replace(/\D+/g, "");
        const key = email || phone || l.lead_id || crypto.randomUUID();
        b.keys.add(key);
      }

      const out: TrendPoint[] = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const key = fmtDate(cursor);
        const b = byDay.get(key) ?? { spend: 0, reported: 0, impressions: 0, clicks: 0, reachSum: 0, freqWeighted: 0, rows: 0, keys: new Set<string>() };
        const trueLeads = b.keys.size;
        const reported = b.reported;
        const cpl = reported > 0 ? b.spend / reported : 0;
        const trueCpl = trueLeads > 0 ? b.spend / trueLeads : cpl;
        const cpm = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
        const ctr = b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0;
        const frequency = b.rows > 0 ? b.freqWeighted / b.rows : 0;
        out.push({
          date: key.slice(5),
          spend: Number(b.spend.toFixed(2)),
          impressions: b.impressions,
          clicks: b.clicks,
          reportedLeads: reported,
          trueLeads,
          cpl: Number(cpl.toFixed(2)),
          trueCpl: Number(trueCpl.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          ctr: Number(ctr.toFixed(2)),
          frequency: Number(frequency.toFixed(2)),
          reported: Number(cpl.toFixed(2)),
          true: Number(trueCpl.toFixed(2)),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return out;
    },
  });
}
