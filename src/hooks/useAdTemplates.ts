import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import type { AdBuilderState } from "@/components/ads/builder/types";

export interface AdTemplateRow {
  id: string;
  workspace_id: string;
  client_id: number | null;
  channel: string;
  objective: string;
  name: string;
  state: AdBuilderState;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdTemplates(objective?: string) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["ad_templates", wsId, objective ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("ad_templates").select("*").eq("workspace_id", wsId);
      if (objective) q = q.eq("objective", objective);
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdTemplateRow[];
    },
    enabled: !!wsId,
  });
}

export function useSaveAdTemplate() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; state: AdBuilderState }) => {
      if (!currentWorkspace || !user) throw new Error("No workspace");
      const { data, error } = await (supabase as any).from("ad_templates").insert({
        workspace_id: currentWorkspace.id,
        created_by: user.id,
        channel: "meta",
        objective: args.state.objective,
        name: args.name,
        state: args.state as any,
        thumbnail_url: args.state.media[0]?.url ?? null,
        client_id: args.state.clientId,
      }).select().single();
      if (error) throw error;
      return data as AdTemplateRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad_templates"] }),
  });
}

export function useDeleteAdTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("ad_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad_templates"] }),
  });
}
