import { usePortfolioSnapshot } from "@/hooks/useAiInsights";
import { Activity, DollarSign, Users, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  className?: string;
}

export function PortfolioSnapshot({ workspaceId, className }: Props) {
  const { data, isLoading } = usePortfolioSnapshot(workspaceId);

  const tiles = [
    {
      label: "Clients",
      value: data?.total_clients ?? "—",
      sub: data
        ? `${data.red_clients ?? 0}R · ${data.yellow_clients ?? 0}Y · ${data.green_clients ?? 0}G`
        : "",
      Icon: Users,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Spend (30d)",
      value: data?.spend_30d != null ? `$${Math.round(Number(data.spend_30d)).toLocaleString()}` : "—",
      sub: "",
      Icon: DollarSign,
      tint: "bg-success/10 text-success",
    },
    {
      label: "Leads (30d)",
      value: data?.leads_30d != null ? Number(data.leads_30d).toLocaleString() : "—",
      sub: "",
      Icon: Activity,
      tint: "bg-warning/10 text-warning-foreground",
    },
    {
      label: "Portfolio CPL",
      value: data?.portfolio_cpl_30d != null ? `$${Number(data.portfolio_cpl_30d).toFixed(2)}` : "—",
      sub: data?.median_cpl_30d != null ? `median $${Number(data.median_cpl_30d).toFixed(2)}` : "",
      Icon: Target,
      tint: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
  ];

  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.label}</span>
            <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md", t.tint)}>
              <t.Icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-semibold text-foreground tabular-nums">
            {isLoading ? "…" : t.value}
          </p>
          {t.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
