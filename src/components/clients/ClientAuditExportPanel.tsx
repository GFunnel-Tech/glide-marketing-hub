import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Download, Loader2, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
      saveAs(blob, `audit-${slugify(client.name, `client-${client.id}`)}-${stamp}.zip`);
      toast.success("Client audit exported");
    } catch (e: any) {
      console.error("[client-audit-export]", e);
      toast.error(e?.message ?? "Export failed");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {loading ? progress || "Exporting…" : "Export audit"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileArchive className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">Full client audit export</h3>
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
