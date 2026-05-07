import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface MetaAd {
  id: string;
  workspace_id: string;
  client_id: number | null;
  ad_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  name: string | null;
  effective_status: string | null;
  creative_id: string | null;
  creative_hash: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  title: string | null;
  body: string | null;
  call_to_action_type: string | null;
  link_url: string | null;
  targeting_summary: any;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number;
  days_active: number;
  first_seen_at: string | null;
  updated_at: string;
}

export function useMetaAds(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["meta_ads", wsId, clientId ?? null],
    enabled: !!wsId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("meta_ads")
        .select("*")
        .eq("workspace_id", wsId)
        .order("spend", { ascending: false })
        .limit(500);
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MetaAd[];
    },
  });
}

export type AdClass = "best" | "worst" | "learning" | "unclassified";

export function classifyAd(
  ad: MetaAd,
  thresholds: { greenCpl: number; redCpl: number },
): AdClass {
  // Learning: Meta says so, OR very new, OR not enough data
  if (
    ad.effective_status === "IN_PROCESS" ||
    ad.effective_status === "PENDING_REVIEW" ||
    ad.days_active < 7 ||
    ad.leads < 5
  ) {
    return "learning";
  }
  // Worst: spent meaningfully with no leads, or CPL above red
  if ((ad.spend >= 200 && ad.leads === 0) || (ad.cpl > 0 && ad.cpl >= thresholds.redCpl)) {
    return "worst";
  }
  // Best: enough spend to trust the number AND CPL at/under green
  if (ad.spend >= 50 && ad.leads >= 5 && ad.cpl > 0 && ad.cpl <= thresholds.greenCpl) {
    return "best";
  }
  return "unclassified";
}
