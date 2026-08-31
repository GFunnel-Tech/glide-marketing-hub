import { useState } from "react";
import { FileSearch, Loader2, ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Result = {
  pdfUrl: string | null;
  tasksCreated: number;
  findings: number;
  defects: number;
  summary: string;
};

const WINDOWS = [30, 60, 90, 180] as const;

/** Generates the analyst-style account audit PDF and opens tasks for each finding. */
export function ClientAuditReportPanel({
  clientId,
  clientName,
}: {
  clientId: number;
  clientName?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<number>(90);
  const [createTasks, setCreateTasks] = useState(true);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<any>("client-audit-generate", {
        body: { clientId, daysWindow: days, createTasks },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({
        pdfUrl: data.pdfUrl ?? null,
        tasksCreated: data.tasksCreated ?? 0,
        findings: data.findings ?? 0,
        defects: data.defects ?? 0,
        summary: data.summary ?? "",
      });
      toast.success(
        `Audit ready — ${data.findings ?? 0} findings${data.tasksCreated ? `, ${data.tasksCreated} tasks assigned` : ""}`,
      );
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e: any) {
      console.error("[client-audit]", e);
      toast.error(e?.message ?? "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">Account audit</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A written audit of {clientName || "this client"} — paid media and CPL decomposition, compliance
            flags, lead quality and form design, CRM sync integrity, speed to first contact, pipeline and
            appointment discipline — with a ranked findings list and defect register, rendered as a branded PDF.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 text-xs font-medium ${
                days === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={createTasks}
            onChange={(e) => setCreateTasks(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Assign tasks from findings
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          {loading ? "Running audit…" : "Run account audit"}
        </button>
        {result?.pdfUrl && (
          <a
            href={result.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Open PDF <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">
          Reading spend, leads, form answers, CRM contacts, notes, appointments and pipeline, then writing the
          report. This usually takes 30–60 seconds.
        </p>
      )}

      {result && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{result.findings}</strong> findings</span>
            <span><strong className="text-foreground">{result.defects}</strong> defects detected</span>
            <span><strong className="text-foreground">{result.tasksCreated}</strong> tasks assigned</span>
          </div>
          {result.summary && <p className="text-sm text-foreground">{result.summary}</p>}
        </div>
      )}
    </div>
  );
}

export default ClientAuditReportPanel;
