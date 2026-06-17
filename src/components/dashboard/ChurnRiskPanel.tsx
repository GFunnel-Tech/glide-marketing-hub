import { useChurnRiskForClient, useRunChurnRiskScan } from "@/hooks/useChurnRisk";
import { ChurnRiskBadge } from "@/components/dashboard/ChurnRiskBadge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, CheckCircle2, Lightbulb } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function ChurnRiskPanel({ clientId }: { clientId: number }) {
  const { data: risk, isLoading } = useChurnRiskForClient(clientId);
  const run = useRunChurnRiskScan();

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
            Churn Risk
            {risk && <ChurnRiskBadge level={risk.risk_level} score={risk.score} />}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {risk?.computed_at
              ? `AI assessment · updated ${formatDistanceToNow(new Date(risk.computed_at), { addSuffix: true })}`
              : "No assessment yet."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => run.mutate(clientId)} disabled={run.isPending}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${run.isPending ? "animate-spin" : ""}`} />
          {run.isPending ? "Scanning…" : "Re-scan"}
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-xs text-muted-foreground">Loading…</p>}

      {risk && risk.summary && (
        <p className="mt-4 text-sm text-foreground">{risk.summary}</p>
      )}

      {risk && risk.reasons && risk.reasons.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why</h4>
          <ul className="mt-2 space-y-1.5">
            {risk.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {risk && risk.suggested_actions && risk.suggested_actions.length > 0 && (
        <div className="mt-4 rounded-lg bg-primary/5 p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Lightbulb className="h-3.5 w-3.5" /> Suggested actions
          </h4>
          <ul className="mt-2 space-y-1.5">
            {risk.suggested_actions.map((a, i) => (
              <li key={i} className="text-sm text-foreground">• {a}</li>
            ))}
          </ul>
        </div>
      )}

      {!isLoading && !risk && (
        <p className="mt-4 text-sm text-muted-foreground">
          No churn-risk score yet. Click <strong>Re-scan</strong> to generate an AI assessment.
        </p>
      )}
    </div>
  );
}
