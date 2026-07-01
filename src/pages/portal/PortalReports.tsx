import { usePortalClient } from "@/hooks/usePortalClient";
import { useClientRequests, useCreateClientRequest } from "@/hooks/useClientRequests";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function PortalReports() {
  const { clientId } = usePortalClient();
  const { data: reqs = [], isLoading } = useClientRequests("report", clientId);
  const create = useCreateClientRequest("report", clientId);

  async function requestNew() {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    try {
      await create.mutateAsync({
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
        format: "pdf",
      });
      toast.success("Report requested — you'll get an email when it's ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download performance reports or request a new one.
          </p>
        </div>
        <Button onClick={requestNew} disabled={create.isPending}>Generate this month's report</Button>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : reqs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No reports yet.</div>
        ) : (
          reqs.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {r.period_start} → {r.period_end} · {r.format.toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Requested {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                  r.status === "ready" ? "bg-success/10 text-success" :
                  r.status === "failed" ? "bg-destructive/10 text-destructive" :
                  "bg-primary/10 text-primary",
                )}>{r.status}</span>
                {r.file_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={r.file_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1.5" /> Download</a>
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
