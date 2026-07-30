import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePaymentEvents } from "@/hooks/usePaymentEvents";

const LABEL: Record<string, string> = {
  charge_failed: "payment failed",
  invoice_payment_failed: "invoice failed",
  charge_disputed: "charge disputed",
  ad_account_disabled: "ad account disabled",
  ad_account_unsettled: "unpaid ad balance",
  ad_account_risk_review: "ad account in risk review",
  ad_account_pending_settlement: "ad account pending settlement",
  ad_account_grace_period: "ad account payment overdue",
};

/**
 * Top-priority billing banner. Payment problems (agency Stripe failures and
 * Meta ad-account billing holds) outrank every other dashboard signal, so this
 * sits above the KPI strip and can't be dismissed until the issue is resolved.
 */
export function PaymentAlertBanner() {
  const { data: events } = usePaymentEvents();
  const { currentWorkspace } = useWorkspace();

  const { data: clients } = useQuery({
    queryKey: ["payment-alert-client-names", currentWorkspace?.id],
    enabled: !!currentWorkspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name")
        .eq("workspace_id", currentWorkspace!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of clients ?? []) m[c.id] = c.name;
    return m;
  }, [clients]);

  const open = useMemo(
    () => (events ?? []).filter((e) => e.status !== "resolved" && e.severity === "critical"),
    [events],
  );

  if (open.length === 0) return null;

  const preview = open.slice(0, 3);

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
          <AlertOctagon className="h-4 w-4 text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-destructive">
            {open.length} payment issue{open.length === 1 ? "" : "s"} need attention
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {preview
              .map((e) => {
                const who = e.client_id ? nameById[e.client_id] ?? `Client #${e.client_id}` : e.description ?? "Agency account";
                return `${who} — ${LABEL[e.event_type] ?? e.event_type}`;
              })
              .join(" · ")}
            {open.length > preview.length ? ` · +${open.length - preview.length} more` : ""}
          </p>
        </div>
        <Link
          to="/billing"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
        >
          Review <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
