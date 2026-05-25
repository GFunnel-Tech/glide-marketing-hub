import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface AuditRow {
  id: string;
  action_id: string;
  client_id: number | null;
  event: string;
  action_type: string;
  payload: any;
  reasoning: string | null;
  result: any;
  error_message: string | null;
  prev_status: string | null;
  new_status: string | null;
  actor_kind: string;
  occurred_at: string;
}

const eventStyles: Record<string, { icon: any; cls: string; label: string }> = {
  proposed: { icon: Sparkles, cls: "bg-primary/10 text-primary border-primary/30", label: "Proposed" },
  approved: { icon: ShieldCheck, cls: "bg-blue-500/10 text-blue-600 border-blue-500/30", label: "Approved" },
  executed: { icon: Check, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Executed" },
  failed: { icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Failed" },
  cancelled: { icon: X, cls: "bg-muted text-muted-foreground border-border", label: "Cancelled" },
  status_changed: { icon: Clock, cls: "bg-muted text-muted-foreground border-border", label: "Updated" },
};

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AiAuditLogPanel({
  workspaceId,
  clientId,
}: {
  workspaceId: string;
  clientId?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "proposed" | "executed" | "failed">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-audit-log", workspaceId, clientId, filter],
    queryFn: async () => {
      let q = supabase
        .from("ai_action_audit_log" as any)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (clientId) q = q.eq("client_id", clientId);
      if (filter !== "all") q = q.eq("event", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    refetchInterval: 15000,
  });

  const toggle = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ScrollText className="h-3.5 w-3.5" />
          AI Audit Log
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {data?.length ?? 0} {clientId ? "for this client" : "in workspace"}
        </span>
      </div>

      <div className="flex gap-1 mb-3">
        {(["all", "proposed", "executed", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-md border px-2 py-1 text-[10px] capitalize ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-accent"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.length ? (
        <p className="text-[11px] text-muted-foreground text-center py-6">
          No AI activity recorded yet.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto -mx-1 px-1">
          {data.map((row) => {
            const style = eventStyles[row.event] ?? eventStyles.status_changed;
            const Icon = style.icon;
            const isOpen = expanded.has(row.id);
            return (
              <div key={row.id} className="rounded-md border border-border bg-background/60">
                <button
                  onClick={() => toggle(row.id)}
                  className="w-full flex items-start gap-2 p-2 text-left hover:bg-accent/40 transition-colors"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${style.cls}`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <code className="font-mono text-foreground truncate">{row.action_type}</code>
                      <span className="text-muted-foreground shrink-0">·</span>
                      <span className="text-muted-foreground shrink-0">{timeAgo(row.occurred_at)}</span>
                    </div>
                    {row.actor_kind && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        by {row.actor_kind}
                        {row.prev_status && row.new_status && (
                          <>
                            {" · "}
                            <span className="font-mono">
                              {row.prev_status} → {row.new_status}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border px-2 py-2 space-y-2 text-[11px]">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Timestamp
                      </p>
                      <p className="font-mono text-foreground">
                        {new Date(row.occurred_at).toLocaleString()}
                      </p>
                    </div>

                    {row.reasoning && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Claude reasoning
                        </p>
                        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                          {row.reasoning}
                        </p>
                      </div>
                    )}

                    {row.payload && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Parameters
                        </p>
                        <pre className="rounded bg-muted p-2 text-[10px] overflow-x-auto font-mono text-foreground">
                          {JSON.stringify(row.payload, null, 2)}
                        </pre>
                      </div>
                    )}

                    {row.result && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Result
                        </p>
                        <pre className="rounded bg-muted p-2 text-[10px] overflow-x-auto font-mono text-foreground">
                          {JSON.stringify(row.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {row.error_message && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-destructive mb-0.5">
                          Error
                        </p>
                        <p className="text-destructive font-mono text-[10px]">{row.error_message}</p>
                      </div>
                    )}

                    <p className="text-[9px] text-muted-foreground font-mono pt-1 border-t border-border">
                      action_id: {row.action_id}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
