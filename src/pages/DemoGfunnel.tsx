import { TrendingUp, TrendingDown, Sparkles, Users, Megaphone, FileBarChart, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clients,
  portfolioKPIs,
  campaignData,
  cplTrendData,
  activityLog,
  monthlyReports,
} from "@/data/mockData";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const STATUS_STYLE: Record<string, string> = {
  GREEN: "bg-success/15 text-success border-success/30",
  YELLOW: "bg-warning/15 text-warning border-warning/30",
  RED: "bg-destructive/15 text-destructive border-destructive/30",
  BLOCKED: "bg-muted text-muted-foreground border-border",
};

function KPITile({
  label,
  value,
  delta,
  highlight,
}: {
  label: string;
  value: string;
  delta?: number;
  highlight?: boolean;
}) {
  const isPos = delta !== undefined && delta > 0;
  const isNeg = delta !== undefined && delta < 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40",
        highlight && "bg-success/10 border-success/30"
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      {delta !== undefined && (
        <div className="flex items-center gap-1">
          {isPos ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : isNeg ? (
            <TrendingDown className="h-3 w-3 text-destructive" />
          ) : null}
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              isPos && "text-success",
              isNeg && "text-destructive"
            )}
          >
            {isPos ? "+" : ""}
            {delta}% vs last 30 days
          </span>
        </div>
      )}
    </div>
  );
}

export default function DemoGfunnel() {
  const totalLeads = clients.reduce((s, c) => s + c.leads, 0);
  const totalSpend = clients.reduce((s, c) => s + c.spend, 0);
  const blendedCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex h-14 items-center justify-between px-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-foreground">GFunnel</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Agency Demo
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              DEMO MODE • Prefilled Data
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-1 px-6 overflow-x-auto">
          {[
            { icon: Users, label: "Dashboard" },
            { icon: Megaphone, label: "Campaigns" },
            { icon: Sparkles, label: "Creatives" },
            { icon: FileBarChart, label: "Reports" },
            { icon: Bot, label: "AI Assistant" },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap",
                  i === 0
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </span>
            );
          })}
        </nav>
      </header>

      <main className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPITile label="Total Active Clients" value={String(clients.length)} />
          <KPITile
            label="Total Leads (MTD)"
            value={totalLeads.toLocaleString()}
            delta={portfolioKPIs.totalLeadsThisMonth.delta}
          />
          <KPITile
            label="Blended CPL"
            value={`$${blendedCpl.toFixed(2)}`}
            delta={portfolioKPIs.blendedCPL.delta}
          />
          <KPITile
            label="Total Ad Spend (MTD)"
            value={`$${totalSpend.toLocaleString()}`}
            delta={portfolioKPIs.totalAdSpend.delta}
          />
          <KPITile
            label="Closed Deals (MTD)"
            value={String(portfolioKPIs.closedDeals.value)}
            delta={portfolioKPIs.closedDeals.delta}
            highlight
          />
        </div>

        {/* Chart */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Portfolio CPL Trend</h2>
              <p className="text-xs text-muted-foreground">Reported vs True CPL — last 25 days</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cplTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="reported"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Reported CPL"
                />
                <Line
                  type="monotone"
                  dataKey="true"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  name="True CPL"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Clients Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Client Portfolio</h2>
            <p className="text-xs text-muted-foreground">{clients.length} active clients</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Client</th>
                  <th className="px-4 py-3 text-left font-medium">Brand</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Leads</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">CPL</th>
                  <th className="px-4 py-3 text-right font-medium">True CPL</th>
                  <th className="px-4 py-3 text-right font-medium">Form CVR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.brand}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          STATUS_STYLE[c.status]
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.leads}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${c.spend.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${c.cpl.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        c.doubleCount ? "text-destructive font-semibold" : "text-muted-foreground"
                      )}
                    >
                      ${c.trueCpl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {c.formCvr.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Two-col: Top Campaigns + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Top Campaigns</h2>
            <ul className="divide-y divide-border">
              {campaignData.slice(0, 6).map((cp) => (
                <li key={cp.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="truncate text-sm font-medium text-foreground">{cp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cp.leads} leads • ${cp.spend.toLocaleString()} spend
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary tabular-nums">
                    ${cp.cpl.toFixed(2)} CPL
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Activity</h2>
            <ul className="space-y-4">
              {activityLog.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{a.action}</p>
                    <p className="text-xs text-muted-foreground">{a.result}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.author} • {a.timestamp}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Reports */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Monthly Reports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Client</th>
                  <th className="px-4 py-3 text-left font-medium">Month</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">Leads</th>
                  <th className="px-4 py-3 text-right font-medium">CPL</th>
                  <th className="px-4 py-3 text-right font-medium">Pipeline Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthlyReports.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.clientName}</div>
                      <div className="text-xs text-muted-foreground">{r.brand}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.month}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                          r.status === "delivered" && "bg-success/15 text-success border-success/30",
                          r.status === "ready" && "bg-primary/15 text-primary border-primary/30",
                          r.status === "draft" && "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${r.metrics.spend.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {r.metrics.leads}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${r.metrics.cpl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${r.metrics.pipelineValue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-6">
          GFunnel Agency Dashboard — Demo with prefilled data. No live integrations.
        </footer>
      </main>
    </div>
  );
}
