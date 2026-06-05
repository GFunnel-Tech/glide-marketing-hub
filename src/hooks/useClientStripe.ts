import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

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

/**
 * Starts the "click and sync" Stripe Connect OAuth flow for a client.
 * Returns the authorize URL to redirect to, or `{ notConfigured: true }`
 * when the platform OAuth app isn't set up so the caller can fall back to
 * the manual restricted-key dialog.
 */
export function useStartClientStripeOAuth() {
  return useMutation({
    mutationFn: async (vars: { clientId: number; returnUrl?: string }) => {
      const { data, error } = await supabase.functions.invoke("stripe-client-oauth-start", {
        body: { clientId: vars.clientId, returnUrl: vars.returnUrl },
      });
      if (error) throw new Error(error.message);
      if (data?.error === "oauth_not_configured") return { notConfigured: true as const };
      if (data?.error) throw new Error(data.error);
      return { url: data.url as string };
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
        body: { clientId, limit: 100 },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { charges: any[]; livemode: boolean; stripe_user_id: string };
    },
  });
}

export interface ClientChargeSummary {
  client_id: number;
  last_status: string;       // succeeded | failed | pending | ...
  last_amount: number;       // minor units (cents)
  last_currency: string;
  last_charge_at: string;    // ISO
  paid: boolean;
}

/**
 * Latest mirrored Stripe charge per client in the current workspace. Reads
 * the webhook-populated `stripe_charges` table (RLS-scoped to members), so
 * the billing dashboard can show real payment status without per-client API
 * calls. Returns a map keyed by client_id.
 */
export function useWorkspaceChargeSummaries() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-charge-summaries", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async (): Promise<Record<number, ClientChargeSummary>> => {
      const { data, error } = await (supabase as any)
        .from("stripe_charges")
        .select("client_id, status, amount, currency, paid, created_at_stripe")
        .eq("workspace_id", currentWorkspace!.id)
        .order("created_at_stripe", { ascending: false });
      if (error) throw error;
      const map: Record<number, ClientChargeSummary> = {};
      for (const row of (data ?? []) as any[]) {
        // First row per client wins (already sorted newest-first).
        if (map[row.client_id]) continue;
        map[row.client_id] = {
          client_id: row.client_id,
          last_status: row.status,
          last_amount: row.amount,
          last_currency: row.currency,
          last_charge_at: row.created_at_stripe,
          paid: row.paid,
        };
      }
      return map;
    },
  });
}

export function useClientStripePayouts(clientId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["client-stripe-payouts", clientId],
    enabled: !!clientId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("stripe-client-payouts", {
        body: { clientId, limit: 100 },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { payouts: any[]; livemode: boolean; stripe_user_id: string };
    },
  });
}

