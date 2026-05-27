import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface TrendPoint {
  date: string;
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
 * Daily portfolio CPL trend over the selected date range.
 * Reported CPL = sum(spend) / sum(reported leads from meta_insights_daily).
 * True CPL = sum(spend) / sum(deduped meta_leads in same day).
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
        .select("date, spend, leads")
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

      const byDay = new Map<string, { spend: number; reported: number; keys: Set<string> }>();
      const bucket = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { spend: 0, reported: 0, keys: new Set() });
        return byDay.get(d)!;
      };

      for (const r of insights || []) {
        const b = bucket(r.date);
        b.spend += Number(r.spend || 0);
        b.reported += Number(r.leads || 0);
      }
      for (const l of leads || []) {
        const d = String(l.created_time).slice(0, 10);
        const b = bucket(d);
        const email = (l.email || "").toString().trim().toLowerCase();
        const phone = (l.phone || "").toString().replace(/\D+/g, "");
        const key = email || phone || l.lead_id || crypto.randomUUID();
        b.keys.add(key);
      }

      // fill all dates in range
      const out: TrendPoint[] = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const key = fmtDate(cursor);
        const b = byDay.get(key) ?? { spend: 0, reported: 0, keys: new Set<string>() };
        const trueLeads = b.keys.size;
        const reported = b.reported;
        out.push({
          date: key.slice(5),
          reported: reported > 0 ? b.spend / reported : 0,
          true: trueLeads > 0 ? b.spend / trueLeads : reported > 0 ? b.spend / reported : 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return out;
    },
  });
}
