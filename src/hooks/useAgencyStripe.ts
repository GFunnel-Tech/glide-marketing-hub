import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface AgencyStripeStatus {
  connected: boolean;
  account_id?: string | null;
  account_name?: string | null;
  account_email?: string | null;
  livemode?: boolean;
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_sync_charges_count?: number;
  last_sync_matched_count?: number;
}

export function useAgencyStripeStatus() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery<AgencyStripeStatus>({
    queryKey: ["agency-stripe-status", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_workspace_stripe_status", {
        _workspace_id: wsId,
      });
      if (error) throw error;
      return (data ?? { connected: false }) as AgencyStripeStatus;
    },
  });
}

export function useConnectAgencyStripe() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async (apiKey: string) => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke("agency-stripe-connect", {
        body: { workspace_id: currentWorkspace.id, api_key: apiKey },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-stripe-status"] });
    },
  });
}

export function useSyncAgencyStripe() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async (days = 90) => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke("agency-stripe-sync", {
        body: { workspace_id: currentWorkspace.id, days },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        fetched: number;
        upserts: number;
        matched: number;
        unmatched: number;
        payment_events: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-stripe-status"] });
      qc.invalidateQueries({ queryKey: ["workspace-charge-summaries"] });
      qc.invalidateQueries({ queryKey: ["payment-events"] });
    },
  });
}
