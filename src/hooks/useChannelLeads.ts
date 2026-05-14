import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type LeadChannel = "meta" | "google" | "tiktok" | "linkedin" | "manual";
export type LeadStage = "intake" | "in_progress" | "converted";

export const CHANNEL_TABLE: Record<LeadChannel, string> = {
  meta: "meta_leads",
  google: "google_leads",
  tiktok: "tiktok_leads",
  linkedin: "linkedin_leads",
  manual: "manual_leads",
};

export interface ChannelLead {
  id: string;
  workspace_id: string;
  client_id: number | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  form_id: string | null;
  form_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  created_time: string | null;
  field_data: { name: string; values: string[] }[] | null;
  stage: LeadStage;
  note: string | null;
  created_at: string;
}

export function useChannelLeads(channel: LeadChannel, clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const table = CHANNEL_TABLE[channel];

  return useQuery({
    queryKey: ["channel_leads", channel, wsId, clientId ?? "all"],
    enabled: !!wsId,
    queryFn: async () => {
      let q = (supabase as any)
        .from(table)
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_time", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (clientId !== undefined) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChannelLead[];
    },
  });
}

export function useUpdateLead(channel: LeadChannel) {
  const qc = useQueryClient();
  const table = CHANNEL_TABLE[channel];
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<ChannelLead, "stage" | "note" | "client_id">> }) => {
      const { error } = await (supabase as any).from(table).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel_leads", channel] });
    },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });
}

export function useInsertManualLead() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (rows: Partial<ChannelLead>[]) => {
      if (!currentWorkspace) throw new Error("No workspace");
      const payload = rows.map((r) => ({
        ...r,
        workspace_id: currentWorkspace.id,
        stage: r.stage ?? "intake",
        created_time: r.created_time ?? new Date().toISOString(),
      }));
      const { error } = await (supabase as any).from("manual_leads").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel_leads", "manual"] });
      toast.success("Leads imported");
    },
    onError: (e: any) => toast.error(e?.message || "Import failed"),
  });
}
