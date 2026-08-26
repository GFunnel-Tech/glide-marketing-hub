import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, ExternalLink, ChevronDown } from "lucide-react";
import { useGhlAudit, ghlAuditScore, ghlAuditToCsv, type GhlAuditAccount } from "@/hooks/useGhlAudit";
import { GhlAuditIssues, ScoreBadge } from "@/components/ghl/GhlAuditIssues";

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "Never");

type Filter = "all" | "issues" | "critical";

export default function GhlAudit() {
  const { data, isLoading, isFetching, refetch } = useGhlAudit();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const accounts = data?.accounts ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts
      .filter((a) => {
        if (needle && !`${a.clientName ?? ""} ${a.locationName ?? ""} ${a.locationId}`.toLowerCase().includes(needle))
          return false;
        if (filter === "issues") return a.issues.length > 0;
        if (filter === "critical") return a.issues.some((i) => i.severity === "critical");
        return true;
      })
      .sort((a, b) => ghlAuditScore(a) - ghlAuditScore(b));
  }, [accounts, q, filter]);

  const totals = useMemo(() => ({
    accounts: accounts.length,
    critical: accounts.filter((a) => a.issues.some((i) => i.severity === "critical")).length,
    unpushedLeads: accounts.reduce((n, a) => n + a.crm.leadsNotInGhl30d, 0),
    overdue: accounts.reduce((n, a) => n + a.pipeline.overdueTasks, 0),
  }), [accounts]);

  const download = () => {
    const blob = new Blob([ghlAuditToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghl-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GoHighLevel audit</h1>
          <p className="text-sm text-muted-foreground">
            Connection health, CRM completeness and follow-up hygiene across every linked sub-account.
            {data?.generatedAt ? ` Generated ${new Date(data.generatedAt).toLocaleString()}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Re-run audit
          </Button>
          <Button size="sm" onClick={download} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Linked sub-accounts", value: totals.accounts },
          { label: "With critical issues", value: totals.critical },
          { label: "Leads not in GHL (30d)", value: totals.unpushedLeads },
          { label: "Overdue GHL tasks", value: totals.overdue },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search client or location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {(["all", "issues", "critical"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "issues" ? "With issues" : "Critical only"}
          </Button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Running audit…
          </div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No sub-accounts match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Last sync</th>
                  <th className="px-4 py-2 text-right">Contacts</th>
                  <th className="px-4 py-2 text-right">Leads not in GHL</th>
                  <th className="px-4 py-2 text-right">Stale opps</th>
                  <th className="px-4 py-2 text-right">Overdue</th>
                  <th className="px-4 py-2">Issues</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a: GhlAuditAccount) => {
                  const isOpen = open === a.clientId;
                  const crit = a.issues.filter((i) => i.severity === "critical").length;
                  const warn = a.issues.filter((i) => i.severity === "warning").length;
                  return (
                    <>
                      <tr
                        key={a.clientId}
                        className="border-t border-border cursor-pointer hover:bg-muted/40"
                        onClick={() => setOpen(isOpen ? null : a.clientId)}
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium text-foreground">{a.clientName ?? `Client #${a.clientId}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.locationName ?? a.locationId} · {a.status ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2"><ScoreBadge score={ghlAuditScore(a)} /></td>
                        <td className="px-4 py-2 text-muted-foreground">{fmt(a.auth.lastContactsSyncAt)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.crm.contacts}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.crm.leadsNotInGhl30d}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.pipeline.staleOpportunities}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.pipeline.overdueTasks}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            {crit > 0 && <Badge variant="destructive" className="text-[10px]">{crit} critical</Badge>}
                            {warn > 0 && <Badge variant="secondary" className="text-[10px]">{warn} warning</Badge>}
                            {!crit && !warn && <Badge variant="outline" className="text-[10px]">Healthy</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${a.clientId}-detail`} className="border-t border-border bg-muted/20">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <p className="text-sm font-semibold text-foreground mb-2">Findings</p>
                                <GhlAuditIssues issues={a.issues} />
                              </div>
                              <div className="text-sm space-y-1">
                                <p><span className="text-muted-foreground">Token:</span> {a.auth.tokenType}</p>
                                <p><span className="text-muted-foreground">Missing email / phone:</span> {a.crm.contactsMissingEmail} / {a.crm.contactsMissingPhone}</p>
                                <p><span className="text-muted-foreground">Contacts without notes:</span> {a.crm.contactsWithoutNotes}</p>
                                <p><span className="text-muted-foreground">Open opportunities:</span> {a.pipeline.openOpportunities} (${Number(a.pipeline.openValue).toLocaleString()})</p>
                                <p><span className="text-muted-foreground">Upcoming appointments:</span> {a.pipeline.upcomingAppointments} · no-shows 60d: {a.pipeline.noShows60d}</p>
                                <div className="flex gap-3 pt-2">
                                  <Link to={`/client/${a.clientId}`} className="text-primary text-sm hover:underline">
                                    Open client profile
                                  </Link>
                                  <a
                                    href={`https://app.gohighlevel.com/v2/location/${a.locationId}/dashboard`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary text-sm hover:underline inline-flex items-center gap-1"
                                  >
                                    Open in GoHighLevel <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
