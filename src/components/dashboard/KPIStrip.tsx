import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { portfolioKPIs } from "@/data/mockData";

interface KPITileProps {
  label: string;
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
  const k = portfolioKPIs;
  return (
    <div className="grid grid-cols-5 gap-4">
      <KPITile label="Total Active Clients" value={String(k.totalActiveClients)} />
      <KPITile label="Total Leads (MTD)" value={k.totalLeadsThisMonth.value.toLocaleString()} delta={k.totalLeadsThisMonth.delta} />
      <KPITile label="Blended CPL" value={`$${k.blendedCPL.value.toFixed(2)}`} delta={k.blendedCPL.delta} />
      <KPITile label="Total Ad Spend (MTD)" value={`$${k.totalAdSpend.value.toLocaleString()}`} delta={k.totalAdSpend.delta} />
      <KPITile label="Closed Deals (MTD)" value={String(k.closedDeals.value)} delta={k.closedDeals.delta} highlight />
    </div>
  );
}
