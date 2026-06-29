import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePortfolioTrend } from "@/hooks/usePortfolioTrend";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function humanize(s: string): string {
  return s
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type MetricKey =
  | "cpl_compare"
  | "spend"
  | "reportedLeads"
  | "trueLeads"
  | "cpl"
  | "trueCpl"
  | "cpm"
  | "ctr"
  | "frequency"
  | "impressions"
  | "clicks";

const METRICS: { key: MetricKey; label: string; format: (v: number) => string; isCurrency?: boolean; isPercent?: boolean }[] = [
  { key: "cpl_compare", label: "CPL · Reported vs True", format: (v) => `$${v.toFixed(2)}`, isCurrency: true },
  { key: "spend", label: "Spend", format: (v) => `$${Math.round(v).toLocaleString()}`, isCurrency: true },
  { key: "reportedLeads", label: "Reported Leads", format: (v) => v.toLocaleString() },
  { key: "trueLeads", label: "True Leads (deduped)", format: (v) => v.toLocaleString() },
  { key: "cpl", label: "Reported CPL", format: (v) => `$${v.toFixed(2)}`, isCurrency: true },
  { key: "trueCpl", label: "True CPL", format: (v) => `$${v.toFixed(2)}`, isCurrency: true },
  { key: "cpm", label: "CPM", format: (v) => `$${v.toFixed(2)}`, isCurrency: true },
  { key: "ctr", label: "CTR", format: (v) => `${v.toFixed(2)}%`, isPercent: true },
  { key: "frequency", label: "Frequency", format: (v) => v.toFixed(2) },
  { key: "impressions", label: "Impressions", format: (v) => v.toLocaleString() },
  { key: "clicks", label: "Clicks", format: (v) => v.toLocaleString() },
];

const COUNTRIES = [
  { value: "all", label: "All regions" },
  { value: "US", label: "United States" },
  { value: "Canada", label: "Canada" },
];
const VERTICALS = [
  { value: "all", label: "All verticals" },
  { value: "home_buyer", label: "Home Buyer" },
  { value: "investor", label: "Investor" },
  { value: "refinance", label: "Refinance" },
  { value: "reverse_mortgage", label: "Reverse Mortgage" },
];

export function PortfolioChart() {
  const [metric, setMetric] = useState<MetricKey>("cpl_compare");
  const [country, setCountry] = useState<string>("all");
  const [vertical, setVertical] = useState<string>("all");
  const { data: trend = [], isFetching } = usePortfolioTrend({ country, vertical });
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

  const selected = METRICS.find((m) => m.key === metric)!;
  const fmtAxis = (v: number) => {
    if (selected.isCurrency) return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
    if (selected.isPercent) return `${v}%`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  };

  const scopeLabel = [
    country === "all" ? null : COUNTRIES.find((c) => c.value === country)?.label,
    vertical === "all" ? null : VERTICALS.find((v) => v.value === vertical)?.label,
  ].filter(Boolean).join(" · ") || "Active clients";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Portfolio Trend</h3>
          <p className="text-xs text-muted-foreground">
            {scopeLabel} · {label}{isFetching && " · updating…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vertical} onValueChange={setVertical}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VERTICALS.map((v) => (
                <SelectItem key={v.value} value={v.value} className="text-xs">{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => {
                if (metric === "cpl_compare") {
                  return [`$${Number(value).toFixed(2)}`, name === "cpl" ? "Reported CPL" : "True CPL"];
                }
                return [selected.format(Number(value)), selected.label];
              }}
            />
            {metric === "cpl_compare" ? (
              <>
                <Area type="monotone" dataKey="cpl" stroke="hsl(var(--primary))" strokeDasharray="5 5" fill="hsl(var(--primary))" fillOpacity={0.15} />
                <Area type="monotone" dataKey="trueCpl" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} />
              </>
            ) : (
              <Area type="monotone" dataKey={metric} stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {dc ? (
        <Link
          to="/campaigns?filter=double-counting"
          className="mt-3 group flex items-center justify-between rounded-lg bg-destructive/10 border border-destructive/20 p-3 hover:bg-destructive/15 transition-colors"
        >
          <p className="text-xs text-destructive font-medium">
            ⚠ Double-counting on {dc.count} client{dc.count === 1 ? "" : "s"}. Reported: {dc.reportedLeads} leads at ${dc.reportedCpl.toFixed(2)} · True: {dc.trueLeads} leads at ${dc.trueCpl.toFixed(2)}.
          </p>
          <span className="ml-3 flex shrink-0 items-center gap-1 text-xs font-semibold text-destructive">
            Review <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ) : (
        <div className="mt-3 rounded-lg bg-success/10 border border-success/20 p-3">
          <p className="text-xs text-success font-medium">✓ No double-counting detected in this range.</p>
        </div>
      )}
    </div>
  );
}
