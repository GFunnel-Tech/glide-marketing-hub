import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useDatabase";
import { KpiLabel } from "@/components/kpi/KpiLabel";

interface KPITileProps {
  label: string;
  kpiKey?: string;
  value: string;
  delta?: number;
  highlight?: boolean;
}

function KPITile({ label, value, delta, highlight }: KPITileProps) {
  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;

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
            {delta}% vs last 31 days
          </span>
        </div>
      )}
    </div>
  );
}

export function KPIStrip() {
  const { data: clients = [] } = useClients();
  
  const totalClients = clients.length;
  const totalLeads = clients.reduce((s, c) => s + c.leads, 0);
  const totalSpend = clients.reduce((s, c) => s + c.spend, 0);
  const blendedCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const closedDeals = 21; // From reports data - could be fetched separately

  return (
    <div className="grid grid-cols-5 gap-4">
      <KPITile label="Total Active Clients" value={String(totalClients)} />
      <KPITile label="Total Leads (MTD)" value={totalLeads.toLocaleString()} delta={22.1} />
      <KPITile label="Blended CPL" value={`$${blendedCpl.toFixed(2)}`} delta={-12.3} />
      <KPITile label="Total Ad Spend (MTD)" value={`$${totalSpend.toLocaleString()}`} delta={8.5} />
      <KPITile label="Closed Deals (MTD)" value={String(closedDeals)} delta={16} highlight />
    </div>
  );
}
