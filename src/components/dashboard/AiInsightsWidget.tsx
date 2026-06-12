import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, AlertTriangle } from "lucide-react";
import { useAiInsights } from "@/hooks/useAiInsights";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  className?: string;
}

export function AiInsightsWidget({ workspaceId, className }: Props) {
  const { data: insights = [], isLoading } = useAiInsights(workspaceId, { limit: 5 });
  const critical = insights.filter((i) => i.severity === "critical").length;
  const warn = insights.filter((i) => i.severity === "warn").length;

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
            <p className="text-[11px] text-muted-foreground">
              {critical > 0 && <span className="text-destructive font-medium">{critical} critical</span>}
              {critical > 0 && warn > 0 && " · "}
              {warn > 0 && <span className="text-warning-foreground">{warn} warnings</span>}
              {critical === 0 && warn === 0 && (insights.length === 0 ? "All clear" : `${insights.length} info`)}
            </p>
          </div>
        </div>
        <Link to="/ai" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
          Open <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-1">Loading…</p>
        ) : insights.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-3 text-center">
            No insights yet. The AI scans every 30 minutes.
          </p>
        ) : (
          insights.slice(0, 4).map((it) => (
            <div key={it.id} className="flex items-start gap-2 text-xs">
              <AlertTriangle
                className={cn(
                  "h-3.5 w-3.5 mt-0.5 shrink-0",
                  it.severity === "critical" ? "text-destructive" : it.severity === "warn" ? "text-warning" : "text-primary",
                )}
              />
              <p className="text-foreground line-clamp-2">{it.title}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
