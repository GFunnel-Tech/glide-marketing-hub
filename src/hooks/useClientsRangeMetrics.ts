import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface ClientRangeMetrics {
  clientId: number;
  spend: number;
  impressions: number;
  clicks: number;
  reportedLeads: number;
  trueLeads: number;
  cpl: number;
  trueCpl: number;
  cpm: number;
  formCvr: number;
  frequency: number;
  doubleCount: boolean;
}

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Aggregates per-client KPIs over the currently-selected global date range
 * from `meta_insights_daily` (joined via `meta_ad_accounts` → client_id) and
 * `meta_leads` (true, deduped count). Returns a map keyed by client id.
 *
 * The "All Clients" table merges this on top of the base client row so the
 * displayed CPL / CPM / Leads / Spend / Form CVR / Freq / DC react to the
 * picker instead of always showing the hardcoded last-30d snapshot written
 * by meta-sync.
 */
export function useClientsRangeMetrics() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, queryKey: rangeKey } = useDateRange();

  return useQuery({
    queryKey: ["clients-range-metrics", wsId, ...rangeKey],
    enabled: !!wsId,
    queryFn: async (): Promise<Record<number, ClientRangeMetrics>> => {
      const fromStr = fmtDate(from);
      const toStr = fmtDate(to);
      const fromISO = new Date(from).toISOString();
      const toISO = new Date(to).toISOString();

      // 1. Ad account -> client_id map
      const { data: accts, error: aErr } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("id, client_id")
        .eq("workspace_id", wsId);
      if (aErr) throw aErr;
      const acctToClient = new Map<string, number>();
      (accts || []).forEach((a: any) => {
        if (a.client_id) acctToClient.set(a.id, a.client_id);
      });

      // 2. Insights in window
      const { data: insights, error: iErr } = await (supabase as any)
        .from("meta_insights_daily")
        .select("ad_account_id, spend, impressions, clicks, leads, frequency")
        .eq("workspace_id", wsId)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (iErr) throw iErr;

      // 3. Leads in window (for true-leads dedupe)
      const { data: leads, error: lErr } = await (supabase as any)
        .from("meta_leads")
        .select("client_id, lead_id, email, phone, created_time")
        .eq("workspace_id", wsId)
        .gte("created_time", fromISO)
        .lte("created_time", toISO);
      if (lErr) throw lErr;

      const agg: Record<number, {
        spend: number;
        impressions: number;
        clicks: number;
        reportedLeads: number;
        freqSum: number;
        freqWeight: number;
        leadKeys: Set<string>;
      }> = {};

      const bucket = (cid: number) => {
        if (!agg[cid]) {
          agg[cid] = {
            spend: 0,
            impressions: 0,
            clicks: 0,
            reportedLeads: 0,
            freqSum: 0,
            freqWeight: 0,
            leadKeys: new Set(),
          };
        }
        return agg[cid];
      };

      for (const row of insights || []) {
        const cid = acctToClient.get(row.ad_account_id);
        if (!cid) continue;
        const b = bucket(cid);
        const imp = Number(row.impressions || 0);
        b.spend += Number(row.spend || 0);
        b.impressions += imp;
        b.clicks += Number(row.clicks || 0);
        b.reportedLeads += Number(row.leads || 0);
        const f = Number(row.frequency || 0);
        if (f > 0 && imp > 0) {
          b.freqSum += f * imp;
          b.freqWeight += imp;
        }
      }

      for (const row of leads || []) {
        if (!row.client_id) continue;
        const b = bucket(row.client_id);
        const email = (row.email || "").toString().trim().toLowerCase();
        const phone = (row.phone || "").toString().replace(/\D+/g, "");
        const key = email || phone || row.lead_id || crypto.randomUUID();
        b.leadKeys.add(key);
      }

      const out: Record<number, ClientRangeMetrics> = {};
      for (const [cidStr, b] of Object.entries(agg)) {
        const cid = Number(cidStr);
        const trueLeads = b.leadKeys.size;
        const effectiveLeads = trueLeads > 0 ? trueLeads : b.reportedLeads;
        const cpl = effectiveLeads > 0 ? b.spend / effectiveLeads : 0;
        const trueCpl = trueLeads > 0 ? b.spend / trueLeads : cpl;
        const cpm = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
        const formCvr = b.clicks > 0 ? (b.reportedLeads / b.clicks) * 100 : 0;
        const frequency = b.freqWeight > 0 ? b.freqSum / b.freqWeight : 0;
        out[cid] = {
          clientId: cid,
          spend: b.spend,
          impressions: b.impressions,
          clicks: b.clicks,
          reportedLeads: b.reportedLeads,
          trueLeads,
          cpl,
          trueCpl,
          cpm,
          formCvr,
          frequency,
          doubleCount: trueLeads > 0 && b.reportedLeads > trueLeads * 1.15,
        };
      }
      return out;
    },
  });
}
