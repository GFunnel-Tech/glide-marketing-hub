import { useClientRequests, useUpdateClientRequest, RequestKind } from "@/hooks/useClientRequests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, FileText, Plug } from "lucide-react";
import { toast } from "sonner";

const KINDS: { key: RequestKind; label: string; Icon: any }[] = [
  { key: "campaign", label: "Campaign Requests", Icon: Sparkles },
  { key: "report", label: "Report Requests", Icon: FileText },
  { key: "integration", label: "Integration Requests", Icon: Plug },
];

const STATUS_OPTIONS: Record<RequestKind, string[]> = {
  campaign: ["new", "in_review", "scheduled", "launched", "declined"],
  report: ["new", "in_progress", "ready", "failed"],
  integration: ["new", "in_progress", "done", "blocked"],
};

export function ClientRequestsPanel({ clientId }: { clientId: number }) {
  return (
    <div className="space-y-6">
      {KINDS.map((k) => <RequestSection key={k.key} clientId={clientId} kind={k.key} label={k.label} Icon={k.Icon} />)}
    </div>
  );
}

function RequestSection({ clientId, kind, label, Icon }: { clientId: number; kind: RequestKind; label: string; Icon: any }) {
  const { data: reqs = [], isLoading } = useClientRequests(kind, clientId);
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {label}</h3>
        <span className="text-xs text-muted-foreground">{reqs.length}</span>
      </header>
      <div className="divide-y divide-border">
        {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          : reqs.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No requests.</div>
          : reqs.map((r: any) => <RequestRow key={r.id} req={r} kind={kind} clientId={clientId} />)}
      </div>
    </section>
  );
}

function RequestRow({ req, kind, clientId }: { req: any; kind: RequestKind; clientId: number }) {
  const update = useUpdateClientRequest(kind, clientId);
  const [response, setResponse] = useState(req.agency_response ?? "");
  const [status, setStatus] = useState(req.status);
  async function save() {
    try {
      await update.mutateAsync({ id: req.id, patch: { status, ...(kind !== "report" ? { agency_response: response } : {}) } });
      toast.success("Updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {kind === "campaign" ? req.objective
              : kind === "report" ? `${req.period_start} → ${req.period_end}`
              : req.provider}
          </p>
          {req.creative_notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{req.creative_notes}</p>}
          {req.credentials_note && <p className="text-xs text-muted-foreground mt-1">{req.credentials_note}</p>}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          {STATUS_OPTIONS[kind].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {kind !== "report" && (
          <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} placeholder="Reply to client…" className="flex-1 min-w-[200px]" />
        )}
        <Button size="sm" onClick={save} disabled={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
