import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, AlertTriangle } from "lucide-react";
import { useAiInsights } from "@/hooks/useAiInsights";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  className?: string;
}

export function AiInsightsWidget({ workspaceId, className }: Props) {
  const { data: insights = [], isLoading } = useAiInsights(workspaceId, { limit: 20 });

  // Dedupe: collapse multiple insights for the same client+kind into one row
  // (e.g. several "… out of threshold" entries for the same client).
  const seen = new Set<string>();
  const deduped = insights.filter((it) => {
    const key = `${it.client_id ?? "_"}::${it.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const critical = deduped.filter((i) => i.severity === "critical").length;
  const warn = deduped.filter((i) => i.severity === "warn").length;

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {critical > 0 && <span className="text-destructive font-medium">{critical} critical</span>}
              {critical > 0 && warn > 0 && " · "}
              {warn > 0 && <span className="text-warning-foreground">{warn} warnings</span>}
              {critical === 0 && warn === 0 && (deduped.length === 0 ? "All clear" : `${deduped.length} info`)}
            </p>
          </div>
        </div>
        <Link to="/ai" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 shrink-0">
          Open <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-1">Loading…</p>
        ) : deduped.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-3 text-center">
            No insights yet. The AI scans every 30 minutes.
          </p>
        ) : (
          deduped.slice(0, 4).map((it) => (
            <div key={it.id} className="flex items-start gap-2 text-xs min-w-0">
              <AlertTriangle
                className={cn(
                  "h-3.5 w-3.5 mt-0.5 shrink-0",
                  it.severity === "critical" ? "text-destructive" : it.severity === "warn" ? "text-warning" : "text-primary",
                )}
              />
              <p className="text-foreground line-clamp-2 break-words min-w-0 flex-1">{it.title}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
