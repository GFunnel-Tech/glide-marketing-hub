import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export interface AiInsight {
  id: string;
  workspace_id: string;
  client_id: number | null;
  kind: "anomaly" | "forecast" | "recommendation" | "benchmark" | "summary";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string | null;
  metrics: any;
  reasoning: string | null;
  status: "open" | "dismissed" | "acted_on";
  related_action_id: string | null;
  created_at: string;
}

export function useAiInsights(
  workspaceId: string | undefined,
  opts: { clientId?: number | null; status?: "open" | "dismissed" | "acted_on" | "all"; limit?: number } = {},
) {
  const qc = useQueryClient();
  const status = opts.status ?? "open";
  const key = ["ai-insights", workspaceId, opts.clientId ?? null, status, opts.limit ?? 50];

  const query = useQuery({
    queryKey: key,
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("ai_insights")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 50);
      if (opts.clientId !== undefined && opts.clientId !== null) q = q.eq("client_id", opts.clientId);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AiInsight[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`ai-insights-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_insights", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["ai-insights", workspaceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_insights")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights", workspaceId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, dismiss };
}

export function useTriggerOpsScan(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-ops-scan", {
        body: { workspaceId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Scan complete · ${data?.clients_scanned ?? 0} clients · ${data?.insights_created ?? 0} insights · ${data?.actions_auto_queued ?? 0} auto-actions`,
      );
      qc.invalidateQueries({ queryKey: ["ai-insights", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-pending"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Scan failed"),
  });
}

export interface PortfolioSnapshot {
  workspace_id: string;
  total_clients: number;
  red_clients: number;
  yellow_clients: number;
  green_clients: number;
  spend_30d: number | null;
  leads_30d: number | null;
  portfolio_cpl_30d: number | null;
  median_cpl_30d: number | null;
  p90_cpl_30d: number | null;
}

export function usePortfolioSnapshot(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-snapshot", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_portfolio_snapshot")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as PortfolioSnapshot | null;
    },
  });
}
