import { useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { usePaymentEvents, usePaymentEventStats, useUpdatePaymentEvent, type PaymentEvent } from "@/hooks/usePaymentEvents";

const TYPE_LABEL: Record<string, string> = {
  charge_failed: "Charge failed",
  invoice_payment_failed: "Invoice failed",
  charge_disputed: "Disputed",
  charge_refunded: "Refunded",
  ad_account_disabled: "Ad account disabled",
  ad_account_unsettled: "Unpaid ad balance",
  ad_account_risk_review: "Risk review",
  ad_account_pending_settlement: "Pending settlement",
  ad_account_grace_period: "Payment overdue",
};

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() })
      .format((amount || 0) / 100);
  } catch {
    return `$${((amount || 0) / 100).toFixed(2)}`;
  }
}

export function PaymentIssuesPanel({ clientNames }: { clientNames: Record<number, string> }) {
  const { data: events, isLoading } = usePaymentEvents();
  const stats = usePaymentEventStats(events);
  const update = useUpdatePaymentEvent();
  const [filter, setFilter] = useState<"open" | "all">("open");

  const list = (events ?? []).filter((e) => (filter === "open" ? e.status !== "resolved" : true)).slice(0, 50);

  const act = async (id: string, status: "acknowledged" | "resolved") => {
    try {
      await update.mutateAsync({ id, status });
      toast.success(status === "resolved" ? "Marked resolved" : "Acknowledged");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Payment issues</h3>
            <p className="text-xs text-gray-500">Failed charges, disputes & refunds from connected Stripe accounts</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {f === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 py-3 bg-gray-50/60">
        <Stat label="Open" value={stats.open} tone="text-red-600" />
        <Stat label="Critical" value={stats.critical_open} tone="text-red-500" />
        <Stat label="Last 7 days" value={stats.this_week} tone="text-amber-600" />
        <Stat label="Resolved (30d)" value={stats.resolved_30d} tone="text-emerald-600" />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" /> Loading payment events…
        </div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" /> No {filter === "open" ? "open " : ""}payment issues. Nice.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-t border-gray-100">
              {["Client", "Type", "Amount", "Reason", "When", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const mappedName = e.client_id ? clientNames[e.client_id] : null;
              const clientName =
                mappedName ??
                e.description ??
                (e.client_id ? `Client #${e.client_id}` : e.customer_email ?? "Agency account");
              const unmapped = !e.client_id;
              const actId = /^act_\d+$/.test(e.stripe_charge_id ?? "") ? e.stripe_charge_id! : null;
              const isOpen = e.status === "open";
              return (
                <tr key={e.id} className={`border-t border-gray-100 ${e.severity === "critical" && isOpen ? "bg-red-50/40" : ""}`}>
                  <td className="px-3 py-2.5">
                    {e.client_id ? (
                      <Link to={`/client/${e.client_id}`} className="font-medium text-gray-900 hover:text-indigo-700">
                        {clientName}
                      </Link>
                    ) : <span className="font-medium text-gray-900">{clientName}</span>}
                    {actId && (
                      <div className="mt-0.5 flex items-center gap-2">
                        <a
                          href={`https://adsmanager.facebook.com/ads/manage/billing_settings?act=${actId.replace(/^act_/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                          title={`Open billing settings for ${actId} in Meta Ads Manager`}
                        >
                          <ExternalLink className="w-3 h-3" /> {actId}
                        </a>
                        <a
                          href={metaAdsManagerUrl({ adAccountId: actId }) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                        >
                          campaigns
                        </a>
                      </div>
                    )}
                    {unmapped && (
                      <div className="text-xs text-amber-600">Ad account not mapped to a client</div>
                    )}
                    {e.customer_email && <div className="text-xs text-gray-400">{e.customer_email}</div>}
                  </td>


                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
                      e.severity === "critical" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      <AlertTriangle className="w-3 h-3" /> {TYPE_LABEL[e.event_type]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{money(e.amount, e.currency)}</td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-xs truncate" title={e.failure_message ?? ""}>
                    {e.failure_message ?? e.failure_code ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{timeAgo(e.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                      e.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : e.status === "acknowledged" ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-100 text-gray-700 border-gray-200"
                    }`}>{e.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      {e.status === "open" && (
                        <button
                          onClick={() => act(e.id, "acknowledged")}
                          disabled={update.isPending}
                          className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                          <Eye className="w-3 h-3 inline mr-1" />Ack
                        </button>
                      )}
                      {e.status !== "resolved" && (
                        <button
                          onClick={() => act(e.id, "resolved")}
                          disabled={update.isPending}
                          className="text-xs px-2 py-1 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
