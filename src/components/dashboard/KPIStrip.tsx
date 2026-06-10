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
  const blendedCpl = totalLeads > 0 ? totals.spend / totalLeads : 0;
  const blendedCvr = totals.clicks > 0 ? (totals.reportedLeads / totals.clicks) * 100 : 0;
  // Surface when Meta over-reports vs the deduped count so the honest headline
  // is explainable rather than just looking "low".
  const dedupRemoved = Math.max(0, totals.reportedLeads - totals.effectiveLeads);
  const sub = isFetching ? "updating…" : label;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <KPITile label="Total Clients" value={String(segments.total)} sublabel={`${segments.inWorkflow} in workflow · ${segments.synced} synced`} Icon={Users} iconTone="blue" />
      <KPITile label="Total Leads" kpiKey="leads" value={totalLeads.toLocaleString()} sublabel={dedupRemoved > 0 ? `${sub} · deduped (−${dedupRemoved.toLocaleString()} vs Meta)` : sub} Icon={Activity} iconTone="green" />
      <KPITile label="Blended CPL" kpiKey="cpl" value={`$${blendedCpl.toFixed(2)}`} sublabel={sub} Icon={Target} iconTone="amber" />
      <KPITile label="Form CVR" kpiKey="formcvr" value={`${blendedCvr.toFixed(2)}%`} sublabel={sub} Icon={Percent} iconTone="green" />
      <KPITile label="Total Ad Spend" kpiKey="spend" value={`$${Math.round(totals.spend).toLocaleString()}`} sublabel={sub} Icon={DollarSign} iconTone="pink" />
    </div>
  );
}
