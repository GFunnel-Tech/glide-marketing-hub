import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { SyncBadge } from "@/components/leads/LeadSyncHealth";

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  campaign_name: string | null;
  sync_status: string;
  sync_attempts: number;
  last_sync_error: string | null;
  created_time: string | null;
};

interface Props {
  clientId: number;
}

/**
 * Per-client CRM sync indicator. Mirrors LeadSyncHealth but scoped to one client.
 * Always renders so users can see "all good" too; expands when there are issues.
 */
export function ClientSyncStatus({ clientId }: Props) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: counts, isLoading } = useQuery({
    queryKey: ["client-sync-counts", wsId, clientId],
    enabled: !!wsId,
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("meta_leads")
        .select("sync_status")
        .eq("workspace_id", wsId!)
        .eq("client_id", clientId)
        .gte("created_at", dayAgo);
      if (error) throw error;
      const out = { pending: 0, synced: 0, recovered: 0, missing: 0, failed: 0 };
      for (const r of data ?? []) {
        const k = (r as any).sync_status as keyof typeof out;
        if (k in out) out[k]++;
      }
      return out;
    },
  });

  const { data: failedRows } = useQuery({
    queryKey: ["client-sync-failed", wsId, clientId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_leads")
        .select(
          "id, full_name, email, phone, campaign_name, sync_status, sync_attempts, last_sync_error, created_time"
        )
        .eq("workspace_id", wsId!)
        .eq("client_id", clientId)
        .in("sync_status", ["failed", "missing"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Live updates scoped to this client
  useEffect(() => {
    if (!wsId) return;
    const ch = supabase
      .channel(`client_sync_${wsId}_${clientId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meta_leads",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["client-sync-counts", wsId, clientId] });
          qc.invalidateQueries({ queryKey: ["client-sync-failed", wsId, clientId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [wsId, clientId, qc]);

  const runWorker = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("meta-lead-reconcile", {
        body: { workspaceId: wsId, clientId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sync check triggered");
      qc.invalidateQueries({ queryKey: ["client-sync-counts", wsId, clientId] });
      qc.invalidateQueries({ queryKey: ["client-sync-failed", wsId, clientId] });
    },
    onError: (e: any) => toast.error(e?.message || "Worker failed"),
  });

  const backfill = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-leads-sync", {
        body: { workspaceId: wsId, clientId, sinceDays: null, exhaustiveDiscovery: true },
      });
      if (error) throw error;
      return data as { leadsSynced?: number };
    },
    onSuccess: (data) => {
      toast.success(
        data?.leadsSynced != null
          ? `Pulled ${data.leadsSynced} lead${data.leadsSynced === 1 ? "" : "s"} from Meta`
          : "Backfill triggered"
      );
      qc.invalidateQueries({ queryKey: ["client-sync-counts", wsId, clientId] });
      qc.invalidateQueries({ queryKey: ["client-sync-failed", wsId, clientId] });
    },
    onError: (e: any) => toast.error(e?.message || "Backfill failed"),
  });


  const retry = useMutation({
    mutationFn: async (lead: Row) => {
      const { error } = await supabase
        .from("meta_leads")
        .update({
          sync_status: "pending",
          sync_attempts: 0,
          next_check_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", lead.id);
      if (error) throw error;
      await supabase.functions.invoke("meta-lead-reconcile", {
        body: { workspaceId: wsId, leadId: lead.id },
      });
    },
    onSuccess: () => {
      toast.success("Retry queued");
      qc.invalidateQueries({ queryKey: ["client-sync-failed", wsId, clientId] });
      qc.invalidateQueries({ queryKey: ["client-sync-counts", wsId, clientId] });
    },
    onError: (e: any) => toast.error(e?.message || "Retry failed"),
  });

  const failedCount = (counts?.failed ?? 0) + (counts?.missing ?? 0);
  const pendingCount = counts?.pending ?? 0;
  const syncedCount = (counts?.synced ?? 0) + (counts?.recovered ?? 0);
  const hasIssues = failedCount > 0;

  const summary = useMemo(() => {
    if (isLoading) return { icon: Loader2, tone: "muted", label: "Checking sync…" };
    if (hasIssues)
      return {
        icon: XCircle,
        tone: "destructive",
        label: `${failedCount} lead${failedCount === 1 ? "" : "s"} failed to sync`,
      };
    if (pendingCount > 0)
      return {
        icon: Clock,
        tone: "warning",
        label: `${pendingCount} lead${pendingCount === 1 ? "" : "s"} verifying…`,
      };
    return {
      icon: CheckCircle2,
      tone: "success",
      label:
        syncedCount > 0
          ? `All ${syncedCount} lead${syncedCount === 1 ? "" : "s"} synced (24h)`
          : "No leads in last 24h",
    };
  }, [isLoading, hasIssues, failedCount, pendingCount, syncedCount]);

  const toneStyles: Record<string, string> = {
    destructive: "border-destructive/40 bg-destructive/5",
    warning: "border-warning/40 bg-warning/5",
    success: "border-success/30 bg-success/5",
    muted: "border-border bg-card",
  };
  const iconTone: Record<string, string> = {
    destructive: "text-destructive",
    warning: "text-warning",
    success: "text-success",
    muted: "text-muted-foreground",
  };

  const Icon = summary.icon;

  return (
    <div className={cn("rounded-xl border", toneStyles[summary.tone])}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              iconTone[summary.tone],
              isLoading && "animate-spin"
            )}
          />
          <span className="text-sm font-medium text-foreground truncate">
            CRM sync · {summary.label}
          </span>
          {hasIssues && (
            <span className="ml-1 hidden sm:inline rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              Action needed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-xs text-muted-foreground tabular-nums">
            {syncedCount} synced · {pendingCount} pending · {failedCount} failed
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              backfill.mutate();
            }}
            disabled={backfill.isPending}
            title="Pull every lead Meta still has on file for this client and upsert any missing ones"
          >
            {backfill.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Backfill from Meta
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              runWorker.mutate();
            }}
            disabled={runWorker.isPending}
          >
            {runWorker.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run check
          </Button>

          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Tile label="Synced" value={counts?.synced ?? 0} icon={CheckCircle2} tone="text-success" />
            <Tile label="Recovered" value={counts?.recovered ?? 0} icon={RefreshCw} tone="text-primary" />
            <Tile label="Pending" value={counts?.pending ?? 0} icon={Clock} tone="text-muted-foreground" />
            <Tile label="Missing" value={counts?.missing ?? 0} icon={AlertTriangle} tone="text-warning" />
            <Tile label="Failed" value={counts?.failed ?? 0} icon={XCircle} tone="text-destructive" />
          </div>

          {failedRows && failedRows.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Needs attention
              </h4>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {failedRows.map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <SyncBadge status={l.sync_status} attempts={l.sync_attempts} />
                        <span className="text-sm font-medium text-foreground truncate">
                          {l.full_name || l.email || l.phone || "Unknown lead"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">
                        {l.campaign_name || "No campaign"}
                        {l.created_time &&
                          ` · ${formatDistanceToNow(new Date(l.created_time), { addSuffix: true })}`}
                      </div>
                      {l.last_sync_error && (
                        <div
                          className="mt-1 text-xs text-destructive break-words"
                          title={l.last_sync_error}
                        >
                          {l.last_sync_error}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retry.mutate(l)}
                      disabled={retry.isPending}
                    >
                      {retry.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Retry</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No failed or missing leads in the last 24 hours.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
