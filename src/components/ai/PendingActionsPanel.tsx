import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

interface PendingActionsPanelProps {
  workspaceId: string;
  clientId?: number | null;
}

/**
 * Lists AI-proposed Meta actions awaiting human approval and lets the user
 * approve (execute on Meta) or reject them. Shared by the AI page and the
 * per-client AI tab.
 */
export function PendingActionsPanel({ workspaceId, clientId }: PendingActionsPanelProps) {
  const qc = useQueryClient();

  const { data: pending = [] } = useQuery({
    queryKey: ["ai-pending", workspaceId, clientId ?? null],
    queryFn: async () => {
      if (!workspaceId) return [];
      let q = supabase
        .from("ai_pending_actions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!workspaceId,
    refetchInterval: 5000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const { data, error } = await supabase.functions.invoke("ai-pending-execute", {
        body: { actionId: id, decision },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.status === "executed" ? "Executed on Meta" : "Updated");
      qc.invalidateQueries({ queryKey: ["ai-pending"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending AI Actions</h3>
        <span className="text-xs text-muted-foreground">{pending.length}</span>
      </div>
      {pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">No actions awaiting approval.</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-auto">
          {pending.map((p: any) => (
            <div key={p.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between mb-1">
                <code className="text-xs font-semibold text-primary">{p.action_type}</code>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(p.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-foreground mb-1.5">{p.reasoning || "—"}</p>
              <details className="text-[11px] text-muted-foreground mb-2">
                <summary className="cursor-pointer">payload</summary>
                <pre className="mt-1 overflow-auto bg-accent p-1.5 rounded">{JSON.stringify(p.payload, null, 2)}</pre>
              </details>
              <div className="flex gap-2">
                <button
                  onClick={() => decide.mutate({ id: p.id, decision: "approve" })}
                  disabled={decide.isPending}
                  className="flex-1 rounded bg-success/20 text-success border border-success/40 px-2 py-1 text-xs font-medium hover:bg-success/30 flex items-center justify-center gap-1"
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
                <button
                  onClick={() => decide.mutate({ id: p.id, decision: "reject" })}
                  disabled={decide.isPending}
                  className="flex-1 rounded bg-destructive/20 text-destructive border border-destructive/40 px-2 py-1 text-xs font-medium hover:bg-destructive/30 flex items-center justify-center gap-1"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
