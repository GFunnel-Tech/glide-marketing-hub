import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { GhlAuditIssue } from "@/hooks/useGhlAudit";

const meta = {
  critical: { icon: ShieldAlert, cls: "text-destructive", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "text-amber-600", label: "Warning" },
  info: { icon: Info, cls: "text-muted-foreground", label: "Info" },
} as const;

export function GhlAuditIssues({ issues }: { issues: GhlAuditIssue[] }) {
  if (!issues.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> No issues detected.
      </div>
    );
  }
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return (
    <ul className="space-y-1.5">
      {[...issues].sort((a, b) => order[a.severity] - order[b.severity]).map((i, idx) => {
        const m = meta[i.severity] ?? meta.info;
        const Icon = m.icon;
        return (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${m.cls}`} />
            <span className="text-foreground">{i.message}</span>
            <Badge variant="outline" className="ml-auto text-[10px] uppercase shrink-0">{i.area}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 85 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : score >= 60 ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {score}
    </span>
  );
}
