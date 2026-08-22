import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckSquare, StickyNote, CalendarDays, Loader2 } from "lucide-react";

type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  source: string | null;
  date_added: string | null;
};

const digits = (v?: string | null) => (v ?? "").replace(/\D+/g, "");
const last10 = (v?: string | null) => {
  const d = digits(v);
  return d.length >= 10 ? d.slice(-10) : "";
};

/** Portal leads view: Meta leads enriched with the client's GoHighLevel CRM record. */
export default function PortalLeads() {
  const { clientId } = usePortalClient();
  const [openContact, setOpenContact] = useState<Contact | null>(null);

  const leads = useQuery({
    queryKey: ["portal-leads", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_leads")
        .select("id,full_name,email,phone,created_time,stage,campaign_name,form_name,sync_status")
        .eq("client_id", clientId!)
        .order("created_time", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const contacts = useQuery({
    queryKey: ["portal-ghl-contacts", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Contact[]> => {
      const { data } = await (supabase as any)
        .from("ghl_contacts")
        .select("id, full_name, email, phone, tags, source, date_added")
        .eq("client_id", clientId!)
        .order("date_added", { ascending: false, nullsFirst: false })
        .limit(500);
      return (data ?? []) as Contact[];
    },
  });

  const appointments = useQuery({
    queryKey: ["portal-ghl-appts", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ghl_appointments")
        .select("id, title, start_time, status, calendar_name, contact_id")
        .eq("client_id", clientId!)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  // Index GHL contacts by email and phone so lead rows can show CRM tags.
  const index = useMemo(() => {
    const byEmail = new Map<string, Contact>();
    const byPhone = new Map<string, Contact>();
    for (const c of contacts.data ?? []) {
      if (c.email) byEmail.set(c.email.trim().toLowerCase(), c);
      const p = last10(c.phone);
      if (p) byPhone.set(p, c);
    }
    return { byEmail, byPhone };
  }, [contacts.data]);

  const matchContact = (l: any): Contact | null =>
    (l.email ? index.byEmail.get(String(l.email).trim().toLowerCase()) : undefined) ??
    (last10(l.phone) ? index.byPhone.get(last10(l.phone)) : undefined) ??
    null;

  const rows = leads.data ?? [];
  const counts = {
    total: rows.length,
    new: rows.filter((r: any) => r.stage === "intake").length,
    contacts: contacts.data?.length ?? 0,
    appts: appointments.data?.length ?? 0,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Leads &amp; CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every lead that's come in, plus the tags, notes, tasks and appointments from your CRM.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Total leads", v: counts.total },
          { l: "New", v: counts.new },
          { l: "CRM contacts", v: counts.contacts },
          { l: "Upcoming appts", v: counts.appts },
        ].map((m) => (
          <Card key={m.l} className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.l}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{m.v}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="contacts">CRM contacts</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Submitted</th>
                    <th className="px-4 py-2">Campaign</th>
                    <th className="px-4 py-2">Stage</th>
                    <th className="px-4 py-2">CRM tags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l: any) => {
                    const c = matchContact(l);
                    return (
                      <tr
                        key={l.id}
                        className={`border-t border-border ${c ? "cursor-pointer hover:bg-muted/40" : ""}`}
                        onClick={() => c && setOpenContact(c)}
                      >
                        <td className="px-4 py-2 font-medium">{l.full_name ?? c?.full_name ?? "—"}</td>
                        <td className="px-4 py-2 text-xs">
                          <div>{l.email ?? ""}</div>
                          <div className="text-muted-foreground">{l.phone ?? ""}</div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground tabular-nums">
                          {l.created_time ? new Date(l.created_time).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{l.campaign_name ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l.stage}</span>
                        </td>
                        <td className="px-4 py-2">
                          {c ? (
                            <div className="flex flex-wrap gap-1">
                              {(c.tags ?? []).slice(0, 3).map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                              ))}
                              {!c.tags?.length && <span className="text-xs text-muted-foreground">In CRM</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No leads yet — your campaigns will start delivering soon.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card className="p-0 overflow-hidden">
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
                  {(contacts.data ?? []).map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenContact(c)}
                    >
                      <td className="px-4 py-2 font-medium">{c.full_name || "—"}</td>
                      <td className="px-4 py-2 text-xs">
                        <div>{c.email ?? ""}</div>
                        <div className="text-muted-foreground">{c.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{c.source ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags ?? []).slice(0, 4).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {c.date_added ? new Date(c.date_added).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                  {!contacts.data?.length && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
                      {contacts.isLoading ? "Loading…" : "No CRM contacts synced yet."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Card className="p-4">
            {!appointments.data?.length ? (
              <p className="text-sm text-muted-foreground">Nothing booked yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {appointments.data.map((a) => (
                  <div key={a.id} className="py-2 flex items-start gap-2">
                    <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-sm">{a.title || "Appointment"}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.start_time ? new Date(a.start_time).toLocaleString() : "—"}
                        {a.calendar_name ? ` · ${a.calendar_name}` : ""}
                        {a.status ? ` · ${a.status}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ContactSheet contact={openContact} onClose={() => setOpenContact(null)} />
    </div>
  );
}

function ContactSheet({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const activity = useQuery({
    queryKey: ["portal-ghl-activity", contact?.id],
    enabled: !!contact?.id,
    queryFn: async () => {
      const [n, t] = await Promise.all([
        (supabase as any)
          .from("ghl_contact_notes")
          .select("id, body, created_by, date_added")
          .eq("contact_id", contact!.id)
          .order("date_added", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("ghl_contact_tasks")
          .select("id, title, body, due_date, completed")
          .eq("contact_id", contact!.id)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(50),
      ]);
      return { notes: (n.data ?? []) as any[], tasks: (t.data ?? []) as any[] };
    },
  });

  return (
    <Sheet open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact?.full_name || "Contact"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          <div className="space-y-1">
            <div>{contact?.email ?? "—"}</div>
            <div className="text-muted-foreground">{contact?.phone ?? "—"}</div>
            <div className="flex flex-wrap gap-1 pt-1">
              {(contact?.tags ?? []).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          </div>

          {activity.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
            </div>
          )}

          <div>
            <p className="font-semibold flex items-center gap-1.5 mb-2">
              <StickyNote className="h-4 w-4" /> Notes
            </p>
            {!activity.data?.notes.length ? (
              <p className="text-muted-foreground text-sm">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {activity.data.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border p-3">
                    <p className="whitespace-pre-wrap">{n.body || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.date_added ? new Date(n.date_added).toLocaleString() : ""}
                      {n.created_by ? ` · ${n.created_by}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="font-semibold flex items-center gap-1.5 mb-2">
              <CheckSquare className="h-4 w-4" /> Tasks
            </p>
            {!activity.data?.tasks.length ? (
              <p className="text-muted-foreground text-sm">No tasks yet.</p>
            ) : (
              <div className="space-y-2">
                {activity.data.tasks.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{t.title || "Task"}</span>
                      <Badge variant={t.completed ? "secondary" : "outline"} className="text-[10px]">
                        {t.completed ? "Done" : "Open"}
                      </Badge>
                    </div>
                    {t.body && <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{t.body}</p>}
                    {t.due_date && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due {new Date(t.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
