import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Download, Loader2, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

type AuditResponse = {
  workspace: any;
  exported_at: string;
  exported_by: string;
  scope: { days_window: number; since: string };
  counts: Record<string, number>;
  tables: Record<string, any[]>;
  clients: Array<{ id: number; name: string; slug: string; record: any; data: Record<string, any[]> }>;
};

function jsonBlob(obj: unknown) {
  return new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
}

function readme(payload: AuditResponse) {
  const lines: string[] = [];
  lines.push(`# Workspace Audit Export`);
  lines.push("");
  lines.push(`- Workspace: **${payload.workspace?.name ?? "(unknown)"}**  `);
  lines.push(`- Workspace ID: \`${payload.workspace?.id ?? ""}\`  `);
  lines.push(`- Exported at: ${payload.exported_at}  `);
  lines.push(`- Window: last **${payload.scope.days_window} days** of time-series data (since ${payload.scope.since})  `);
  lines.push(`- Clients included: **${payload.clients.length}**`);
  lines.push("");
  lines.push(`## Layout`);
  lines.push("");
  lines.push("```");
  lines.push("manifest.json           # top-level summary (workspace, scope, counts)");
  lines.push("tables/<table>.json     # one file per database table (workspace-scoped)");
  lines.push("clients/<slug>/         # per-client folder");
  lines.push("  client.json           # the client row itself");
  lines.push("  <table>.json          # rows from each table that belong to this client");
  lines.push("```");
  lines.push("");
  lines.push(`## Use with Claude Code / LLMs`);
  lines.push("");
  lines.push("Each JSON file is a plain array of rows (or a single object for `client.json`).");
  lines.push("Drop the unzipped folder into your project and reference files directly. Start with");
  lines.push("`manifest.json` for an index of what's available and row counts.");
  lines.push("");
  lines.push(`## Row counts`);
  lines.push("");
  const sorted = Object.entries(payload.counts).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) lines.push(`- \`${k}\`: ${v}`);
  return lines.join("\n");
}

export function AuditExportPanel() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  async function handleExport() {
    if (!currentWorkspace) {
      toast.error("No workspace selected");
      return;
    }
    setLoading(true);
    setProgress("Reading workspace…");
    try {
      // 1) Manifest: workspace + clients + which tables to pull.
      const { data: head, error: headErr } = await supabase.functions.invoke<any>("workspace-audit-export", {
        body: { workspaceId: currentWorkspace.id, daysWindow: 90, mode: "manifest" },
      });
      if (headErr) throw headErr;
      if (!head) throw new Error("Empty response");
      if (head.error) throw new Error(head.error);

      const zip = new JSZip();
      const tablesFolder = zip.folder("tables")!;
      const clientsFolder = zip.folder("clients")!;

      const clientRows: any[] = head.clients ?? [];
      const slugFor = (() => {
        const used = new Map<string, number>();
        return (c: any) => {
          let slug =
            String(c.name ?? `client-${c.id}`)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 60) || `client-${c.id}`;
          const seen = used.get(slug) ?? 0;
          used.set(slug, seen + 1);
          if (seen > 0) slug = `${slug}-${c.id}`;
          return slug;
        };
      })();
      const clientMeta = clientRows.map((c) => ({ id: c.id, name: c.name, slug: slugFor(c), record: c }));
      const folderById = new Map<number, JSZip>();
      for (const c of clientMeta) {
        const folder = clientsFolder.folder(c.slug)!;
        folder.file("client.json", jsonBlob(c.record));
        folderById.set(c.id, folder);
      }
      tablesFolder.file("clients.json", jsonBlob(clientRows));

      // 2) Pull the remaining tables in small batches so no single response is huge.
      const allTables: string[] = [...(head.plan?.workspace_tables ?? []), ...(head.plan?.client_tables ?? [])];
      const counts: Record<string, number> = { clients: clientRows.length };
      const BATCH = 6;
      for (let i = 0; i < allTables.length; i += BATCH) {
        const slice = allTables.slice(i, i + BATCH);
        setProgress(`Fetching data… ${Math.min(i + BATCH, allTables.length)}/${allTables.length} tables`);
        const { data: part, error: partErr } = await supabase.functions.invoke<any>("workspace-audit-export", {
          body: { workspaceId: currentWorkspace.id, daysWindow: 90, mode: "tables", tables: slice },
        });
        if (partErr) throw partErr;
        if (part?.error) throw new Error(part.error);
        for (const [t, rows] of Object.entries((part?.tables ?? {}) as Record<string, any[]>)) {
          counts[t] = rows.length;
          tablesFolder.file(`${t}.json`, jsonBlob(rows));
          if (!rows.length || !("client_id" in rows[0])) continue;
          const grouped = new Map<number, any[]>();
          for (const row of rows) {
            const cid = (row as any).client_id;
            if (!cid || !folderById.has(cid)) continue;
            const arr = grouped.get(cid) ?? [];
            arr.push(row);
            grouped.set(cid, arr);
          }
          for (const [cid, arr] of grouped) folderById.get(cid)!.file(`${t}.json`, jsonBlob(arr));
        }
      }

      const summary: AuditResponse = {
        workspace: head.workspace,
        exported_at: head.exported_at,
        exported_by: head.exported_by,
        scope: head.scope,
        counts,
        tables: {},
        clients: clientMeta.map((c) => ({ id: c.id, name: c.name, slug: c.slug, record: c.record, data: {} })),
      };
      zip.file(
        "manifest.json",
        jsonBlob({
          workspace: head.workspace,
          exported_at: head.exported_at,
          exported_by: head.exported_by,
          scope: head.scope,
          counts,
          client_index: clientMeta.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        }),
      );
      zip.file("README.md", new Blob([readme(summary)], { type: "text/markdown" }));

      setProgress("Compressing…");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const wsSlug =
        (head.workspace?.name ?? "workspace")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "workspace";
      const stamp = new Date().toISOString().slice(0, 10);
      saveAs(blob, `audit-${wsSlug}-${stamp}.zip`);

      toast.success("Audit export downloaded");
    } catch (e: any) {
      console.error("[audit-export]", e);
      toast.error(e?.message ?? "Export failed");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileArchive className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">Complete account audit export</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a ZIP containing every table for this workspace as JSON, plus a folder per client
            with their campaigns, ads, leads, insights, notes and reports. Designed to drop straight
            into Claude Code or any LLM workflow. Time-series data is capped at the last 90 days to keep
            the file workable.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={loading || !currentWorkspace}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Exporting…" : "Export full audit (.zip)"}
        </button>
        {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        Includes: workspace settings, clients, campaigns, ads, ad accounts, Meta insights (90d),
        leads from all sources, GHL appointments &amp; opportunities, notes &amp; tasks, KPIs,
        guarantees, AI insights &amp; audit log, reports, briefs, billing, wallets, tracking, more.
      </p>
    </div>
  );
}

export default AuditExportPanel;
