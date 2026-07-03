import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Search, Loader2, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { ClientRevenueReport } from "@/components/billing/ClientRevenueReport";
import { PaymentIssuesPanel } from "@/components/billing/PaymentIssuesPanel";
import { AgencyStripeConnectModal } from "@/components/billing/AgencyStripeConnectModal";
import {
  useWorkspaceChargeSummaries,
  type ClientChargeSummary,
} from "@/hooks/useClientStripe";
import { useAgencyStripeStatus, useSyncAgencyStripe } from "@/hooks/useAgencyStripe";
import { useClients } from "@/hooks/useDatabase";

type PaymentStatus = "active" | "failed" | "overdue" | "pending";

interface BillingRow {
  id: number;
  name: string;
  company: string;
  status: PaymentStatus;
  lastCharge: string | null; // ISO
  amount: number;            // major units
  currency: string;
}

const OVERDUE_DAYS = 35;

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysAgo(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// Derive a billing status from the client's most recent mirrored Stripe charge.
// With no charges we can't say anything, so the client is "pending".
function deriveStatus(charge?: ClientChargeSummary): PaymentStatus {
  if (!charge) return "pending";
  if (charge.last_status === "failed") return "failed";
  if (charge.paid && charge.last_status === "succeeded") {
    return daysAgo(charge.last_charge_at) > OVERDUE_DAYS ? "overdue" : "active";
  }
  return "pending";
}

const STATUS_CONFIG: Record<PaymentStatus, { label: string; icon: React.ElementType; classes: string; rowClass: string }> = {
  active: { label: "Active", icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 border border-emerald-200", rowClass: "" },
  failed: { label: "Failed", icon: XCircle, classes: "bg-red-50 text-red-700 border border-red-200", rowClass: "bg-red-50/30" },
  overdue: { label: "Overdue", icon: Clock, classes: "bg-amber-50 text-amber-700 border border-amber-200", rowClass: "bg-amber-50/30" },
  pending: { label: "Pending", icon: Clock, classes: "bg-gray-100 text-gray-600 border border-gray-200", rowClass: "" },
};

const FILTERS: { value: "all" | PaymentStatus; label: string }[] = [
  { value: "all", label: "All clients" },
  { value: "failed", label: "Failed" },
  { value: "overdue", label: "Overdue" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
];


export default function BillingDashboard() {
  const [filter, setFilter] = useState<"all" | PaymentStatus>("all");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [agencyModalOpen, setAgencyModalOpen] = useState(false);

  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: chargeSummaries = {} } = useWorkspaceChargeSummaries();
  const { data: agencyStatus, isLoading: statusLoading } = useAgencyStripeStatus();
  const syncAgency = useSyncAgencyStripe();

  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Note: Auto-prompt disabled — users can open the connect modal manually
  // via the "Connect Stripe" button when they're ready.


  const handleSyncAgency = async () => {
    if (syncAgency.isPending) return;
    const t = toast.loading("Syncing your agency Stripe account…");
    try {
      const res = await syncAgency.mutateAsync(90);
      toast.success(
        `Synced ${res.fetched} charge${res.fetched === 1 ? "" : "s"} · ${res.matched} matched · ${res.unmatched} unmatched`,
        { id: t },
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed", { id: t });
    }
  };

  // Surface legacy OAuth round-trip params (kept for backward compatibility)
  useEffect(() => {
    const stripeParam = searchParams.get("stripe");
    if (!stripeParam) return;
    if (stripeParam === "connected") {
      toast.success("Stripe account connected.");
    } else if (stripeParam === "error") {
      toast.error("Stripe connection failed — please try again.");
    }
    searchParams.delete("stripe");
    searchParams.delete("reason");
    searchParams.delete("client");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, qc]);

  // Build billing rows from real clients + their latest mirrored charge.
  const rows = useMemo<BillingRow[]>(() =>
    clients.map((c) => {
      const charge = chargeSummaries[c.id];
      return {
        id: c.id,
        name: c.name,
        company: c.brand ?? "",
        status: deriveStatus(charge),
        lastCharge: charge?.last_charge_at ?? null,
        amount: charge ? (charge.last_amount ?? 0) / 100 : 0,
        currency: (charge?.last_currency ?? "usd").toUpperCase(),
      };
    }),
  [clients, chargeSummaries]);

  const stats = useMemo(() => ({
    active: rows.filter((c) => c.status === "active").length,
    failed: rows.filter((c) => c.status === "failed").length,
    overdue: rows.filter((c) => c.status === "overdue" || c.status === "pending").length,
    mrr: rows.filter((c) => c.status === "active").reduce((s, c) => s + c.amount, 0),
  }), [rows]);

  const filtered = useMemo(() =>
    rows.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
      const matchFilter = filter === "all" || c.status === filter;
      return matchSearch && matchFilter;
    }),
  [rows, filter, search]);

  const alerts = rows.filter((c) => c.status === "failed" || c.status === "overdue");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Billing dashboard</h2>
            <p className="text-xs text-gray-500">Client payment status · synced with Stripe</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{fmtDate(new Date())}</span>
          <button
            onClick={handleSyncAgency}
            disabled={syncAgency.isPending || !agencyStatus?.connected}
            title={!agencyStatus?.connected ? "Connect your agency Stripe account first" : "Sync last 90 days of charges from your Stripe account"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncAgency.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncAgency.isPending ? "Syncing…" : "Sync Stripe"}
          </button>
        </div>
      </div>

      {/* Agency Stripe connection card */}
      <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${agencyStatus?.connected ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-3 min-w-0">
          {agencyStatus?.connected ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
          )}
          <div className="min-w-0">
            {agencyStatus?.connected ? (
              <>
                <div className="text-sm font-medium text-emerald-900 truncate">
                  Connected to {agencyStatus.account_name ?? agencyStatus.account_email ?? agencyStatus.account_id}
                </div>
                <div className="text-xs text-emerald-700">
                  {agencyStatus.last_sync_at
                    ? `Last synced ${fmtDate(new Date(agencyStatus.last_sync_at))} · ${agencyStatus.last_sync_charges_count ?? 0} charges, ${agencyStatus.last_sync_matched_count ?? 0} matched`
                    : "Not synced yet"}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-amber-900">Stripe not connected</div>
                <div className="text-xs text-amber-700">Connect your agency's Stripe account once to sync billing across all clients.</div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setAgencyModalOpen(true)}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors flex-shrink-0 ${agencyStatus?.connected ? "border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-100" : "border-amber-300 text-amber-800 bg-white hover:bg-amber-100"}`}
        >
          {agencyStatus?.connected ? "Reconnect" : "Connect Stripe"}
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{alerts.length} payment{alerts.length > 1 ? "s" : ""} need attention:</strong>{" "}
            {alerts.map((a) => a.name).join(", ")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active & current", value: stats.active, color: "text-emerald-600" },
          { label: "Overdue / pending", value: stats.overdue, color: "text-amber-600" },
          { label: "Failed payments", value: stats.failed, color: "text-red-500" },
          { label: "Est. MRR", value: `$${stats.mrr.toLocaleString()}`, color: "text-gray-900" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <PaymentIssuesPanel clientNames={Object.fromEntries(rows.map((r) => [r.id, r.name]))} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                filter === f.value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Client", "Status", "Last charge", "Amount", "Notes", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => {
              const cfg = STATUS_CONFIG[client.status];
              const Icon = cfg.icon;
              const ago = client.lastCharge ? daysAgo(client.lastCharge) : null;

              return (
                <tr key={client.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${cfg.rowClass}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{client.name}</div>
                    {client.company && <div className="text-xs text-gray-400">{client.company}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.classes}`}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {client.lastCharge ? (
                      <>
                        <div>{fmtDate(new Date(client.lastCharge))}</div>
                        <div className="text-xs text-gray-400">{ago}d ago</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {client.amount
                      ? `$${client.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={notes[client.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [client.id]: e.target.value }))}
                      placeholder="Add note..."
                      className="text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-gray-300 rounded px-1 w-36"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {(client.status === "failed" || client.status === "overdue") ? (
                      <button className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                        Chase
                      </button>
                    ) : (
                      <button className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                        View
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            {clientsLoading ? "Loading clients…" : "No clients match your filter."}
          </div>
        )}
      </div>

      <ClientRevenueReport clients={rows.map((c) => ({ id: String(c.id), name: c.name, company: c.company }))} />

      <AgencyStripeConnectModal
        open={agencyModalOpen}
        onOpenChange={setAgencyModalOpen}
        dismissible={!!agencyStatus?.connected}
      />
    </div>
  );
}
