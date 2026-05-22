import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import type { FormulaNode } from "@/lib/kpiFormula";

export interface CustomKpi {
  id: string;
  workspace_id: string;
  client_id: number | null;
  name: string;
  description: string | null;
  unit: "currency" | "percent" | "number" | "ratio";
  format: { decimals?: number; prefix?: string; suffix?: string };
  direction: "lower_better" | "higher_better" | "range";
  formula: FormulaNode;
  enabled: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CustomKpiAlert {
  id: string;
  custom_kpi_id: string;
  workspace_id: string;
  client_id: number | null;
  trigger_type: "threshold" | "trend";
  threshold: { op: "gt" | "lt" | "between"; value: number; value2?: number } | null;
  trend: { window_days: number; change_pct: number; direction: "up" | "down" | "either" } | null;
  severity: "info" | "warning" | "critical";
  cooldown_minutes: number;
  notify_channels: { in_app: boolean; email: string[] };
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
}

export interface CustomKpiEvaluation {
  id: string;
  custom_kpi_id: string;
  client_id: number | null;
  period_start: string;
  period_end: string;
  value: number | null;
  inputs: Record<string, number>;
  created_at: string;
}

export function useCustomKpis(clientId?: number | null) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["custom_kpis", wsId, clientId ?? null],
    enabled: !!wsId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("custom_kpis")
        .select("*")
        .eq("workspace_id", wsId)
        .order("sort_order", { ascending: true });
      if (clientId != null) q = q.or(`client_id.is.null,client_id.eq.${clientId}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomKpi[];
    },
  });
}

export function useCustomKpiAlerts(kpiId?: string) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["custom_kpi_alerts", wsId, kpiId ?? null],
    enabled: !!wsId,
    queryFn: async () => {
      let q = (supabase as any).from("custom_kpi_alerts").select("*").eq("workspace_id", wsId);
      if (kpiId) q = q.eq("custom_kpi_id", kpiId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomKpiAlert[];
    },
  });
}

export function useLatestKpiEvaluations(kpiIds: string[], clientId?: number | null) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["custom_kpi_evals_latest", wsId, kpiIds.sort().join(","), clientId ?? null],
    enabled: !!wsId && kpiIds.length > 0,
    queryFn: async () => {
      let q = (supabase as any)
        .from("custom_kpi_evaluations")
        .select("*")
        .eq("workspace_id", wsId)
        .in("custom_kpi_id", kpiIds)
        .order("period_end", { ascending: false })
        .limit(500);
      if (clientId != null) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      // dedupe to latest per (kpi, client)
      const latest = new Map<string, CustomKpiEvaluation>();
      for (const row of (data ?? []) as CustomKpiEvaluation[]) {
        const key = `${row.custom_kpi_id}:${row.client_id ?? "_"}`;
        if (!latest.has(key)) latest.set(key, row);
      }
      return Array.from(latest.values());
    },
  });
}

export function useUpsertCustomKpi() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<CustomKpi> & { id?: string }) => {
      if (!currentWorkspace?.id || !user?.id) throw new Error("No workspace/user");
      const row = {
        ...payload,
        workspace_id: currentWorkspace.id,
        created_by: user.id,
      };
      if (payload.id) {
        const { error } = await (supabase as any).from("custom_kpis").update(row).eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      }
      const { data, error } = await (supabase as any).from("custom_kpis").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_kpis"] }),
  });
}

export function useDeleteCustomKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("custom_kpis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_kpis"] });
      qc.invalidateQueries({ queryKey: ["custom_kpi_alerts"] });
    },
  });
}

export function useUpsertCustomKpiAlert() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<CustomKpiAlert> & { id?: string }) => {
      if (!currentWorkspace?.id || !user?.id) throw new Error("No workspace/user");
      const row = { ...payload, workspace_id: currentWorkspace.id, created_by: user.id };
      if (payload.id) {
        const { error } = await (supabase as any).from("custom_kpi_alerts").update(row).eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      }
      const { data, error } = await (supabase as any).from("custom_kpi_alerts").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_kpi_alerts"] }),
  });
}

export function useDeleteCustomKpiAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("custom_kpi_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_kpi_alerts"] }),
  });
}

export async function runCustomKpiEvaluate(workspaceId: string) {
  const { data, error } = await (supabase as any).functions.invoke("custom-kpi-evaluate", {
    body: { workspace_id: workspaceId },
  });
  if (error) throw error;
  return data;
}
