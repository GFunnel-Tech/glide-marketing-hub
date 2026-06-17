import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type ChurnRiskLevel = "low" | "medium" | "high";

export interface ChurnRisk {
  client_id: number;
  workspace_id: string;
  risk_level: ChurnRiskLevel;
  score: number;
  reasons: string[];
  suggested_actions: string[];
  summary: string | null;
  signals: Record<string, any>;
  model: string | null;
  computed_at: string;
}

export function useChurnRisks() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["churn-risks", currentWorkspace?.id],
    enabled: !!currentWorkspace?.id,
    queryFn: async (): Promise<ChurnRisk[]> => {
      const { data, error } = await (supabase as any)
        .from("client_churn_risk")
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChurnRisk[];
    },
  });
}

export function useChurnRiskForClient(clientId: number | null | undefined) {
  return useQuery({
    queryKey: ["churn-risk", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ChurnRisk | null> => {
      const { data, error } = await (supabase as any)
        .from("client_churn_risk")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChurnRisk | null;
    },
  });
}

export function useRunChurnRiskScan() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId?: number) => {
      if (!currentWorkspace?.id) throw new Error("No workspace");
      const { data, error } = await supabase.functions.invoke("churn-risk-detect", {
        body: { workspace_id: currentWorkspace.id, client_id: clientId },
      });
      if (error) throw error;
      return data as { scanned: number; scored: number; high: number };
    },
    onSuccess: (data) => {
      toast.success(`Scored ${data.scored} clients · ${data.high} high-risk`);
      qc.invalidateQueries({ queryKey: ["churn-risks"] });
      qc.invalidateQueries({ queryKey: ["churn-risk"] });
      qc.invalidateQueries({ queryKey: ["daily-focus-items"] });
    },
    onError: (e: any) => toast.error(e?.message || "Churn scan failed"),
  });
}
