import { useMemo, useState } from "react";
import { TrendingUp, DollarSign, Target, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

// ---- Source: mirrors BillingDashboard client list ----
type RevType = "retainer" | "rebill" | "affiliate";
interface RevenueLine {
  client: string;
  type: RevType;
  monthly: number;
  status: "active" | "at_risk" | "pending";
}

const RECURRING: RevenueLine[] = [
  { client: "Dan Nguyen", type: "retainer", monthly: 1500, status: "active" },
  { client: "Chad", type: "retainer", monthly: 1500, status: "active" },
  { client: "Kelto", type: "retainer", monthly: 1500, status: "active" },
  { client: "Jason Gilmore", type: "retainer", monthly: 1500, status: "active" },
  { client: "Joseph Bui", type: "retainer", monthly: 1500, status: "active" },
  { client: "Brandon", type: "retainer", monthly: 1500, status: "active" },
  { client: "Aaron Denton", type: "retainer", monthly: 1500, status: "active" },
  { client: "Shaun Woods", type: "retainer", monthly: 1500, status: "active" },
  { client: "Dean Onwumere", type: "retainer", monthly: 1500, status: "active" },
  { client: "James Brown", type: "retainer", monthly: 1500, status: "at_risk" },
  { client: "Matt Silva", type: "retainer", monthly: 1500, status: "at_risk" },
  { client: "Steve B.", type: "retainer", monthly: 1500, status: "pending" },
  { client: "Eric Dahlberg referral", type: "retainer", monthly: 1500, status: "pending" },
  // Affiliate / commission base
  { client: "Dawn Goodman renewals", type: "affiliate", monthly: 900, status: "active" },
];

const HISTORY = [
  { month: "Nov", actual: 11200, target: 12000 },
  { month: "Dec", actual: 12100, target: 12500 },
  { month: "Jan", actual: 12750, target: 13000 },
  { month: "Feb", actual: 13500, target: 13500 },
  { month: "Mar", actual: 14200, target: 14000 },
  { month: "Apr", actual: 14900, target: 14500 },
  { month: "May", actual: 15400, target: 15000 },
];

const FUTURE_MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

export default function EarningsForecast() {
  const [growth, setGrowth] = useState(4); // % MoM
  const [horizon, setHorizon] = useState(6);

  const baseline = useMemo(() => {
    const active = RECURRING.filter((r) => r.status === "active").reduce((s, r) => s + r.monthly, 0);
    const atRisk = RECURRING.filter((r) => r.status === "at_risk").reduce((s, r) => s + r.monthly, 0);
    const pending = RECURRING.filter((r) => r.status === "pending").reduce((s, r) => s + r.monthly, 0);
    return { active, atRisk, pending, total: active + atRisk + pending };
  }, []);

  const forecast = useMemo(() => {
    const last = HISTORY[HISTORY.length - 1].actual;
    const rows = [...HISTORY.map((h) => ({ month: h.month, actual: h.actual, forecast: null as number | null, low: null as number | null, high: null as number | null, target: h.target }))];
    let val = last;
    for (let i = 0; i < horizon; i++) {
      val = val * (1 + growth / 100);
      const month = FUTURE_MONTHS[i] ?? `M+${i + 1}`;
      rows.push({
        month,
        actual: null as any,
        forecast: Math.round(val),
        low: Math.round(val * 0.88),
        high: Math.round(val * 1.12),
        target: Math.round(val * 1.05),
      });
    }
    return rows;
  }, [growth, horizon]);

  const totals = useMemo(() => {
    const projected = forecast.filter((f) => f.forecast).reduce((s, f) => s + (f.forecast ?? 0), 0);
    const yoyLast = HISTORY[0].actual;
    const yoyNow = HISTORY[HISTORY.length - 1].actual;
    const yoy = ((yoyNow - yoyLast) / yoyLast) * 100;
    const next = forecast.find((f) => f.forecast)?.forecast ?? 0;
    const annualRunRate = next * 12;
    return { projected, yoy, next, annualRunRate };
  }, [forecast]);

  const breakdown = useMemo(() => [
    { name: "Retainers", value: RECURRING.filter((r) => r.type === "retainer" && r.status === "active").reduce((s, r) => s + r.monthly, 0) },
    { name: "Rebill markup", value: 2400 },
    { name: "Affiliate", value: RECURRING.filter((r) => r.type === "affiliate").reduce((s, r) => s + r.monthly, 0) },
    { name: "At-risk (recoverable)", value: baseline.atRisk },
    { name: "Pending (signed soon)", value: baseline.pending },
  ], [baseline]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Earnings forecast</h2>
            <p className="text-xs text-muted-foreground">Projected revenue based on recurring book + growth assumption</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted-foreground">Growth %/mo</label>
          <input
            type="number"
            value={growth}
            onChange={(e) => setGrowth(Number(e.target.value))}
            className="w-16 px-2 py-1 border border-border rounded-md bg-background"
          />
          <label className="text-muted-foreground ml-2">Horizon</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="px-2 py-1 border border-border rounded-md bg-background"
          >
            <option value={3}>3 mo</option>
            <option value={6}>6 mo</option>
            <option value={12}>12 mo</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Current MRR", value: `$${baseline.active.toLocaleString()}`, icon: DollarSign, sub: `${RECURRING.filter(r=>r.status==="active").length} active accounts` },
          { label: "Next-month forecast", value: `$${totals.next.toLocaleString()}`, icon: ArrowUpRight, sub: `+${growth}% MoM assumption`, accent: "text-emerald-600" },
          { label: `${horizon}-mo projected revenue`, value: `$${totals.projected.toLocaleString()}`, icon: Target, sub: "Cumulative" },
          { label: "Annual run rate", value: `$${totals.annualRunRate.toLocaleString()}`, icon: Calendar, sub: `YoY +${totals.yoy.toFixed(1)}%`, accent: totals.yoy >= 0 ? "text-emerald-600" : "text-red-500" },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="border border-border rounded-xl p-4 bg-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <Icon className={`w-3.5 h-3.5 ${k.accent ?? "text-muted-foreground"}`} />
              </div>
              <div className={`text-2xl font-bold ${k.accent ?? "text-foreground"}`}>{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Forecast chart */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Revenue trajectory</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />Actual</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Forecast</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20" />Confidence band</span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecast}>
              <defs>
                <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: any) => value ? `$${Number(value).toLocaleString()}` : "—"}
              />
              <Area type="monotone" dataKey="high" stroke="none" fill="#10b981" fillOpacity={0.12} />
              <Area type="monotone" dataKey="low" stroke="none" fill="hsl(var(--card))" fillOpacity={1} />
              <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#fc)" />
              <Area type="monotone" dataKey="forecast" stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 5" fill="none" />
              <Area type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="2 4" fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown + Scenarios */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Revenue composition (this month)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} width={140} />
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Scenario comparison (next month)</h3>
          <div className="space-y-3">
            {[
              { label: "Worst case — lose at-risk", value: baseline.active - baseline.atRisk + 600, change: -baseline.atRisk + 600, tone: "text-red-500", icon: ArrowDownRight },
              { label: "Base case — flat retention", value: baseline.active * (1 + growth/100), change: baseline.active * (growth/100), tone: "text-foreground", icon: ArrowUpRight },
              { label: "Best case — pending signs", value: (baseline.active + baseline.pending) * (1 + growth/100), change: baseline.pending + baseline.active * (growth/100), tone: "text-emerald-600", icon: ArrowUpRight },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50">
                  <div>
                    <div className="text-sm font-medium text-foreground">{s.label}</div>
                    <div className={`text-xs flex items-center gap-1 mt-0.5 ${s.tone}`}>
                      <Icon className="w-3 h-3" />
                      {s.change >= 0 ? "+" : ""}${Math.round(s.change).toLocaleString()} vs current
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${s.tone}`}>${Math.round(s.value).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pipeline contribution table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Account contribution</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              {["Account", "Type", "Status", "Monthly", "12-mo value"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECURRING.map((r) => (
              <tr key={r.client} className="border-b border-border/60 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-medium text-foreground">{r.client}</td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize">{r.type}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    r.status === "at_risk" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                    "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {r.status === "at_risk" ? "At risk" : r.status === "pending" ? "Pending" : "Active"}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-foreground">${r.monthly.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-muted-foreground">${(r.monthly * 12).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
