import { cn } from "@/lib/utils";

type Status = "Good" | "Watch" | "Fix";

const dot = { Good: "bg-success", Watch: "bg-warning", Fix: "bg-destructive" };

/**
 * Shared KPI tile used by both the internal Client Profile and the
 * client-facing Portal so the two stay visually identical.
 *
 * Client-facing callers should omit `status` and `tone` entirely — the client
 * portal shows plain data with reference targets, never status signalling.
 */
export function ClientKpiTile({
  label, value, benchmark, status, tone, valueTitle,
}: {
  label: string;
  value: string;
  benchmark?: string;
  status?: Status;
  tone?: string;
  /** Optional title/tooltip for the value (e.g. currency-unset notice). */
  valueTitle?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight break-words">{label}</p>
        {status && <span className={cn("inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0", dot[status])} />}
      </div>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums text-foreground", tone)} title={valueTitle}>{value}</p>
      {benchmark && <p className="text-[11px] text-muted-foreground mt-0.5">Target {benchmark}</p>}
    </div>
  );
}
