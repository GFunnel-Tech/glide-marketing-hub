import { usePortalClient } from "@/hooks/usePortalClient";
import { useClientRequests } from "@/hooks/useClientRequests";
import { RequestCampaignDialog } from "@/components/portal/RequestCampaignDialog";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  in_review: "bg-warning/10 text-warning",
  scheduled: "bg-primary/10 text-primary",
  launched: "bg-success/10 text-success",
  declined: "bg-destructive/10 text-destructive",
};

export default function PortalRequests() {
  const { clientId } = usePortalClient();
  const { data: reqs = [], isLoading } = useClientRequests("campaign", clientId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Campaign Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request a new campaign, scale existing ones, or ask for creative refreshes. Your account manager sees these instantly.
          </p>
        </div>
        <RequestCampaignDialog clientId={clientId} />
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : reqs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No requests yet — click "Request a Campaign" to send your first one.
          </div>
        ) : (
          reqs.map((r: any) => (
            <div key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.objective}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.type.replace(/_/g, " ")}
                    {r.budget ? <> · ${Number(r.budget).toLocaleString()}/mo</> : null}
                    {r.target_audience ? <> · {r.target_audience}</> : null}
                  </p>
                  {r.creative_notes && <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{r.creative_notes}</p>}
                  {r.agency_response && (
                    <div className="mt-3 rounded-md bg-muted/50 border border-border p-3 text-sm">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Agency response</p>
                      {r.agency_response}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide", STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground")}>
                    {r.status}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
