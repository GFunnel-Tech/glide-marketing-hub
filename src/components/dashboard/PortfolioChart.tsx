import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { usePortfolioTrend } from "@/hooks/usePortfolioTrend";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";

export function PortfolioChart() {
  const { data: trend = [], isFetching } = usePortfolioTrend();
  const { data: rangeMetrics = {} } = useClientsRangeMetrics();
  const { label } = useDateRange();

  const dc = useMemo(() => {
    const flagged = Object.values(rangeMetrics).filter((m) => m.doubleCount);
    if (flagged.length === 0) return null;
    const reportedLeads = flagged.reduce((s, c) => s + c.reportedLeads, 0);
    const trueLeads = flagged.reduce((s, c) => s + c.trueLeads, 0);
    const spend = flagged.reduce((s, c) => s + c.spend, 0);
    return {
      count: flagged.length,
      reportedLeads,
      trueLeads,
      reportedCpl: reportedLeads > 0 ? spend / reportedLeads : 0,
      trueCpl: trueLeads > 0 ? spend / trueLeads : 0,
    };
  }, [rangeMetrics]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Portfolio CPL Trend</h3>
        <span className="text-xs text-muted-foreground">{label}{isFetching && " · updating…"}</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => [`$${Number(value).toFixed(2)}`, name === "reported" ? "Reported CPL" : "True CPL"]}
            />
            <Area type="monotone" dataKey="reported" stroke="hsl(var(--primary))" strokeDasharray="5 5" fill="hsl(var(--primary))" fillOpacity={0.15} />
            <Area type="monotone" dataKey="true" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {dc ? (
        <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-xs text-destructive font-medium">
            ⚠ Double-counting on {dc.count} client{dc.count === 1 ? "" : "s"}. Reported: {dc.reportedLeads} leads at ${dc.reportedCpl.toFixed(2)} · True: {dc.trueLeads} leads at ${dc.trueCpl.toFixed(2)}.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-success/10 border border-success/20 p-3">
          <p className="text-xs text-success font-medium">✓ No double-counting detected in this range.</p>
        </div>
      )}
    </div>
  );
}
