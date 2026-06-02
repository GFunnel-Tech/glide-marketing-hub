import { useMemo, useState, useEffect } from "react";
import { TrendingUp, DollarSign, RefreshCw, Banknote, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import {
  useClientStripeConnections,
  useClientStripeCharges,
  useClientStripePayouts,
} from "@/hooks/useClientStripe";

interface Props {
  clients: { id: string; name: string; company?: string }[];
}

function fmtMoney(minor: number, currency: string) {
  const amount = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function fmtDate(unix: number) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PAYOUT_STATUS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_transit: "bg-indigo-50 text-indigo-700 border-indigo-200",
  canceled: "bg-gray-100 text-gray-600 border-gray-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export function ClientRevenueReport({ clients }: Props) {
  const { data: connections = {}, isLoading: connLoading } = useClientStripeConnections();

  const connectedClients = useMemo(
    () => clients.filter((c) => connections[Number(c.id)]?.is_connected),
    [clients, connections],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (!selectedId && connectedClients.length) setSelectedId(Number(connectedClients[0].id));
  }, [connectedClients, selectedId]);

  const charges = useClientStripeCharges(selectedId);
  const payouts = useClientStripePayouts(selectedId);

  const totals = useMemo(() => {
    const list = charges.data?.charges ?? [];
    let gross = 0, refunded = 0, successful = 0, failed = 0;
    const currency = list[0]?.currency || "usd";
    for (const c of list) {
      if (c.paid && c.status === "succeeded") {
        gross += c.amount;
        successful++;
      }
      refunded += c.amount_refunded || 0;
      if (c.status === "failed") failed++;
    }
    const paidOut = (payouts.data?.payouts ?? [])
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.amount, 0);
    const pending = (payouts.data?.payouts ?? [])
      .filter((p) => p.status === "pending" || p.status === "in_transit")
      .reduce((s, p) => s + p.amount, 0);
    return { gross, refunded, net: gross - refunded, successful, failed, paidOut, pending, currency };
  }, [charges.data, payouts.data]);

  const selectedConn = selectedId ? connections[selectedId] : null;
  const livemode = selectedConn?.livemode ?? false;
  const loading = charges.isLoading || payouts.isLoading;

  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Client revenue report</h3>
            <p className="text-xs text-gray-500">
              Charges & payouts pulled live from connected Stripe accounts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedConn && (
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                livemode ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {livemode ? "live" : "test"}
            </span>
          )}
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value) || null)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={!connectedClients.length}
          >
            {!connectedClients.length && <option value="">No connected clients</option>}
            {connectedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` — ${c.company}` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              charges.refetch();
              payouts.refetch();
            }}
            disabled={!selectedId || loading}
            className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {connLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading connections…
        </div>
      ) : !connectedClients.length ? (
        <div className="py-12 text-center text-sm text-gray-500">
          <AlertCircle className="w-5 h-5 mx-auto mb-2 text-gray-400" />
          No clients have connected their Stripe account yet.
          <div className="text-xs text-gray-400 mt-1">
            Connect a client's Stripe in the table above to see their revenue here.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
            {[
              { label: "Gross revenue", value: fmtMoney(totals.gross, totals.currency), icon: DollarSign, tint: "bg-emerald-50 text-emerald-600" },
              { label: "Net (after refunds)", value: fmtMoney(totals.net, totals.currency), icon: TrendingUp, tint: "bg-indigo-50 text-indigo-600" },
              { label: "Refunded", value: fmtMoney(totals.refunded, totals.currency), icon: RefreshCw, tint: "bg-amber-50 text-amber-600" },
              { label: "Paid out", value: fmtMoney(totals.paidOut, totals.currency), icon: Banknote, tint: "bg-blue-50 text-blue-600" },
              { label: "In transit", value: fmtMoney(totals.pending, totals.currency), icon: Banknote, tint: "bg-gray-100 text-gray-600" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.tint} mb-1.5`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-base font-bold text-gray-900">{s.value}</div>
                  <div className="text-[11px] text-gray-500">{s.label}</div>
                </div>
              );
            })}
          </div>

          {(charges.error || payouts.error) && (
            <div className="mx-4 mb-3 px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {(charges.error as Error)?.message || (payouts.error as Error)?.message}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 pt-0">
            <Section title={`Recent charges (${charges.data?.charges?.length ?? 0})`}>
              {loading ? (
                <Skeleton />
              ) : !charges.data?.charges?.length ? (
                <Empty label="No charges yet" />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium py-1.5">Customer</th>
                      <th className="text-left font-medium py-1.5">Amount</th>
                      <th className="text-left font-medium py-1.5">Status</th>
                      <th className="text-left font-medium py-1.5">Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {charges.data.charges.slice(0, 10).map((c) => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 text-gray-700 truncate max-w-[160px]">
                          {c.customer_email || c.description || "—"}
                        </td>
                        <td className="py-1.5 font-medium text-gray-900">{fmtMoney(c.amount, c.currency)}</td>
                        <td className="py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${
                              c.status === "succeeded"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : c.status === "failed"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {c.refunded ? "refunded" : c.status}
                          </span>
                        </td>
                        <td className="py-1.5 text-gray-500">{fmtDate(c.created)}</td>
                        <td className="py-1.5 text-right">
                          {c.receipt_url && (
                            <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-indigo-600">
                              <ExternalLink className="w-3 h-3 inline" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={`Recent payouts (${payouts.data?.payouts?.length ?? 0})`}>
              {loading ? (
                <Skeleton />
              ) : !payouts.data?.payouts?.length ? (
                <Empty label="No payouts yet" />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium py-1.5">Amount</th>
                      <th className="text-left font-medium py-1.5">Status</th>
                      <th className="text-left font-medium py-1.5">Method</th>
                      <th className="text-left font-medium py-1.5">Arrival</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.data.payouts.slice(0, 10).map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 font-medium text-gray-900">{fmtMoney(p.amount, p.currency)}</td>
                        <td className="py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${
                              PAYOUT_STATUS[p.status] || "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-1.5 text-gray-500 capitalize">{p.method || "—"}</td>
                        <td className="py-1.5 text-gray-500">{fmtDate(p.arrival_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-6 bg-gray-50 rounded animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="py-6 text-center text-xs text-gray-400">{label}</div>;
}
