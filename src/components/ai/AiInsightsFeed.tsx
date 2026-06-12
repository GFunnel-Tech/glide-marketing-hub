import { useAiInsights, useTriggerOpsScan, type AiInsight } from "@/hooks/useAiInsights";
import { Link } from "react-router-dom";
import { useClientPath } from "@/lib/clientPath";
import { AlertTriangle, TrendingUp, Lightbulb, X, RefreshCw, Loader2, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const kindIcon = {
  anomaly: AlertTriangle,
  forecast: TrendingUp,
  recommendation: Lightbulb,
  benchmark: Sparkles,
  summary: Sparkles,
};

const severityStyles = {
  critical: "border-l-destructive bg-destructive/5",
  warn: "border-l-warning bg-warning/5",
  info: "border-l-primary bg-primary/5",
};

const severityChipStyles = {
  critical: "bg-destructive/10 text-destructive",
  warn: "bg-warning/10 text-warning-foreground",
  info: "bg-primary/10 text-primary",
};

interface Props {
  workspaceId: string;
  clientId?: number | null;
  showScan?: boolean;
  emptyHint?: string;
  className?: string;
  limit?: number;
}

export function AiInsightsFeed({ workspaceId, clientId, showScan = true, emptyHint, className, limit = 50 }: Props) {
  const { data: insights = [], isLoading, dismiss } = useAiInsights(workspaceId, { clientId, limit });
  const scan = useTriggerOpsScan(workspaceId);
  const clientPath = useClientPath();

  const critical = insights.filter((i) => i.severity === "critical");
  const warn = insights.filter((i) => i.severity === "warn");
  const info = insights.filter((i) => i.severity === "info");

  const Section = ({ title, items, accent }: { title: string; items: AiInsight[]; accent: string }) =>
    items.length === 0 ? null : (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={cn("inline-flex h-1.5 w-1.5 rounded-full", accent)} />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        <ul className="space-y-2">
          {items.map((it) => {
            const Icon = kindIcon[it.kind] ?? Sparkles;
            return (
              <li
                key={it.id}
                className={cn(
                  "group relative rounded-lg border-l-4 border border-border bg-card p-3 pr-9",
                  severityStyles[it.severity],
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{it.title}</p>
                      <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded-md font-semibold", severityChipStyles[it.severity])}>
                        {it.kind}
                      </span>
                    </div>
                    {it.body && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{it.body}</p>}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                      <span>{new Date(it.created_at).toLocaleString()}</span>
                      {it.client_id && !clientId && (
                        <>
                          <span>·</span>
                          <Link
                            to={clientPath(it.client_id, "?tab=ai")}
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            Open client <ChevronRight className="h-3 w-3" />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss.mutate(it.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-accent"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
            <p className="text-[11px] text-muted-foreground">
              {insights.length === 0 ? "No open insights" : `${insights.length} open · ${critical.length} critical`}
            </p>
          </div>
        </div>
        {showScan && (
          <button
            type="button"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {scan.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Scan now
          </button>
        )}
      </div>
      <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : insights.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              {emptyHint ?? "Nothing flagged. Run a scan or wait for the next automated pass."}
            </p>
          </div>
        ) : (
          <>
            <Section title="Critical" items={critical} accent="bg-destructive" />
            <Section title="Warnings" items={warn} accent="bg-warning" />
            <Section title="Info" items={info} accent="bg-primary" />
          </>
        )}
      </div>
    </div>
  );
}
