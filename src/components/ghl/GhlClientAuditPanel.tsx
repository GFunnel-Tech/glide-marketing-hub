import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Download } from "lucide-react";
import { useGhlAudit, ghlAuditScore, ghlAuditToCsv } from "@/hooks/useGhlAudit";
import { GhlAuditIssues, ScoreBadge } from "./GhlAuditIssues";

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "Never");

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Per-client GoHighLevel audit: connection health, data completeness, follow-up hygiene. */
export function GhlClientAuditPanel({ clientId }: { clientId: number }) {
  const { data, isLoading, isFetching, refetch } = useGhlAudit(clientId);
  const account = data?.accounts?.[0];

  const download = () => {
    if (!account) return;
    const blob = new Blob([ghlAuditToCsv([account])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghl-audit-${account.clientName ?? account.clientId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Running GHL audit…
      </Card>
    );
  }
  if (!account) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No GoHighLevel sub-account linked to this client, so there is nothing to audit yet.
      </Card>
    );
  }

  const score = ghlAuditScore(account);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">GHL account audit</p>
          <ScoreBadge score={score} />
          <span className="text-xs text-muted-foreground">
            {account.auth.tokenType} · last sync {fmtDate(account.auth.lastContactsSyncAt)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Re-run
          </Button>
          <Button size="sm" variant="ghost" onClick={download}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Contacts" value={account.crm.contacts} />
        <Stat label="Leads not in GHL (30d)" value={account.crm.leadsNotInGhl30d} />
        <Stat label="Stale opportunities" value={account.pipeline.staleOpportunities} />
        <Stat label="Overdue tasks" value={account.pipeline.overdueTasks} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Findings</p>
          <GhlAuditIssues issues={account.issues} />
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Details</p>
          <dl className="space-y-1.5 text-sm">
            {[
              ["Location", `${account.locationName ?? "—"} (${account.locationId})`],
              ["Token", account.auth.hasToken ? account.auth.tokenType : "Missing"],
              ["Last run", fmtDate(account.auth.lastRunAt)],
              ["Last appointments sync", fmtDate(account.auth.lastApptsSyncAt)],
              ["Contacts missing email / phone", `${account.crm.contactsMissingEmail} / ${account.crm.contactsMissingPhone}`],
              ["Contacts without notes", account.crm.contactsWithoutNotes],
              ["Pipelines", account.pipeline.pipelines],
              ["Open opportunities", `${account.pipeline.openOpportunities} · $${Number(account.pipeline.openValue).toLocaleString()}`],
              ["Upcoming appointments", account.pipeline.upcomingAppointments],
              ["No-shows (60d)", account.pipeline.noShows60d],
              ["Lead sync errors (30d)", account.crm.leadSyncErrors30d],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 border-b border-border/60 pb-1 last:border-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right text-foreground tabular-nums">{v as any}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
