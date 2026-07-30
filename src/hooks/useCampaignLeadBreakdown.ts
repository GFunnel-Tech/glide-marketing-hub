import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";
import { readCreditScore } from "@/lib/leadCreditScore";


export interface LeadBreakdown {
  scored: number;
  above640: number;
  pct: number | null;
}

/**
 * Per-(campaign|adset|ad) credit-score breakdown over the global date range.
 * Returns three maps so a single round-trip serves all three hierarchy levels.
 */
export function useCampaignLeadBreakdown() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to } = useDateRange();

  return useQuery({
    queryKey: [
      "campaign-lead-breakdown",
      wsId,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    ],
    enabled: !!wsId,
    queryFn: async (): Promise<{
      byCampaign: Record<string, LeadBreakdown>;
      byAdset: Record<string, LeadBreakdown>;
      byAd: Record<string, LeadBreakdown>;
    }> => {
      const fromISO = `${from.toISOString().slice(0, 10)}T00:00:00.000Z`;
      const toISO = `${to.toISOString().slice(0, 10)}T23:59:59.999Z`;

      const { data, error } = await (supabase as any)
        .from("meta_leads")
        .select("campaign_id, adset_id, ad_id, field_data")
        .eq("workspace_id", wsId)
        .gte("created_time", fromISO)
        .lte("created_time", toISO)
        .limit(5000);
      if (error) throw error;

      const inc = (
        bucket: Record<string, { scored: number; above640: number }>,
        key: string | null,
        isAbove: boolean
      ) => {
        if (!key) return;
        if (!bucket[key]) bucket[key] = { scored: 0, above640: 0 };
        bucket[key].scored += 1;
        if (isAbove) bucket[key].above640 += 1;
      };

      const camp: Record<string, { scored: number; above640: number }> = {};
      const adset: Record<string, { scored: number; above640: number }> = {};
      const ad: Record<string, { scored: number; above640: number }> = {};

      for (const row of data ?? []) {
        const fields = Array.isArray(row.field_data) ? row.field_data : [];
        let hasScore = false;
        let isAbove = false;
        for (const f of fields) {
          const name = String(f?.name ?? "").toLowerCase();
          if (!name.includes("credit_score") && !name.includes("credit score")) continue;
          const val = String(f?.values?.[0] ?? "").toLowerCase();
          if (!val) continue;
          hasScore = true;
          if (val.startsWith("above")) isAbove = true;
          break;
        }
        if (!hasScore) continue;
        inc(camp, row.campaign_id, isAbove);
        inc(adset, row.adset_id, isAbove);
        inc(ad, row.ad_id, isAbove);
      }

      const finalize = (b: Record<string, { scored: number; above640: number }>) => {
        const out: Record<string, LeadBreakdown> = {};
        for (const [k, v] of Object.entries(b)) {
          out[k] = {
            scored: v.scored,
            above640: v.above640,
            pct: v.scored > 0 ? (v.above640 / v.scored) * 100 : null,
          };
        }
        return out;
      };

      return {
        byCampaign: finalize(camp),
        byAdset: finalize(adset),
        byAd: finalize(ad),
      };
    },
  });
}
