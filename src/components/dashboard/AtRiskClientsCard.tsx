import { useChurnRisks, useRunChurnRiskScan } from "@/hooks/useChurnRisk";
import { ChurnRiskBadge } from "./ChurnRiskBadge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";
import { useClientPath } from "@/lib/clientPath";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

export function AtRiskClientsCard() {
  const { data: risks = [], isLoading } = useChurnRisks();
  const clients = useVisibleClients();
  const run = useRunChurnRiskScan();
  const clientPath = useClientPath();

  const clientNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clients) m.set(Number(c.id), c.name);
    return m;
  }, [clients]);

  const ranked = useMemo(
    () =>
      risks
        .filter((r) => r.risk_level === "high" || r.risk_level === "medium")
        .slice(0, 5),
    [risks]
  );

  const lastComputed = risks[0]?.computed_at;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
            At-Risk Clients
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-detected churn likelihood across performance, spend, engagement, and billing.
            {lastComputed && ` · Updated ${formatDistanceToNow(new Date(lastComputed), { addSuffix: true })}`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run.mutate(undefined)}
          disabled={run.isPending}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${run.isPending ? "animate-spin" : ""}`} />
          {run.isPending ? "Scanning…" : "Run scan"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && ranked.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
            No at-risk clients yet. Run a scan to get started.
          </p>
        )}
        {ranked.map((r) => {
          const name = clientNames.get(r.client_id) ?? `Client #${r.client_id}`;
          return (
            <Link
              key={r.client_id}
              to={clientPath(r.client_id)}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ChurnRiskBadge level={r.risk_level} score={r.score} />
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                </div>
                {r.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
