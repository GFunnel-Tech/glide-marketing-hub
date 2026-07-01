import { cn } from "@/lib/utils";

type Status = "Good" | "Watch" | "Fix";

const dot = { Good: "bg-success", Watch: "bg-warning", Fix: "bg-destructive" };

/**
 * Shared KPI tile used by both the internal Client Profile and the
 * client-facing Portal so the two stay visually identical.
 */
export function ClientKpiTile({
  label, value, benchmark, status, tone,
}: {
  label: string;
  value: string;
  benchmark?: string;
  status?: Status;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        {status && <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dot[status])} />}
      </div>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums text-foreground", tone)}>{value}</p>
      {benchmark && <p className="text-[11px] text-muted-foreground mt-0.5">Target {benchmark}</p>}
    </div>
  );
}
