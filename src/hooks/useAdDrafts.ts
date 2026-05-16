import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import type { AdBuilderState } from "@/components/ads/builder/types";

export interface AdDraftRow {
  id: string;
  workspace_id: string;
  client_id: number | null;
  objective: string;
  special_ad_category: string | null;
  countries: string[];
  state: AdBuilderState;
  status: string;
  meta_campaign_id: string | null;
  meta_ad_id: string | null;
  launch_error: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdDrafts() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["ad_drafts", wsId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_drafts")
        .select("*")
        .eq("workspace_id", wsId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdDraftRow[];
    },
    enabled: !!wsId,
  });
}

export function useSaveAdDraft() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string | null; state: AdBuilderState }) => {
      if (!currentWorkspace || !user) throw new Error("No workspace");
      const payload = {
        workspace_id: currentWorkspace.id,
        created_by: user.id,
        channel: "meta",
        objective: args.state.objective,
        special_ad_category: args.state.specialAdCategory,
        countries: args.state.countries,
        client_id: args.state.clientId,
        state: args.state as any,
        preview_summary: {
          name: args.state.campaignName || args.state.primaryTexts[0]?.slice(0, 60) || "Untitled ad",
          thumbnail: args.state.media[0]?.url ?? null,
        },
      };
      if (args.id) {
        const { data, error } = await (supabase as any)
          .from("ad_drafts").update(payload).eq("id", args.id).select().single();
        if (error) throw error;
        return data as AdDraftRow;
      }
      const { data, error } = await (supabase as any)
        .from("ad_drafts").insert(payload).select().single();
      if (error) throw error;
      return data as AdDraftRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad_drafts"] }),
  });
}

export function useDeleteAdDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("ad_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad_drafts"] }),
  });
}
