import { cn } from "@/lib/utils";
import type { LeadGrade } from "@/hooks/useLeadScores";

const gradeStyle: Record<LeadGrade, string> = {
  A: "bg-success/15 text-success border-success/30",
  B: "bg-primary/15 text-primary border-primary/30",
  C: "bg-warning/15 text-warning border-warning/30",
  D: "bg-destructive/15 text-destructive border-destructive/30",
};

interface Props {
  grade?: LeadGrade | null;
  score?: number | null;
  size?: "sm" | "md";
  showScore?: boolean;
  className?: string;
}

export function LeadGradeBadge({ grade, score, size = "sm", showScore, className }: Props) {
  if (!grade) {
    return (
      <span className={cn(
        "inline-flex items-center justify-center rounded-md border border-dashed border-border text-muted-foreground",
        size === "sm" ? "h-5 min-w-5 px-1 text-[10px]" : "h-6 min-w-6 px-1.5 text-xs",
        className
      )}>
        —
      </span>
    );
  }
  return (
    <span
      title={score != null ? `Score ${score.toFixed(0)}/100` : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold tabular-nums",
        gradeStyle[grade],
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        className
      )}
    >
      <span>{grade}</span>
      {showScore && score != null && <span className="opacity-75">{Math.round(score)}</span>}
    </span>
  );
}
