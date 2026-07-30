import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface PaymentEvent {
  id: string;
  workspace_id: string;
  client_id: number | null;
  stripe_user_id: string | null;
  stripe_charge_id: string | null;
  customer_email: string | null;
  event_type:
    | "charge_failed"
    | "charge_refunded"
    | "charge_disputed"
    | "invoice_payment_failed"
    | "ad_account_disabled"
    | "ad_account_unsettled"
    | "ad_account_risk_review"
    | "ad_account_pending_settlement"
    | "ad_account_grace_period";
  severity: "warn" | "critical";
  status: "open" | "acknowledged" | "resolved";
  amount: number;
  currency: string;
  failure_code: string | null;
  failure_message: string | null;
  description: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export function usePaymentEvents() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  return useQuery({
    queryKey: ["payment-events", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_events")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
  });
}

export function usePaymentEventStats(events: PaymentEvent[] | undefined) {
  return useMemo(() => {
    const list = events ?? [];
    const weekAgo = Date.now() - 7 * 86400000;
    const monthAgo = Date.now() - 30 * 86400000;
    return {
      open: list.filter((e) => e.status === "open").length,
      critical_open: list.filter((e) => e.status === "open" && e.severity === "critical").length,
      this_week: list.filter((e) => new Date(e.created_at).getTime() >= weekAgo).length,
      resolved_30d: list.filter((e) => e.status === "resolved" && e.resolved_at && new Date(e.resolved_at).getTime() >= monthAgo).length,
    };
  }, [events]);
}

export function useUpdatePaymentEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: "acknowledged" | "resolved"; note?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const patch: any = { status: args.status };
      if (args.status === "acknowledged") {
        patch.acknowledged_by = uid;
        patch.acknowledged_at = new Date().toISOString();
      }
      if (args.status === "resolved") {
        patch.resolved_by = uid;
        patch.resolved_at = new Date().toISOString();
        if (args.note) patch.resolution_note = args.note;
      }
      const { error } = await supabase.from("payment_events").update(patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-events"] }),
  });
}
