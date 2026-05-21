import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEffect } from "react";

export type LeadGrade = "A" | "B" | "C" | "D";
export type LeadSource = "meta" | "google" | "linkedin" | "manual" | "ghl";

export interface LeadScore {
  id: string;
  workspace_id: string;
  client_id: number | null;
  campaign_id: string | null;
  lead_id: string;
  lead_source: LeadSource;
  score: number;
  grade: LeadGrade;
  rule_set_id: string | null;
  rule_set_version: number | null;
  breakdown: any;
  outcome: "unknown" | "closed_won" | "closed_lost" | "disqualified";
  computed_at: string;
}

export function useLeadScores(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();

  useEffect(() => {
    if (!wsId) return;
    const ch = supabase
      .channel(`lead_scores:${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_scores", filter: `workspace_id=eq.${wsId}` },
        () => qc.invalidateQueries({ queryKey: ["lead_scores", wsId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wsId, qc]);

  return useQuery({
    queryKey: ["lead_scores", wsId, clientId ?? "all"],
    queryFn: async () => {
      if (!wsId) return [];
      let q = (supabase as any).from("lead_scores").select("*").eq("workspace_id", wsId).limit(2000);
      if (clientId !== undefined) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadScore[];
    },
    enabled: !!wsId,
  });
}

/** Map keyed by `${source}:${lead_id}` for fast lookup. */
export function useLeadScoreIndex(clientId?: number) {
  const q = useLeadScores(clientId);
  const index = new Map<string, LeadScore>();
  for (const s of q.data ?? []) index.set(`${s.lead_source}:${s.lead_id}`, s);
  return { ...q, index };
}

export function useComputeLeadScores() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { leadIds?: { source: LeadSource; leadId: string }[]; limit?: number }) => {
      if (!currentWorkspace) throw new Error("No workspace");
      const { data, error } = await supabase.functions.invoke("lead-score-compute", {
        body: { workspaceId: currentWorkspace.id, ...opts },
      });
      if (error) throw error;
      return data as { scored: number; attempted: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_scores"] });
    },
  });
}

/** Workspace-level avg quality KPI. */
export function useClientLeadQualityRollup() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["lead_score_rollup", wsId],
    queryFn: async () => {
      if (!wsId) return new Map<number, { avg: number; count: number; gradeCounts: Record<LeadGrade, number> }>();
      const { data, error } = await (supabase as any).from("lead_scores")
        .select("client_id, score, grade")
        .eq("workspace_id", wsId)
        .gte("computed_at", new Date(Date.now() - 30 * 86400_000).toISOString())
        .limit(5000);
      if (error) throw error;
      const map = new Map<number, { sum: number; count: number; gradeCounts: Record<LeadGrade, number> }>();
      for (const row of data ?? []) {
        if (row.client_id == null) continue;
        const cur = map.get(row.client_id) ?? { sum: 0, count: 0, gradeCounts: { A: 0, B: 0, C: 0, D: 0 } };
        cur.sum += Number(row.score);
        cur.count += 1;
        cur.gradeCounts[row.grade as LeadGrade] = (cur.gradeCounts[row.grade as LeadGrade] ?? 0) + 1;
        map.set(row.client_id, cur);
      }
      const out = new Map<number, { avg: number; count: number; gradeCounts: Record<LeadGrade, number> }>();
      map.forEach((v, k) => out.set(k, { avg: v.sum / v.count, count: v.count, gradeCounts: v.gradeCounts }));
      return out;
    },
    enabled: !!wsId,
  });
}
