import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ClientGuarantee, GuaranteeTemplate, GuaranteeCriterion, GuaranteeStatus } from "@/lib/guaranteeTypes";

// ---------- Templates ----------

export function useGuaranteeTemplates() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["guarantee_templates", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<GuaranteeTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from("guarantee_templates")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GuaranteeTemplate[];
    },
  });
}

export function useUpsertGuaranteeTemplate() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<GuaranteeTemplate> & { name: string; criteria: GuaranteeCriterion[] }) => {
      if (!currentWorkspace?.id || !user?.id) throw new Error("Missing workspace or user");
      const payload: any = {
        workspace_id: currentWorkspace.id,
        created_by: user.id,
        name: input.name,
        description: input.description ?? null,
        terms: input.terms ?? null,
        duration_days: input.duration_days ?? 30,
        criteria: input.criteria,
        enabled: input.enabled ?? true,
      };
      if (input.id) payload.id = input.id;
      const { data, error } = await (supabase as any)
        .from("guarantee_templates")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as GuaranteeTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guarantee_templates"] }),
  });
}

export function useDeleteGuaranteeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("guarantee_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guarantee_templates"] }),
  });
}

// ---------- Client guarantees ----------

export function useClientGuarantees(clientId?: number | null) {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const wsId = currentWorkspace?.id ?? null;

  useEffect(() => {
    if (!wsId) return;
    const channel = supabase
      .channel(`guarantees-${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_guarantees" }, () => {
        qc.invalidateQueries({ queryKey: ["client_guarantees"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [wsId, qc]);

  return useQuery({
    queryKey: ["client_guarantees", wsId, clientId ?? "all"],
    enabled: !!wsId,
    queryFn: async (): Promise<ClientGuarantee[]> => {
      let q = (supabase as any)
        .from("client_guarantees")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (clientId != null) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientGuarantee[];
    },
  });
}

export function useUpsertClientGuarantee() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<ClientGuarantee> & { name: string; client_id: number; criteria: GuaranteeCriterion[]; deadline: string }) => {
      if (!currentWorkspace?.id || !user?.id) throw new Error("Missing workspace or user");
      const payload: any = {
        workspace_id: currentWorkspace.id,
        created_by: user.id,
        client_id: input.client_id,
        template_id: input.template_id ?? null,
        name: input.name,
        description: input.description ?? null,
        terms: input.terms ?? null,
        criteria: input.criteria,
        start_date: input.start_date ?? new Date().toISOString().slice(0, 10),
        deadline: input.deadline,
        status: input.status ?? "on_track",
        visible_to_client: input.visible_to_client ?? true,
      };
      if (input.id) payload.id = input.id;
      const { data, error } = await (supabase as any)
        .from("client_guarantees")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as ClientGuarantee;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_guarantees"] }),
  });
}

export function useDeleteClientGuarantee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_guarantees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_guarantees"] }),
  });
}

export function useUpdateGuaranteeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, criteria }: { id: string; status: GuaranteeStatus; criteria?: GuaranteeCriterion[] }) => {
      const payload: any = { status, last_evaluated_at: new Date().toISOString() };
      if (criteria) payload.criteria = criteria;
      const { error } = await (supabase as any).from("client_guarantees").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_guarantees"] }),
  });
}
