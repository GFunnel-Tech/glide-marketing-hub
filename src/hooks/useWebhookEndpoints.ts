import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface WebhookEndpoint {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  description: string | null;
  events: string[];
  secret: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  last_status: string | null;
  last_error: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event: string;
  status: string;
  error: string | null;
  created_at: string;
}

export type WebhookEndpointInput = Pick<
  WebhookEndpoint,
  "name" | "url" | "description" | "events" | "secret" | "headers" | "enabled"
>;

export function useWebhookEndpoints() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();
  const queryKey = ["webhook_endpoints", wsId];

  const query = useQuery({
    queryKey,
    enabled: !!wsId,
    queryFn: async (): Promise<WebhookEndpoint[]> => {
      const { data, error } = await (supabase as any)
        .from("webhook_endpoints")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WebhookEndpoint[];
    },
  });

  const save = useMutation({
    mutationFn: async (vars: { id?: string } & WebhookEndpointInput) => {
      if (!wsId) throw new Error("No workspace selected");
      const { id, ...fields } = vars;
      if (id) {
        const { error } = await (supabase as any)
          .from("webhook_endpoints")
          .update(fields)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("webhook_endpoints")
          .insert({ ...fields, workspace_id: wsId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("webhook_endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const setEnabled = useMutation({
    mutationFn: async (vars: { id: string; enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from("webhook_endpoints")
        .update({ enabled: vars.enabled })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const test = useMutation({
    mutationFn: async (
      vars: { endpoint_id: string } | { url: string; secret?: string | null; headers?: Record<string, string> },
    ): Promise<{ ok: boolean; status: number; message: string }> => {
      const { data, error } = await supabase.functions.invoke("webhooks-test", { body: vars });
      if (error) throw error;
      return data as { ok: boolean; status: number; message: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...query, endpoints: query.data ?? [], save, remove, setEnabled, test };
}

export function useWebhookDeliveries(endpointId: string | null) {
  return useQuery({
    queryKey: ["webhook_deliveries", endpointId],
    enabled: !!endpointId,
    queryFn: async (): Promise<WebhookDelivery[]> => {
      const { data, error } = await (supabase as any)
        .from("webhook_deliveries")
        .select("id, endpoint_id, event, status, error, created_at")
        .eq("endpoint_id", endpointId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as WebhookDelivery[];
    },
  });
}
