import { Badge } from "@/components/ui/badge";
import { Loader2, StickyNote, CheckSquare, UserRound } from "lucide-react";
import { useGhlContactForLead, useGhlContactActivity } from "@/hooks/useGhlCrm";

/** Read-only GHL CRM context for a lead: contact, tags, notes and tasks. */
export function GhlContactCard({
  lead,
}: {
  lead: { id?: string; ghl_contact_id?: string | null; email?: string | null; phone?: string | null; client_id?: number | null } | null;
}) {
  const contactQ = useGhlContactForLead(lead);
  const contact = contactQ.data ?? null;
  const activityQ = useGhlContactActivity(contact?.id);

  if (!lead) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        GoHighLevel
      </h3>

      {contactQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking up contact…
        </div>
      ) : !contact ? (
        <p className="text-sm text-muted-foreground">
          No matching GHL contact synced yet.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {contact.full_name || "Unnamed contact"}
              </span>
              {contact.dnd && <Badge variant="destructive" className="text-[10px]">DND</Badge>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {contact.source ? `Source: ${contact.source} · ` : ""}
              {contact.date_added ? `Added ${new Date(contact.date_added).toLocaleDateString()}` : ""}
            </div>
            {contact.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {activityQ.data && (
            <>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <StickyNote className="h-3 w-3" /> Notes ({activityQ.data.notes.length})
                </div>
                {activityQ.data.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes in GHL.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activityQ.data.notes.slice(0, 5).map((n) => (
                      <div key={n.id} className="rounded-md border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">
                          {n.date_added ? new Date(n.date_added).toLocaleString() : "—"}
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                          {n.body || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <CheckSquare className="h-3 w-3" /> Tasks ({activityQ.data.tasks.length})
                </div>
                {activityQ.data.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks in GHL.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activityQ.data.tasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2">
                        <div>
                          <div className="text-sm text-foreground">{t.title || "Task"}</div>
                          {t.due_date && (
                            <div className="text-[11px] text-muted-foreground">
                              Due {new Date(t.due_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <Badge variant={t.completed ? "secondary" : "outline"} className="text-[10px]">
                          {t.completed ? "Done" : "Open"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
