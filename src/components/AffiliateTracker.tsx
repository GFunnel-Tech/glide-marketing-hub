import { useState, useMemo } from "react";
import { Coins, Plus, CheckCircle2, Clock, TrendingUp, AlertTriangle } from "lucide-react";

type CommissionType = "upfront" | "prepay" | "renewal" | "jeff" | "nexa";
type EntryStatus = "paid" | "pending";

interface CommissionEntry {
  id: string;
  client: string;
  type: CommissionType;
  baseAmount: number;
  month: string;
  status: EntryStatus;
}

interface RenewalEntry {
  client: string;
  date: string;
  amount: number;
  status: string;
}

const INITIAL_ENTRIES: CommissionEntry[] = [
  { id: "1", client: "Dan Nguyen", type: "renewal", baseAmount: 1500, month: "Apr 2026", status: "paid" },
  { id: "2", client: "Jason Gilmore", type: "renewal", baseAmount: 1500, month: "May 2026", status: "paid" },
  { id: "3", client: "Jeff's deal — Brandon", type: "jeff", baseAmount: 1500, month: "Apr 2026", status: "paid" },
  { id: "4", client: "Jeff's deal — Aaron Denton", type: "jeff", baseAmount: 1500, month: "Mar 2026", status: "paid" },
  { id: "5", client: "Chad", type: "renewal", baseAmount: 1500, month: "May 2026", status: "pending" },
  { id: "6", client: "Kelto", type: "renewal", baseAmount: 1500, month: "May 2026", status: "pending" },
  { id: "7", client: "Joseph Bui", type: "renewal", baseAmount: 1500, month: "May 2026", status: "pending" },
  { id: "8", client: "Steve B. (prospect)", type: "upfront", baseAmount: 750, month: "May 2026", status: "pending" },
];

const RENEWALS: RenewalEntry[] = [
  { client: "Dan Nguyen", date: "2026-05-01", amount: 150, status: "Overdue — chase Tim" },
  { client: "Jason Gilmore", date: "2026-06-01", amount: 150, status: "Upcoming" },
  { client: "Chad", date: "2026-06-01", amount: 150, status: "Upcoming" },
  { client: "Kelto", date: "2026-06-01", amount: 150, status: "Upcoming" },
  { client: "Joseph Bui", date: "2026-06-01", amount: 150, status: "Upcoming" },
  { client: "Brandon", date: "2026-06-27", amount: 150, status: "Upcoming" },
];

const TYPE_OPTIONS: { value: CommissionType; label: string }[] = [
  { value: "upfront", label: "New sale — upfront ($750)" },
  { value: "prepay", label: "New sale — prepay ($1,250)" },
  { value: "renewal", label: "Renewal — 10% of base" },
  { value: "jeff", label: "Jeff's deal — 10%" },
  { value: "nexa", label: "Nexa referral — $100/mo" },
];

const TYPE_LABELS: Record<CommissionType, string> = {
  upfront: "New sale",
  prepay: "Prepay sale",
  renewal: "Renewal",
  jeff: "Jeff's deal",
  nexa: "Nexa ref.",
};

function calcCommission(type: CommissionType, base: number): number {
  if (type === "upfront") return 750;
  if (type === "prepay") return 1250;
  if (type === "nexa") return 100;
  return Math.round(base * 0.1);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AffiliateTracker() {
  const [entries, setEntries] = useState<CommissionEntry[]>(INITIAL_ENTRIES);
  const [newClient, setNewClient] = useState("");
  const [newType, setNewType] = useState<CommissionType>("upfront");
  const [newBase, setNewBase] = useState("");
  const [payoutRequested, setPayoutRequested] = useState(false);

  const stats = useMemo(() => {
    const paid = entries.filter((e) => e.status === "paid").reduce((s, e) => s + calcCommission(e.type, e.baseAmount), 0);
    const pending = entries.filter((e) => e.status === "pending").reduce((s, e) => s + calcCommission(e.type, e.baseAmount), 0);
    const upcoming = RENEWALS.reduce((s, r) => s + r.amount, 0);
    return { paid, pending, upcoming };
  }, [entries]);

  const addEntry = () => {
    if (!newClient.trim()) return;
    const base = parseFloat(newBase) || 1500;
    const now = new Date();
    setEntries((prev) => [
      {
        id: Date.now().toString(),
        client: newClient.trim(),
        type: newType,
        baseAmount: base,
        month: now.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        status: "pending",
      },
      ...prev,
    ]);
    setNewClient("");
    setNewBase("");
    setNewType("upfront");
  };

  const toggleStatus = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => e.id === id ? { ...e, status: e.status === "paid" ? "pending" : "paid" } : e)
    );
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <Coins className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Affiliate tracker — Dawn Goodman</h2>
          <p className="text-xs text-gray-500">10% commission · all EMM clients + Jeff's deals</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700">${stats.paid.toLocaleString()}</div>
          <div className="text-xs text-emerald-600 mt-0.5">Collected</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-700">${stats.pending.toLocaleString()}</div>
          <div className="text-xs text-amber-600 mt-0.5">Pending</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">${stats.upcoming.toLocaleString()}</div>
          <div className="text-xs text-blue-600 mt-0.5">Est. next 30 days</div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div>
          <div className="text-sm font-medium text-emerald-800">Ready to request payout</div>
          <div className="text-xs text-emerald-600 mt-0.5">Confirmed paid commissions via Stripe</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-emerald-700">${stats.paid.toLocaleString()}</span>
          <button
            onClick={() => setPayoutRequested(true)}
            className="px-3 py-1.5 border border-emerald-400 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-100 transition-colors"
          >
            {payoutRequested ? "✓ Requested" : "Request payout"}
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Log a new commission</p>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            placeholder="Client name"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CommissionType)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              value={newBase}
              onChange={(e) => setNewBase(e.target.value)}
              placeholder="Base amount"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={addEntry}
              disabled={!newClient.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Commission log</p>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Client", "Type", "Base", "Commission", "Status", "Month"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const comm = calcCommission(e.type, e.baseAmount);
                return (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{e.client}</td>
                    <td className="px-3 py-2.5 text-gray-500">{TYPE_LABELS[e.type]}</td>
                    <td className="px-3 py-2.5 text-gray-600">${e.baseAmount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">${comm.toLocaleString()}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleStatus(e.id)} className="group">
                        {e.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 group-hover:bg-amber-100 transition-colors">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{e.month}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Upcoming renewals — 30 day window</p>
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Client", "Renewal date", "Est. commission", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RENEWALS.map((r, i) => {
                const isOverdue = r.status.toLowerCase().includes("overdue") || r.status.toLowerCase().includes("chase");
                return (
                  <tr key={i} className={`border-b border-gray-100 transition-colors ${isOverdue ? "bg-amber-50/40" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{r.client}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">${r.amount}</td>
                    <td className="px-3 py-2.5">
                      {isOverdue ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3" /> {r.status}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{r.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
