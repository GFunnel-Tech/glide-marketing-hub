import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useDatabase";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { KpiLabel } from "@/components/kpi/KpiLabel";

interface KPITileProps {
  label: string;
  kpiKey?: string;
  value: string;
  delta?: number;
  highlight?: boolean;
  sublabel?: string;
}

function KPITile({ label, kpiKey, value, delta, highlight, sublabel }: KPITileProps) {
  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40",
        highlight && "bg-success/10 border-success/30"
      )}
    >
      <KpiLabel
        label={label}
        kpiKey={kpiKey}
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
      />
      <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      {delta !== undefined ? (
        <div className="flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : isNegative ? (
            <TrendingDown className="h-3 w-3 text-destructive" />
          ) : null}
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              isPositive && "text-success",
              isNegative && "text-destructive"
            )}
          >
            {isPositive ? "+" : ""}
            {delta}%
          </span>
          {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
        </div>
      ) : sublabel ? (
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      ) : null}
    </div>
  );
}

export function KPIStrip() {
  const { data: clients = [] } = useClients();
  const { data: rangeMetrics = {}, isFetching } = useClientsRangeMetrics();
  const { label } = useDateRange();

  const totals = Object.values(rangeMetrics).reduce(
    (acc, m) => {
      acc.spend += m.spend;
      acc.reportedLeads += m.reportedLeads;
      acc.trueLeads += m.trueLeads;
      return acc;
    },
    { spend: 0, reportedLeads: 0, trueLeads: 0 }
  );

  const totalLeads = totals.trueLeads > 0 ? totals.trueLeads : totals.reportedLeads;
  const blendedCpl = totalLeads > 0 ? totals.spend / totalLeads : 0;
  const totalClients = clients.length;
  const sub = isFetching ? "updating…" : label;

  return (
    <div className="grid grid-cols-5 gap-4">
      <KPITile label="Total Active Clients" value={String(totalClients)} sublabel={sub} />
      <KPITile label="Total Leads" kpiKey="leads" value={totalLeads.toLocaleString()} sublabel={sub} />
      <KPITile label="Blended CPL" kpiKey="cpl" value={`$${blendedCpl.toFixed(2)}`} sublabel={sub} />
      <KPITile label="Total Ad Spend" kpiKey="spend" value={`$${Math.round(totals.spend).toLocaleString()}`} sublabel={sub} />
      <KPITile label="Closed Deals" value="—" sublabel="connect CRM" />
    </div>
  );
}
