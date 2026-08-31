import { useEffect, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Download,
  Loader2,
  FileArchive,
  History,
  X,
  ExternalLink,
  Trash2,
  FileText,
  Package,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function jsonBlob(obj: unknown) {
  return new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
}

function slugify(name: string, fallback: string) {
  return (
    String(name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

function readme(client: any, counts: Record<string, number>, scope: any) {
  const lines = [
    `# Client Audit Export`,
    "",
    `- Client: **${client?.name ?? "(unknown)"}**  `,
    `- Client ID: \`${client?.id}\`  `,
    `- Window: last **${scope?.days_window ?? 90} days** of time-series data (since ${scope?.since})  `,
    "",
    "## Layout",
    "",
    "```",
    "manifest.json      # summary (client, scope, row counts)",
    "client.json        # the client record itself",
    "ghl-audit.json     # GoHighLevel account audit (if a sub-account is linked)",
    "data/<table>.json  # one file per table, filtered to this client",
    "```",
    "",
    "## Row counts",
    "",
    ...Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- \`${k}\`: ${v}`),
  ];
  return lines.join("\n");
}

type Artifact = {
  id: string;
  kind: string;
  audience: string;
  file_name: string;
  storage_path: string;
  days_window: number | null;
  findings: number | null;
  defects: number | null;
  tasks_created: number | null;
  summary: string | null;
  is_permanent: boolean;
  expires_at: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Full per-client audit export: every table row belonging to this client, zipped. */
export function ClientAuditExportPanel({
  workspaceId,
  clientId,
  compact = false,
}: {
  workspaceId?: string | null;
  clientId: number;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  async function loadHistory() {
    if (!workspaceId) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("client_audit_artifacts")
      .select(
        "id,kind,audience,file_name,storage_path,days_window,findings,defects,tasks_created,summary,is_permanent,expires_at,created_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load export history");
      console.error("[audit history]", error);
    } else {
      setArtifacts((data as Artifact[]) ?? []);
    }
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen]);

  async function togglePermanent(id: string, value: boolean) {
    setTogglingId(id);
    const { error } = await supabase
      .from("client_audit_artifacts")
      .update({ is_permanent: value })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update retention");
      console.error(error);
    } else {
      setArtifacts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_permanent: value, expires_at: value ? null : a.expires_at } : a)),
      );
      toast.success(value ? "Marked permanent" : "Will expire after 3 months");
    }
    setTogglingId(null);
  }

  async function deleteArtifact(id: string, path: string) {
    setTogglingId(id);
    const { error: storageErr } = await supabase.storage.from("client-reports").remove([path]);
    const { error: dbErr } = await supabase.from("client_audit_artifacts").delete().eq("id", id);
    if (storageErr || dbErr) {
      toast.error("Failed to delete artifact");
      console.error(storageErr, dbErr);
    } else {
      setArtifacts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Artifact deleted");
    }
    setTogglingId(null);
  }

  async function storeZip(blob: Blob, fileName: string) {
    const form = new FormData();
    form.append("clientId", String(clientId));
    form.append("kind", "audit_zip");
    form.append("file", blob, fileName);
    const { data, error } = await supabase.functions.invoke<any>("client-audit-store", {
      body: form,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function handleExport() {
    if (!workspaceId) {
      toast.error("Workspace not loaded yet");
      return;
    }
    setLoading(true);
    setProgress("Reading client…");
    try {
      const { data: head, error: headErr } = await supabase.functions.invoke<any>("workspace-audit-export", {
        body: { workspaceId, clientId, daysWindow: 90, mode: "manifest" },
      });
      if (headErr) throw headErr;
      if (head?.error) throw new Error(head.error);

      const client = (head?.clients ?? [])[0];
      if (!client) throw new Error("Client not found in this workspace");

      const zip = new JSZip();
      const dataFolder = zip.folder("data")!;
      zip.file("client.json", jsonBlob(client));

      const tables: string[] = head.plan?.client_tables ?? [];
      const counts: Record<string, number> = {};
      const BATCH = 6;
      for (let i = 0; i < tables.length; i += BATCH) {
        const slice = tables.slice(i, i + BATCH);
        setProgress(`Fetching data… ${Math.min(i + BATCH, tables.length)}/${tables.length} tables`);
        const { data: part, error: partErr } = await supabase.functions.invoke<any>("workspace-audit-export", {
          body: { workspaceId, clientId, daysWindow: 90, mode: "tables", tables: slice },
        });
        if (partErr) throw partErr;
        if (part?.error) throw new Error(part.error);
        for (const [t, rows] of Object.entries((part?.tables ?? {}) as Record<string, any[]>)) {
          if (!rows.length) continue;
          counts[t] = rows.length;
          dataFolder.file(`${t}.json`, jsonBlob(rows));
        }
      }

      setProgress("Running GHL audit…");
      const { data: ghl } = await (supabase as any).rpc("ghl_account_audit", {
        _workspace_id: workspaceId,
        _client_id: clientId,
      });
      if (ghl) zip.file("ghl-audit.json", jsonBlob(ghl));

      zip.file(
        "manifest.json",
        jsonBlob({
          client: { id: client.id, name: client.name },
          workspace: head.workspace,
          exported_at: head.exported_at,
          exported_by: head.exported_by,
          scope: head.scope,
          counts,
        }),
      );
      zip.file("README.md", new Blob([readme(client, counts, head.scope)], { type: "text/markdown" }));

      setProgress("Compressing…");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const stamp = new Date().toISOString().slice(0, 10);
      const downloadName = `audit-${slugify(client.name, `client-${client.id}`)}-${stamp}.zip`;
      saveAs(blob, downloadName);

      setProgress("Saving to history…");
      await storeZip(blob, downloadName);

      toast.success("Client audit exported and saved to history");
      if (historyOpen) loadHistory();
    } catch (e: any) {
      console.error("[client-audit-export]", e);
      toast.error(e?.message ?? "Export failed");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  const permanentCount = artifacts.filter((a) => a.is_permanent).length;
  const totalCount = artifacts.length;

  const historyDialog = (
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          History
          {totalCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {totalCount}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Audit export history
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Items are kept for 3 months unless marked permanent. Permanent exports are kept indefinitely.
        </p>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          {historyLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : artifacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <FileArchive className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No audit exports yet.</p>
              <p className="text-xs text-muted-foreground">
                Run a full client audit or account audit to build history.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {artifacts.map((a) => {
                const remaining = daysUntil(a.expires_at);
                const isPdf = a.kind === "audit_pdf";
                return (
                  <div
                    key={a.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className={cn("rounded-md p-2 mt-0.5", isPdf ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600")}>
                          {isPdf ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(a.created_at)} · {isPdf ? "PDF audit" : "ZIP export"}
                            {a.audience === "client" && " · Client-facing"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            const { data, error } = await supabase.storage
                              .from("client-reports")
                              .createSignedUrl(a.storage_path, 60 * 60);
                            if (error || !data?.signedUrl) {
                              toast.error("Could not create download link");
                              return;
                            }
                            window.open(data.signedUrl, "_blank", "noopener");
                          }}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteArtifact(a.id, a.storage_path)}
                          disabled={togglingId === a.id}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          title="Delete now"
                        >
                          {togglingId === a.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {(a.findings || a.defects || a.tasks_created) && (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {a.findings !== null && a.findings > 0 && (
                          <span>
                            <strong className="text-foreground">{a.findings}</strong> findings
                          </span>
                        )}
                        {a.defects !== null && a.defects > 0 && (
                          <span>
                            <strong className="text-foreground">{a.defects}</strong> defects
                          </span>
                        )}
                        {a.tasks_created !== null && a.tasks_created > 0 && (
                          <span>
                            <strong className="text-foreground">{a.tasks_created}</strong> tasks
                          </span>
                        )}
                        {a.days_window && <span>{a.days_window}d window</span>}
                      </div>
                    )}

                    {a.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.summary}</p>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {a.is_permanent ? (
                          <>
                            <Lock className="h-3 w-3" /> Permanent
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3 w-3" /> Expires in {remaining ?? 0} days
                          </>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <Switch
                          checked={a.is_permanent}
                          onCheckedChange={(v) => togglePermanent(a.id, v)}
                          disabled={togglingId === a.id}
                        />
                        Keep permanent
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? progress || "Exporting…" : "Export audit"}
        </button>
        {historyDialog}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileArchive className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-foreground">Full client audit export</h3>
            {historyDialog}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a ZIP with everything on record for this client — campaigns, ads, insights (last
            90 days), leads from every source, GHL contacts, notes, tasks, appointments and pipeline,
            reports, KPIs, guarantees, billing and AI activity — plus a GoHighLevel account audit.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Exporting…" : "Export full audit (.zip)"}
        </button>
        {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
      </div>
    </div>
  );
}

export default ClientAuditExportPanel;
