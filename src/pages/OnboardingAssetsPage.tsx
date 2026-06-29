import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { MIN_IMAGE_COUNT, VOICE_MIN_SECONDS } from "@/components/onboarding/config";

type StatusRow = {
  client_id: number;
  workspace_id: string;
  name: string;
  brand: string;
  client_status: string;
  consent_done: boolean | null;
  info_done: boolean | null;
  images_done: boolean | null;
  voice_done: boolean | null;
  files_done: boolean | null;
  submitted_at: string | null;
  completed_at: string | null;
  image_count: number;
  voice_count: number;
  synced_count: number;
  failed_sync_count: number;
  pending_sync_count: number;
  ready_count: number;
  processed_count: number;
  failed_processing_count: number;
  has_consent: boolean;
};

export default function OnboardingAssetsPage() {
  const { currentWorkspace } = useWorkspace();
  const [expanded, setExpanded] = useState<number | null>(null);

  const rowsQ = useQuery({
    queryKey: ["client-onboarding-status", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async (): Promise<StatusRow[]> => {
      const { data, error } = await (supabase as any)
        .from("client_onboarding_status")
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatusRow[];
    },
  });

  const retryDrive = useMutation({
    mutationFn: async (clientId: number) => {
      const { error: rpcErr } = await (supabase as any).rpc("retry_drive_sync", { _client_id: clientId });
      if (rpcErr) throw rpcErr;
      const { error: fnErr } = await supabase.functions.invoke("onboarding-drive-sync", {
        body: { client_id: clientId },
      });
      if (fnErr) throw fnErr;
    },
    onSuccess: () => { toast.success("Drive sync re-triggered"); rowsQ.refetch(); },
    onError: (err: any) => toast.error(err?.message ?? "Could not retry"),
  });

  const stage = useMutation({
    mutationFn: async (clientId: number) => {
      const { error } = await supabase.functions.invoke("onboarding-process-stage", {
        body: { client_id: clientId, mode: "stage" },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assets marked ready for processing"); rowsQ.refetch(); },
    onError: (err: any) => toast.error(err?.message ?? "Could not stage"),
  });

  if (rowsQ.isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const rows = rowsQ.data ?? [];

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Onboarding assets</h1>
          <p className="text-sm text-muted-foreground">Per-client capture status. Re-trigger Drive sync or stage assets for processing.</p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-[1fr_repeat(6,minmax(0,1fr))_auto] items-center gap-3 px-4 py-3 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <div>Client</div>
          <div>Consent</div>
          <div>Info</div>
          <div>Images</div>
          <div>Voice</div>
          <div>Drive</div>
          <div>Processing</div>
          <div className="text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No clients in this workspace.</div>
        ) : (
          rows.map((r) => {
            const open = expanded === r.client_id;
            const submitted = !!r.submitted_at;
            const imagesOk = r.image_count >= MIN_IMAGE_COUNT;
            const voiceOk = r.voice_count >= 1;
            return (
              <div key={r.client_id} className="border-b border-border last:border-b-0">
                <div className="grid grid-cols-[1fr_repeat(6,minmax(0,1fr))_auto] items-center gap-3 px-4 py-3 text-sm">
                  <div>
                    <button
                      className="flex items-center gap-1 text-left font-medium text-foreground hover:underline"
                      onClick={() => setExpanded(open ? null : r.client_id)}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {r.name}
                    </button>
                    <div className="text-xs text-muted-foreground ml-5">{r.brand}</div>
                  </div>
                  <Cell ok={r.has_consent} label={r.has_consent ? "On file" : "Missing"} />
                  <Cell ok={!!r.info_done} label={r.info_done ? "Complete" : "Pending"} />
                  <Cell ok={imagesOk} label={`${r.image_count} / ${MIN_IMAGE_COUNT}+`} />
                  <Cell ok={voiceOk} label={voiceOk ? "Recorded" : "Missing"} />
                  <div className="flex flex-col gap-0.5 text-xs">
                    {r.synced_count > 0 && <span className="text-[hsl(var(--success))]">{r.synced_count} synced</span>}
                    {r.pending_sync_count > 0 && <span className="text-muted-foreground">{r.pending_sync_count} pending</span>}
                    {r.failed_sync_count > 0 && <span className="text-destructive">{r.failed_sync_count} failed</span>}
                    {r.synced_count + r.pending_sync_count + r.failed_sync_count === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs">
                    {r.processed_count > 0 && <span className="text-[hsl(var(--success))]">{r.processed_count} processed</span>}
                    {r.ready_count > 0 && <span className="text-[hsl(var(--primary))]">{r.ready_count} ready</span>}
                    {r.failed_processing_count > 0 && <span className="text-destructive">{r.failed_processing_count} failed</span>}
                    {r.processed_count + r.ready_count + r.failed_processing_count === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Link to={`/onboarding/wizard?clientId=${r.client_id}`}>
                      <Button size="sm" variant="outline">
                        Open wizard <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {open && (
                  <div className="px-9 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <Badge variant="outline">Client status: {r.client_status}</Badge>
                      {submitted ? (
                        <Badge variant="outline" className="text-[hsl(var(--success))]">
                          Submitted {new Date(r.submitted_at!).toLocaleString()}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not yet submitted</Badge>
                      )}
                    </div>
                    <ClientAssetDetail clientId={r.client_id} />
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryDrive.mutate(r.client_id)}
                        disabled={retryDrive.isPending}
                      >
                        {retryDrive.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                        Retry Drive sync
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => stage.mutate(r.client_id)}
                        disabled={stage.isPending || !r.has_consent || !imagesOk || !voiceOk}
                      >
                        {stage.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Mark ready for processing
                      </Button>
                    </div>
                    {!r.has_consent && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> No voice_likeness consent on file — staging blocked.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

function Cell({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`text-xs font-medium ${ok ? "text-[hsl(var(--success))]" : "text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1">
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3 text-destructive" />}
        {label}
      </span>
    </div>
  );
}

function ClientAssetDetail({ clientId }: { clientId: number }) {
  const q = useQuery({
    queryKey: ["client-media-assets", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_media_assets")
        .select("id, kind, filename, drive_sync_status, processing_status, error_message, drive_file_id, duration_seconds")
        .eq("client_id", clientId)
        .order("kind", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading assets…</p>;
  const assets = q.data ?? [];
  if (!assets.length) return <p className="text-xs text-muted-foreground">No assets yet.</p>;

  const failed = assets.filter((a) => a.error_message);
  return (
    <div className="space-y-2">
      {failed.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-1">
          <p className="font-medium text-destructive">Recent failures:</p>
          {failed.map((a) => (
            <p key={a.id} className="text-destructive">
              <span className="font-mono">{a.id.slice(0, 8)}</span> ({a.kind}): {a.error_message}
            </p>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        {assets.length} asset(s).{" "}
        {assets.filter((a) => a.drive_file_id).length} have a Drive id.
      </div>
    </div>
  );
}
