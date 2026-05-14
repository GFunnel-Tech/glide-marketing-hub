import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cplTrendData } from "@/data/mockData";
import { useCampaigns } from "@/hooks/useDatabase";

export function PortfolioChart() {
  const { data: campaigns = [] } = useCampaigns();

  const dc = useMemo(() => {
    const flagged = campaigns.filter((c) => c.doubleCount);
    if (flagged.length === 0) return null;
    const reportedLeads = flagged.reduce((s, c) => s + (c.leads || 0), 0);
    const trueLeads = flagged.reduce((s, c) => s + (c.trueLeads || 0), 0);
    const spend = flagged.reduce((s, c) => s + (c.spend || 0), 0);
    const reportedCpl = reportedLeads > 0 ? spend / reportedLeads : 0;
    const trueCpl = trueLeads > 0 ? spend / trueLeads : 0;
    return { count: flagged.length, reportedLeads, trueLeads, reportedCpl, trueCpl };
  }, [campaigns]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Portfolio CPL Trend (30 Days)</h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cplTrendData}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "reported" ? "Reported CPL" : "True CPL"]}
            />
            <Area type="monotone" dataKey="reported" stroke="hsl(var(--primary))" strokeDasharray="5 5" fill="hsl(var(--primary))" fillOpacity={0.15} />
            <Area type="monotone" dataKey="true" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {dc ? (
        <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-xs text-destructive font-medium">
            ⚠ Double-counting confirmed on {dc.count} campaign{dc.count === 1 ? "" : "s"}. Reported: {dc.reportedLeads} leads at ${dc.reportedCpl.toFixed(2)} · True: {dc.trueLeads} leads at ${dc.trueCpl.toFixed(2)}. Fix: remove Lead pixel from post-form redirect pages.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-success/10 border border-success/20 p-3">
          <p className="text-xs text-success font-medium">
            ✓ No double-counting detected across active campaigns.
          </p>
        </div>
      )}
    </div>
  );
}
