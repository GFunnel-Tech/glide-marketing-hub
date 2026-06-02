import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientStripeConnection {
  client_id: number;
  stripe_user_id: string;
  livemode: boolean;
  connect_type: string;
  connected_at: string;
  disconnected_at: string | null;
  last_event_at: string | null;
  last_event_type: string | null;
  is_connected: boolean;
}

export function useClientStripeConnections() {
  return useQuery({
    queryKey: ["client-stripe-connections"],
    queryFn: async (): Promise<Record<number, ClientStripeConnection>> => {
      const { data, error } = await (supabase as any)
        .from("client_stripe_connections")
        .select("*");
      if (error) throw error;
      const map: Record<number, ClientStripeConnection> = {};
      for (const row of (data ?? []) as ClientStripeConnection[]) {
        map[row.client_id] = row;
      }
      return map;
    },
  });
}

export function useConnectClientStripe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { clientId: number; apiKey: string; webhookSecret?: string }) => {
      const { data, error } = await supabase.functions.invoke("stripe-client-connect", {
        body: vars,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { ok: true; stripe_user_id: string; livemode: boolean; business_name: string | null; email: string | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-stripe-connections"] }),
  });
}

export function useDisconnectClientStripe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: number) => {
      const { data, error } = await supabase.functions.invoke("stripe-client-disconnect", {
        body: { clientId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-stripe-connections"] }),
  });
}

export function useClientStripeCharges(clientId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["client-stripe-charges", clientId],
    enabled: !!clientId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("stripe-client-charges", {
        body: { clientId, limit: 50 },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { charges: any[]; livemode: boolean; stripe_user_id: string };
    },
  });
}
