import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  campaign_name: string | null;
  client_id: number | null;
  sync_status: string;
  sync_attempts: number;
  last_sync_error: string | null;
  next_check_at: string | null;
  created_time: string | null;
  recovered_at: string | null;
};

export function LeadSyncHealth() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const wsId = currentWorkspace?.id;

  const { data: counts } = useQuery({
    queryKey: ["lead-sync-counts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("meta_leads")
        .select("sync_status")
        .eq("workspace_id", wsId!)
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

  const { data: failed } = useQuery({
    queryKey: ["lead-sync-failed", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_leads")
        .select("id, full_name, email, phone, campaign_name, client_id, sync_status, sync_attempts, last_sync_error, next_check_at, created_time, recovered_at")
        .eq("workspace_id", wsId!)
        .in("sync_status", ["failed", "missing"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Live updates
  useEffect(() => {
    if (!wsId) return;
    const ch = supabase
      .channel(`meta_leads_health_${wsId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meta_leads", filter: `workspace_id=eq.${wsId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["lead-sync-counts", wsId] });
          qc.invalidateQueries({ queryKey: ["lead-sync-failed", wsId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [wsId, qc]);

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
      // Kick the worker now
      await supabase.functions.invoke("meta-lead-reconcile", {
        body: { workspaceId: wsId, leadId: lead.id },
      });
    },
    onSuccess: () => {
      toast.success("Retry queued");
      qc.invalidateQueries({ queryKey: ["lead-sync-failed", wsId] });
      qc.invalidateQueries({ queryKey: ["lead-sync-counts", wsId] });
    },
    onError: (e: any) => toast.error(e?.message || "Retry failed"),
  });

  const runWorker = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("meta-lead-reconcile", {
        body: { workspaceId: wsId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sync check triggered");
      qc.invalidateQueries({ queryKey: ["lead-sync-counts", wsId] });
      qc.invalidateQueries({ queryKey: ["lead-sync-failed", wsId] });
    },
    onError: (e: any) => toast.error(e?.message || "Worker failed"),
  });

  const backfill = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-leads-sync", {
        body: { workspaceId: wsId, sinceDays: null, exhaustiveDiscovery: true },
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
      qc.invalidateQueries({ queryKey: ["lead-sync-counts", wsId] });
      qc.invalidateQueries({ queryKey: ["lead-sync-failed", wsId] });
    },
    onError: (e: any) => toast.error(e?.message || "Backfill failed"),
  });

  const tiles = useMemo(
    () => [
      { key: "synced", label: "Synced", value: counts?.synced ?? 0, icon: CheckCircle2, tone: "text-success" },
      { key: "recovered", label: "Recovered", value: counts?.recovered ?? 0, icon: RefreshCw, tone: "text-primary" },
      { key: "pending", label: "Pending", value: counts?.pending ?? 0, icon: Clock, tone: "text-muted-foreground" },
      { key: "missing", label: "Missing", value: counts?.missing ?? 0, icon: AlertTriangle, tone: "text-warning" },
      { key: "failed", label: "Failed", value: counts?.failed ?? 0, icon: XCircle, tone: "text-destructive" },
    ],
    [counts],
  );


  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">CRM sync health (24h)</h2>
          <p className="text-xs text-muted-foreground">
            Every Meta lead is checked against GoHighLevel 5 minutes after arrival; missing leads are pushed automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            title="Pull every lead Meta still has on file and upsert any missing into the database"
          >
            {backfill.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Backfill from Meta
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runWorker.mutate()}
            disabled={runWorker.isPending}
          >
            {runWorker.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Run check now
          </Button>
        </div>

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.key} className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${t.tone}`} />
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{t.value}</div>
            </div>
          );
        })}
      </div>

      {failed && failed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs attention
          </h3>
          <div className="divide-y divide-border rounded-lg border border-border">
            {failed.map((l) => (
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
                    {l.created_time && ` · ${formatDistanceToNow(new Date(l.created_time), { addSuffix: true })}`}
                  </div>
                  {l.last_sync_error && (
                    <div className="mt-1 text-xs text-destructive truncate" title={l.last_sync_error}>
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
                  {retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Retry</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function SyncBadge({ status, attempts }: { status: string; attempts?: number }) {
  const map: Record<string, { label: string; cls: string }> = {
    synced: { label: "Synced", cls: "bg-success/15 text-success border-success/30" },
    recovered: { label: "Recovered", cls: "bg-primary/15 text-primary border-primary/30" },
    pending: { label: "Verifying…", cls: "bg-muted text-muted-foreground border-border" },
    missing: { label: `Retrying${attempts ? ` (${attempts}/3)` : ""}`, cls: "bg-warning/15 text-warning border-warning/30" },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] || map.pending;
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${m.cls}`}>
      {m.label}
    </Badge>
  );
}
