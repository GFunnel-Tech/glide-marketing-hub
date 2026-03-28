import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cplTrendData } from "@/data/mockData";

export function PortfolioChart() {
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
      <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
        <p className="text-xs text-destructive font-medium">
          ⚠ Double-counting confirmed on 9 campaigns. Reported: 663 leads at $36.95 · True: 253 leads at $60.92. Fix: remove Lead pixel from post-form redirect pages.
        </p>
      </div>
    </div>
  );
}
