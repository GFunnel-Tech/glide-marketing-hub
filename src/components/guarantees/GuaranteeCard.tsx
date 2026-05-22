import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Pencil, Trash2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateGuarantee, formatCriterionValue, METRIC_LABELS } from "@/lib/guaranteeEvaluator";
import type { ClientGuarantee, GuaranteeStatus } from "@/lib/guaranteeTypes";

const STATUS_META: Record<GuaranteeStatus, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  on_track: { label: "On Track", cls: "bg-success/15 text-success border-success/30", icon: ShieldCheck },
  at_risk: { label: "At Risk", cls: "bg-warning/15 text-warning border-warning/30", icon: AlertTriangle },
  met: { label: "Met", cls: "bg-success/20 text-success border-success/40", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
};

interface Props {
  guarantee: ClientGuarantee;
  context: { client?: { leads?: number; spend?: number }; appointments?: number; closed_deals?: number; commission_revenue?: number; deals_in_underwriting?: number };
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export function GuaranteeCard({ guarantee, context, onEdit, onDelete, readOnly }: Props) {
  const evalResult = useMemo(() => evaluateGuarantee(guarantee, context), [guarantee, context]);
  const meta = STATUS_META[evalResult.status];
  const Icon = meta.icon;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{guarantee.name}</h3>
            <Badge variant="outline" className={cn("gap-1", meta.cls)}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
          </div>
          {guarantee.description && (
            <p className="text-sm text-muted-foreground mt-1">{guarantee.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {evalResult.days_remaining >= 0
                ? `${evalResult.days_remaining} day${evalResult.days_remaining === 1 ? "" : "s"} remaining`
                : `${Math.abs(evalResult.days_remaining)} days overdue`}
            </span>
            <span>·</span>
            <span>Deadline: {guarantee.deadline}</span>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Overall progress</span>
          <span className="font-medium text-foreground">{evalResult.progress_pct.toFixed(0)}%</span>
        </div>
        <Progress value={evalResult.progress_pct} className="h-2" />
      </div>

      <div className="space-y-3">
        {evalResult.results.map((r, idx) => {
          const crit = guarantee.criteria[idx];
          return (
            <div key={r.id} className="rounded-md border border-border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm">
                  <span className="font-medium text-foreground">{r.label || METRIC_LABELS[crit.metric]}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{METRIC_LABELS[crit.metric]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium tabular-nums", r.met ? "text-success" : "text-foreground")}>
                    {formatCriterionValue(r.actual, r.unit)} / {formatCriterionValue(r.target, r.unit)}
                  </span>
                  {r.met ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{r.progress_pct.toFixed(0)}%</span>
                  )}
                </div>
              </div>
              <Progress value={r.progress_pct} className={cn("h-1.5", r.met && "[&>div]:bg-success")} />
              {crit.note && <p className="text-xs text-muted-foreground">{crit.note}</p>}
            </div>
          );
        })}
      </div>

      {guarantee.terms && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">View full terms</summary>
          <p className="whitespace-pre-wrap mt-2 leading-relaxed">{guarantee.terms}</p>
        </details>
      )}
    </Card>
  );
}
