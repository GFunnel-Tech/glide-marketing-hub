import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Sales pipelines (C2).
 *
 * Two stage machines run on this: RIVE D3, the fourteen-day consultative
 * Divide phase, and Glide CTV, the productized funnel. They are deliberately
 * separate from `client_status_phases`, which tracks client *health* and whose
 * keys are auto-managed by the status automation.
 */

export const PIPELINE_D3 = "rive_d3";
export const PIPELINE_CTV = "glide_ctv";

export interface Pipeline {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

export interface PipelineStage {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  key: string;
  label: string;
  description: string | null;
  /** Where the stage sits in the playbook's calendar, e.g. "Days 2–4". */
  day_label: string | null;
  sort_order: number;
  exit_criteria: string[];
  webhook_url: string | null;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}

// Raised when the C2 migration has not been applied to this environment yet.
const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null) {
  return error?.code === UNDEFINED_TABLE;
}

export function usePipelines() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["pipelines", wsId],
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("enabled", true)
        .order("key");
      // Tolerated so the app still runs before the migration is applied.
      if (error) return isMissingTable(error) ? [] : Promise.reject(error);
      return (data || []) as Pipeline[];
    },
    enabled: !!wsId,
  });
}

export function usePipelineStages(pipelineId?: string | null) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["pipeline_stages", wsId, pipelineId ?? "all"],
    queryFn: async (): Promise<PipelineStage[]> => {
      let q = (supabase as any)
        .from("pipeline_stages")
        .select("*")
        .eq("workspace_id", wsId)
        .order("sort_order");
      if (pipelineId) q = q.eq("pipeline_id", pipelineId);
      const { data, error } = await q;
      if (error) return isMissingTable(error) ? [] : Promise.reject(error);
      return (data || []) as PipelineStage[];
    },
    enabled: !!wsId,
  });
}

/** Creates the two default pipelines and their stages for this workspace. */
export function useSeedPipelines() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async () => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");
      const { error } = await (supabase as any).rpc("seed_default_pipelines", {
        _workspace_id: wsId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
    },
  });
}

/**
 * Moves a prospect to a stage. The database stamps `stage_entered_at`, and a
 * won or lost stage carries the lifecycle across with it so the two never drift
 * apart — a prospect sitting in "Closed won" while still counted as pre-sale
 * would corrupt every downstream report.
 */
export function useSetPipelineStage() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async ({
      clientId,
      stage,
    }: {
      clientId: number;
      stage: PipelineStage;
    }) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");

      const patch: Record<string, unknown> = {
        pipeline_id: stage.pipeline_id,
        pipeline_stage_id: stage.id,
      };
      if (stage.is_won) patch.lifecycle = "client";
      if (stage.is_lost) patch.lifecycle = "churned";

      const { error } = await (supabase as any)
        .from("clients")
        .update(patch)
        .eq("id", clientId)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Whole days a row has sat in its current stage. */
export function daysInStage(stageEnteredAt: string | null): number | null {
  if (!stageEnteredAt) return null;
  const then = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}
