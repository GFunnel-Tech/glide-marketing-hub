import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type RequestKind = "campaign" | "report" | "integration";

const tableFor = (k: RequestKind) =>
  k === "campaign" ? "campaign_requests" : k === "report" ? "report_requests" : "integration_requests";

export function useClientRequests(kind: RequestKind, clientId: number | null) {
  return useQuery({
    queryKey: ["client-requests", kind, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableFor(kind) as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateClientRequest(kind: RequestKind, clientId: number | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!clientId) throw new Error("missing client");
      const { data, error } = await supabase
        .from(tableFor(kind) as any)
        .insert({ ...payload, client_id: clientId, requested_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-requests", kind, clientId] }),
  });
}

export function useUpdateClientRequest(kind: RequestKind, clientId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from(tableFor(kind) as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-requests", kind, clientId] }),
  });
}
