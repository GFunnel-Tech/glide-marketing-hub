import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OAuthEvent {
  id: string;
  correlation_id: string;
  step: string;
  outcome: "success" | "error" | "warning";
  error_code: string | null;
  error_message: string | null;
  meta_user_name: string | null;
  granted_scopes: string[] | null;
  declined_scopes: string[] | null;
  http_status: number | null;
  details: any;
  created_at: string;
  connection_id: string | null;
}

const OUTCOME_META: Record<OAuthEvent["outcome"], { Icon: typeof CheckCircle2; cls: string; label: string }> = {
  success: { Icon: CheckCircle2, cls: "text-success", label: "Success" },
  warning: { Icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  error: { Icon: AlertCircle, cls: "text-destructive", label: "Error" },
};

export function MetaOAuthDiagnosticsPanel() {
  const { currentWorkspace } = useWorkspace();
  const [events, setEvents] = useState<OAuthEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("meta_oauth_events")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      setEvents(data ?? []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Live updates so a fresh callback appears without a page refresh.
    if (!currentWorkspace) return;
    const ch = (supabase as any)
      .channel(`meta_oauth_events_${currentWorkspace.id}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meta_oauth_events", filter: `workspace_id=eq.${currentWorkspace.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("Correlation ID copied");
  };

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const errorCount = events.filter(e => e.outcome === "error").length;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Meta OAuth diagnostics
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {errorCount} error{errorCount === 1 ? "" : "s"}
              </Badge>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Latest 25 callback attempts with correlation IDs. Use the ID to cross-reference Lovable Cloud
            edge-function logs when a connection fails silently.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {!loading && events.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No OAuth attempts logged yet. Click <span className="font-medium text-foreground">Connect with Meta</span> to
          generate the first diagnostic entry.
        </div>
      )}

      <div className="space-y-2">
        {events.map(ev => {
          const meta = OUTCOME_META[ev.outcome];
          const Icon = meta.Icon;
          const isOpen = expanded.has(ev.id);
          return (
            <div key={ev.id} className="rounded-md border border-border bg-background">
              <button
                onClick={() => toggle(ev.id)}
                className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.cls)} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{ev.step}</span>
                    <Badge
                      variant={ev.outcome === "error" ? "destructive" : "secondary"}
                      className="text-[10px] uppercase"
                    >
                      {meta.label}
                    </Badge>
                    {ev.error_code && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {ev.error_code}
                      </Badge>
                    )}
                    {ev.http_status && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        HTTP {ev.http_status}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                  {ev.error_message && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{ev.error_message}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <span>cid:</span>
                    <span className="text-foreground">{ev.correlation_id}</span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        copyId(ev.correlation_id);
                      }}
                      className="hover:text-primary"
                      title="Copy correlation ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-border p-3 space-y-2 text-xs">
                  {ev.meta_user_name && (
                    <Row label="Meta user" value={ev.meta_user_name} />
                  )}
                  {ev.connection_id && (
                    <Row label="Connection ID" value={ev.connection_id} mono />
                  )}
                  {(ev.granted_scopes?.length ?? 0) > 0 && (
                    <Row label="Granted scopes" value={ev.granted_scopes!.join(", ")} mono />
                  )}
                  {(ev.declined_scopes?.length ?? 0) > 0 && (
                    <Row
                      label="Declined scopes"
                      value={ev.declined_scopes!.join(", ")}
                      mono
                      valueClass="text-warning"
                    />
                  )}
                  {ev.details && Object.keys(ev.details).length > 0 && (
                    <div>
                      <p className="text-muted-foreground mb-1">Raw details</p>
                      <pre className="rounded bg-muted/40 p-2 text-[11px] font-mono overflow-x-auto max-h-48">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="pt-1 text-[11px] text-muted-foreground">
                    Search edge-function logs for{" "}
                    <span className="font-mono text-foreground">{ev.correlation_id}</span> to see the
                    full server-side trace.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={cn("flex-1 break-all", mono && "font-mono text-[11px]", valueClass ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
