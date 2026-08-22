import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Users, CheckSquare, CalendarDays, GitBranch } from "lucide-react";
import { useGhlClientSummary, useGhlPipelines, useRunGhlSync } from "@/hooks/useGhlCrm";

/** GHL CRM overview for a single client: contacts, pipelines, tasks, appointments. */
export function ClientGhlPanel({ clientId, locationId }: { clientId: number; locationId?: string | null }) {
  const summary = useGhlClientSummary(clientId);
  const pipelines = useGhlPipelines(clientId);
  const runSync = useRunGhlSync();

  if (!locationId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        This client isn't linked to a GoHighLevel sub-account yet. Link a location in the
        Integrations tab to pull in contacts, notes, pipelines and appointments.
      </Card>
    );
  }

  const s = summary.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">GoHighLevel CRM</p>
          <p className="text-xs text-muted-foreground">
            Location {locationId}
            {s?.lastSyncAt ? ` · last synced ${new Date(s.lastSyncAt).toLocaleString()}` : " · never synced"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => runSync.mutate({ clientId })}
            disabled={runSync.isPending}
          >
            {runSync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Sync now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => runSync.mutate({ clientId, full: true })}
            disabled={runSync.isPending}
          >
            Full resync
          </Button>
        </div>
      </div>

      {s?.lastError && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Last sync error: {s.lastError}
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Contacts", value: s?.contactCount ?? 0 },
          { icon: CheckSquare, label: "Open GHL tasks", value: s?.openTaskCount ?? 0 },
          { icon: GitBranch, label: "Pipelines", value: pipelines.data?.pipelines.length ?? 0 },
          { icon: CalendarDays, label: "Upcoming appts", value: s?.upcoming.length ?? 0 },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Pipelines &amp; stages</p>
          {pipelines.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !pipelines.data?.pipelines.length ? (
            <p className="text-sm text-muted-foreground">No pipelines synced yet — run a sync.</p>
          ) : (
            <div className="space-y-3">
              {pipelines.data.pipelines.map((p) => (
                <div key={p.id}>
                  <div className="text-sm font-medium text-foreground">{p.name || p.id}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pipelines.data!.stages
                      .filter((st) => st.pipeline_id === p.id)
                      .map((st) => (
                        <Badge key={st.id} variant="secondary" className="text-[10px]">
                          {st.name || st.id}
                        </Badge>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Upcoming appointments</p>
          {!s?.upcoming.length ? (
            <p className="text-sm text-muted-foreground">Nothing booked in the calendar window.</p>
          ) : (
            <div className="divide-y divide-border">
              {s.upcoming.map((a: any) => (
                <div key={a.id} className="py-2">
                  <div className="text-sm text-foreground">{a.title || "Appointment"}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.start_time ? new Date(a.start_time).toLocaleString() : "—"}
                    {a.calendar_name ? ` · ${a.calendar_name}` : ""}
                    {a.assigned_user_name ? ` · ${a.assigned_user_name}` : ""}
                    {a.status ? ` · ${a.status}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Recent contacts</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {(s?.recentContacts ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-foreground">{c.full_name || "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    <div>{c.email ?? ""}</div>
                    <div className="text-muted-foreground">{c.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.source ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).slice(0, 3).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground tabular-nums">
                    {c.date_added ? new Date(c.date_added).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {!s?.recentContacts?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No contacts synced yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
