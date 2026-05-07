import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type KpiDirection = "lower" | "higher" | "band";

export interface KpiSpec {
  weight: number;
  direction: KpiDirection;
  green?: number;
  yellow?: number;
  green_min?: number;
  green_max?: number;
  yellow_min?: number;
  yellow_max?: number;
}

export type KpiMap = Record<string, KpiSpec>;

export interface KpiPreset {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  kpis: KpiMap;
  is_default: boolean;
}

export interface WorkspaceKpiSettings {
  id: string;
  workspace_id: string;
  preset_id: string | null;
  overrides: KpiMap;
  green_score_min: number;
  yellow_score_min: number;
}

export const KPI_LABELS: Record<string, { label: string; unit: string; direction: KpiDirection }> = {
  cpl: { label: "CPL", unit: "$", direction: "lower" },
  cpm: { label: "CPM", unit: "$", direction: "lower" },
  form_cvr: { label: "Form CVR", unit: "%", direction: "higher" },
  frequency: { label: "Frequency", unit: "x", direction: "lower" },
  spend_pacing: { label: "Spend Pacing", unit: "%", direction: "band" },
  lead_quality: { label: "Lead Quality", unit: "%", direction: "higher" },
};

export function useKpiPresets() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["kpi-presets", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_threshold_presets" as any)
        .select("*")
        .or(`workspace_id.is.null,workspace_id.eq.${currentWorkspace!.id}`)
        .order("workspace_id", { nullsFirst: true })
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as KpiPreset[];
    },
  });
}

export function useWorkspaceKpiSettings() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-kpi-settings", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_kpi_settings" as any)
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WorkspaceKpiSettings | null;
    },
  });
}

export function useUpsertWorkspaceKpiSettings() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<WorkspaceKpiSettings>) => {
      if (!currentWorkspace) throw new Error("No workspace");
      const payload = { workspace_id: currentWorkspace.id, ...input };
      const { error } = await supabase
        .from("workspace_kpi_settings" as any)
        .upsert(payload as any, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-kpi-settings"] });
      toast.success("KPI settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRecomputeStatuses() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!currentWorkspace) throw new Error("No workspace");
      const { data, error } = await supabase.rpc("recompute_all_client_statuses" as any, {
        _workspace_id: currentWorkspace.id,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Recomputed — ${count} client${count === 1 ? "" : "s"} updated`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}
