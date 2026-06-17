import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";
import type { ChurnRiskLevel } from "@/hooks/useChurnRisk";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STYLES: Record<ChurnRiskLevel, { cls: string; label: string; Icon: any }> = {
  high: { cls: "bg-destructive/10 text-destructive border-destructive/30", label: "High risk", Icon: AlertTriangle },
  medium: { cls: "bg-warning/10 text-warning border-warning/30", label: "Watch", Icon: AlertCircle },
  low: { cls: "bg-success/10 text-success border-success/30", label: "Healthy", Icon: ShieldCheck },
};

export function ChurnRiskBadge({
  level,
  score,
  summary,
  compact = false,
}: {
  level: ChurnRiskLevel;
  score?: number;
  summary?: string | null;
  compact?: boolean;
}) {
  const s = STYLES[level];
  const Icon = s.Icon;
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        s.cls
      )}
    >
      <Icon className="h-3 w-3" />
      {compact ? level[0].toUpperCase() : s.label}
      {!compact && typeof score === "number" && <span className="tabular-nums opacity-80">· {Math.round(score)}</span>}
    </span>
  );
  if (!summary) return badge;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{summary}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
