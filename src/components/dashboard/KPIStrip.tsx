import { Users, Activity, DollarSign, Target, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientSegments } from "@/hooks/useClientSegments";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { KpiLabel } from "@/components/kpi/KpiLabel";

function deriveImpressionsFromCpm(spend: number, cpm: number) {
  if (!cpm || cpm <= 0) return 0;
  return (spend / cpm) * 1000;
}

interface KPITileProps {
  label: string;
  kpiKey?: string;
  value: string;
  sublabel?: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconTone: "blue" | "green" | "amber" | "pink";
}

const TONE: Record<KPITileProps["iconTone"], string> = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  pink: "bg-destructive/10 text-destructive",
};

function KPITile({ label, kpiKey, value, sublabel, Icon, iconTone }: KPITileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <KpiLabel
            label={label}
            kpiKey={kpiKey}
            className="text-xs font-medium text-muted-foreground"
          />
          <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[iconTone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function KPIStrip() {
  const { data: rangeMetrics = {}, isFetching } = useClientsRangeMetrics();
  const { label } = useDateRange();

  // All client counts come from one source of truth so the dashboard can never
  // show two unexplained totals. Each number is labelled with its denominator.
  const segments = useClientSegments();

  const totals = Object.values(rangeMetrics).reduce(
    (acc, m) => {
      acc.spend += m.spend;
      acc.reportedLeads += m.reportedLeads;
      acc.trueLeads += m.trueLeads;
      // Sum the honest per-client lead count (deduped, with reported fallback)
      // so the portfolio total never inflates and CPL reconciles with spend.
      acc.effectiveLeads += m.effectiveLeads;
      acc.clicks += m.clicks;
      return acc;
    },
    { spend: 0, reportedLeads: 0, trueLeads: 0, effectiveLeads: 0, clicks: 0 }
  );

  const totalLeads = totals.effectiveLeads;
  const blendedCvr = totals.clicks > 0 ? (totals.reportedLeads / totals.clicks) * 100 : 0;
  // Surface when Meta over-reports vs the deduped count so the honest headline
  // is explainable rather than just looking "low".
  const dedupRemoved = Math.max(0, totals.reportedLeads - totals.effectiveLeads);
  const sub = isFetching ? "updating…" : label;

  // Spend and CPL are grouped by currency — CAD and USD are never summed into
  // one blended number. Highest-spend currency leads each tile; the rest go in
  // the sublabel.
  const currencyGroups = (() => {
    const map = new Map<string, { spend: number; leads: number }>();
    for (const m of Object.values(rangeMetrics)) {
      const cur = m.currency || "USD";
      const g = map.get(cur) ?? { spend: 0, leads: 0 };
      g.spend += m.spend;
      g.leads += m.effectiveLeads;
      map.set(cur, g);
    }
    return [...map.entries()]
      .map(([currency, g]) => ({ currency, spend: g.spend, leads: g.leads, cpl: g.leads > 0 ? g.spend / g.leads : 0 }))
      .sort((a, b) => b.spend - a.spend);
  })();
  const money = (v: number, currency: string, decimals = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency === "MIXED" ? "USD" : currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(v) + (currency === "MIXED" ? " (mixed)" : "");
  const primary = currencyGroups[0] ?? { currency: "USD", spend: 0, leads: 0, cpl: 0 };
  const others = currencyGroups.slice(1);
  const spendSub = others.length ? others.map(g => money(g.spend, g.currency)).join(" · ") : sub;
  const cplSub = others.length ? others.map(g => money(g.cpl, g.currency, 2)).join(" · ") : sub;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <KPITile label="Total Clients" value={String(segments.total)} sublabel={`${segments.inWorkflow} in workflow · ${segments.synced} synced`} Icon={Users} iconTone="blue" />
      <KPITile label="Total Leads" kpiKey="leads" value={totalLeads.toLocaleString()} sublabel={dedupRemoved > 0 ? `${sub} · deduped (−${dedupRemoved.toLocaleString()} vs Meta)` : sub} Icon={Activity} iconTone="green" />
      <KPITile label={others.length ? `CPL (${primary.currency})` : "Blended CPL"} kpiKey="cpl" value={money(primary.cpl, primary.currency, 2)} sublabel={cplSub} Icon={Target} iconTone="amber" />
      <KPITile label="Form CVR" kpiKey="formcvr" value={`${blendedCvr.toFixed(2)}%`} sublabel={sub} Icon={Percent} iconTone="green" />
      <KPITile label={others.length ? `Ad Spend (${primary.currency})` : "Total Ad Spend"} kpiKey="spend" value={money(primary.spend, primary.currency)} sublabel={spendSub} Icon={DollarSign} iconTone="pink" />
    </div>
  );
}
