import { useState, useMemo } from "react";
import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Search, Link2, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StripeConnectDialog } from "@/components/billing/StripeConnectDialog";
import { useClientStripeConnections, useDisconnectClientStripe } from "@/hooks/useClientStripe";

type PaymentStatus = "active" | "failed" | "overdue" | "pending";

interface Client {
  id: string;
  name: string;
  company: string;
  status: PaymentStatus;
  lastCharge: string | null;
  amount: number;
  note: string;
}

const CLIENTS: Client[] = [
  { id: "1", name: "Dan Nguyen", company: "", status: "active", lastCharge: "2026-04-01", amount: 1500, note: "4-mo prepay; setter included" },
  { id: "2", name: "Chad", company: "", status: "active", lastCharge: "2026-05-01", amount: 1500, note: "CAD billing" },
  { id: "3", name: "Kelto", company: "", status: "active", lastCharge: "2026-05-01", amount: 1500, note: "CAD billing" },
  { id: "4", name: "Jason Gilmore", company: "James Paxton Mortgages", status: "active", lastCharge: "2026-05-01", amount: 1500, note: "Uphex-only" },
  { id: "5", name: "Joseph Bui", company: "", status: "active", lastCharge: "2026-05-01", amount: 1500, note: "" },
  { id: "6", name: "Brandon", company: "", status: "active", lastCharge: "2026-04-27", amount: 1500, note: "Post Feb-27 cohort" },
  { id: "7", name: "Aaron Denton", company: "", status: "active", lastCharge: "2026-04-15", amount: 1500, note: "" },
  { id: "8", name: "Paul Healey", company: "Spectrum One Mortgage", status: "active", lastCharge: "2026-04-01", amount: 0, note: "Pro bono — on hold" },
  { id: "9", name: "Shaun Woods", company: "Opus Grenero", status: "active", lastCharge: "2026-05-01", amount: 1500, note: "" },
  { id: "10", name: "Dean Onwumere", company: "Part 2 Lending", status: "active", lastCharge: "2026-03-15", amount: 1500, note: "Launching" },
  { id: "11", name: "James Brown", company: "", status: "overdue", lastCharge: "2026-03-01", amount: 1500, note: "Chase Tim — 73 days overdue" },
  { id: "12", name: "Matt Silva", company: "", status: "failed", lastCharge: "2026-03-01", amount: 1500, note: "Card declined Apr 16" },
  { id: "13", name: "Matt Tixier", company: "True Mortgage", status: "failed", lastCharge: "2026-02-01", amount: 1500, note: "Policy issues — paused" },
  { id: "14", name: "Steve B.", company: "", status: "pending", lastCharge: null, amount: 1500, note: "Prospect — not yet signed" },
  { id: "15", name: "Eric Dahlberg referral", company: "", status: "pending", lastCharge: null, amount: 1500, note: "New lead from Dawn" },
];

const TODAY = new Date("2026-05-13");

function daysAgo(dateStr: string): number {
  return Math.round((TODAY.getTime() - new Date(dateStr).getTime()) / 86400000);
}

function addDays(dateStr: string, n: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [stripeAccounts, setStripeAccounts] = useState<Record<string, { id: string; mode: "test" | "live" } | null>>({
    "1": { id: "acct_1Nv••••8Qz", mode: "test" },
    "4": { id: "acct_1Mp••••2Lx", mode: "test" },
    "9": { id: "acct_1Kr••••9Wb", mode: "test" },
  });
  const [pendingStripe, setPendingStripe] = useState<Record<string, boolean>>({});

  const handleConnectStripe = (client: Client) => {
    setPendingStripe((p) => ({ ...p, [client.id]: true }));
    // TODO: redirect to /functions/v1/stripe-connect-start?client_id=...
    setTimeout(() => {
      setStripeAccounts((s) => ({
        ...s,
        [client.id]: { id: `acct_${Math.random().toString(36).slice(2, 10)}`, mode: "test" },
      }));
      setPendingStripe((p) => ({ ...p, [client.id]: false }));
      toast.success(`Connected ${client.name}'s Stripe account (test mode)`);
    }, 900);
  };

  const handleDisconnectStripe = (client: Client) => {
    if (!confirm(`Disconnect ${client.name}'s Stripe account? They'll need to reconnect to view charges or rebill.`)) return;
    setPendingStripe((p) => ({ ...p, [client.id]: true }));
    setTimeout(() => {
      setStripeAccounts((s) => ({ ...s, [client.id]: null }));
      setPendingStripe((p) => ({ ...p, [client.id]: false }));
      toast.success(`Disconnected ${client.name}'s Stripe account`);
    }, 600);
  };

  const stats = useMemo(() => ({
    active: CLIENTS.filter((c) => c.status === "active").length,
    failed: CLIENTS.filter((c) => c.status === "failed").length,
    overdue: CLIENTS.filter((c) => c.status === "overdue").length,
    mrr: CLIENTS.filter((c) => c.status === "active").reduce((s, c) => s + c.amount, 0),
  }), []);

  const filtered = useMemo(() =>
    CLIENTS.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "all" || c.status === filter;
      return matchSearch && matchFilter;
    }),
  [filter, search]);

  const alerts = CLIENTS.filter((c) => c.status === "failed" || c.status === "overdue");

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
        <span className="text-xs text-gray-400">May 13, 2026</span>
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
              {["Client", "Status", "Stripe", "Last charge", "Next due", "Amount", "Notes", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => {
              const cfg = STATUS_CONFIG[client.status];
              const Icon = cfg.icon;
              const ago = client.lastCharge ? daysAgo(client.lastCharge) : null;
              const nextDue = client.lastCharge ? addDays(client.lastCharge, 30) : null;
              const daysUntil = nextDue ? Math.round((nextDue.getTime() - TODAY.getTime()) / 86400000) : null;

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
                  <td className="px-3 py-2.5">
                    {(() => {
                      const acct = stripeAccounts[client.id];
                      const busy = pendingStripe[client.id];
                      if (busy) {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Working…
                          </span>
                        );
                      }
                      if (acct) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Link2 className="w-3 h-3" /> Connected
                              <span className="ml-1 px-1 rounded bg-indigo-100 text-[10px] uppercase tracking-wide">{acct.mode}</span>
                            </span>
                            <button
                              onClick={() => handleDisconnectStripe(client)}
                              title={`Disconnect ${acct.id}`}
                              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Link2Off className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => handleConnectStripe(client)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          <Link2 className="w-3 h-3" /> Connect Stripe
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {client.lastCharge ? (
                      <>
                        <div>{fmtDate(new Date(client.lastCharge))}</div>
                        <div className="text-xs text-gray-400">{ago}d ago</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {nextDue ? (
                      <span className={daysUntil !== null && daysUntil < 0 ? "text-red-600 font-medium" : "text-gray-600"}>
                        {fmtDate(nextDue)}
                        {daysUntil !== null && daysUntil < 0 && (
                          <div className="text-xs">{Math.abs(daysUntil)}d overdue</div>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {client.amount ? `$${client.amount.toLocaleString()}` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={notes[client.id] ?? client.note}
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
          <div className="py-10 text-center text-sm text-gray-400">No clients match your filter.</div>
        )}
      </div>
    </div>
  );
}
