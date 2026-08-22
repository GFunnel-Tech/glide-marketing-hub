import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Mail, Phone, Save, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChannelLead, LeadChannel, LeadStage } from "@/hooks/useChannelLeads";
import { useUpdateLead } from "@/hooks/useChannelLeads";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GhlContactCard } from "@/components/ghl/GhlContactCard";


const STAGES: { value: LeadStage; label: string }[] = [
  { value: "intake", label: "Intake" },
  { value: "in_progress", label: "In Progress" },
  { value: "converted", label: "Converted" },
];

interface FormQuestion {
  key?: string;
  label?: string;
  type?: string;
  options?: { key?: string; value?: string }[];
}
interface MetaForm {
  id: string;
  name?: string;
  status?: string;
  locale?: string;
  questions?: FormQuestion[];
  privacy_policy?: { url?: string; link_text?: string };
  thank_you_page?: { title?: string; body?: string; button_text?: string; website_url?: string };
  context_card?: { title?: string; content?: string[] | string; style?: string };
  page?: { id?: string; name?: string };
}

export function LeadDetailDrawer({
  channel,
  lead,
  onOpenChange,
}: {
  channel: LeadChannel;
  lead: ChannelLead | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateLead(channel);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<LeadStage>("intake");
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState<MetaForm | null>(null);

  useEffect(() => {
    setNote(lead?.note ?? "");
    setStage(lead?.stage ?? "intake");
    setForm(null);
  }, [lead?.id]);

  const dirty = lead ? note !== (lead.note ?? "") || stage !== lead.stage : false;

  const save = () => {
    if (!lead) return;
    update.mutate(
      { id: lead.id, patch: { note, stage } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const openForm = async () => {
    if (!lead?.form_id) {
      toast.error("This lead has no form id on record");
      return;
    }
    setFormOpen(true);
    if (form?.id === lead.form_id) return;
    setFormLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-form-preview", {
        body: { formId: lead.form_id, workspaceId: lead.workspace_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setForm((data as any)?.form ?? null);
    } catch (e: any) {
      toast.error(e?.message || "Could not load form");
      setFormOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <>
      <Sheet open={!!lead} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {lead && (
            <>
              <SheetHeader>
                <SheetTitle className="text-foreground">{lead.full_name || "Unnamed lead"}</SheetTitle>
                <SheetDescription>
                  {lead.created_time ? new Date(lead.created_time).toLocaleString() : "—"}
                  {lead.campaign_name && ` · ${lead.campaign_name}`}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="flex flex-wrap gap-2 text-xs">
                  {lead.email && (
                    <Badge variant="outline" className="gap-1">
                      <Mail className="h-3 w-3" /> {lead.email}
                    </Badge>
                  )}
                  {lead.phone && (
                    <Badge variant="outline" className="gap-1">
                      <Phone className="h-3 w-3" /> {lead.phone}
                    </Badge>
                  )}
                  {lead.form_name && <Badge variant="secondary">{lead.form_name}</Badge>}
                </div>

                {channel === "meta" && lead.form_id && (
                  <Button variant="outline" size="sm" onClick={openForm} className="gap-1.5">
                    <FileText className="h-4 w-4" /> View form
                  </Button>
                )}

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</label>
                  <Select value={stage} onValueChange={(v) => setStage(v as LeadStage)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="Internal notes about this lead…"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Form answers</h3>
                  {lead.field_data && lead.field_data.length > 0 ? (
                    <div className="rounded-md border border-border divide-y divide-border">
                      {lead.field_data.map((f, i) => (
                        <div key={i} className="px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.name}</div>
                          <div className="text-sm text-foreground break-words">{f.values?.join(", ") || "—"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No form answers captured.</p>
                  )}
                </div>

                <GhlContactCard lead={lead as any} />



                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                  <Button onClick={save} disabled={!dirty || update.isPending}>
                    <Save className="h-4 w-4 mr-1.5" /> Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.name || lead?.form_name || "Lead form"}</DialogTitle>
            <DialogDescription>
              {form?.page?.name ? `${form.page.name} · ` : ""}
              {form?.status ? `${form.status} · ` : ""}
              Form ID {lead?.form_id}
            </DialogDescription>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading form…
            </div>
          ) : form ? (
            <div className="space-y-5">
              {form.context_card && (form.context_card.title || form.context_card.content) && (
                <section className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Intro card</div>
                  {form.context_card.title && (
                    <div className="font-medium text-foreground">{form.context_card.title}</div>
                  )}
                  {Array.isArray(form.context_card.content) ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-foreground/90">
                      {form.context_card.content.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  ) : form.context_card.content ? (
                    <p className="mt-1 text-sm text-foreground/90">{form.context_card.content}</p>
                  ) : null}
                </section>
              )}

              <section>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Questions ({form.questions?.length ?? 0})
                </div>
                {form.questions && form.questions.length > 0 ? (
                  <ol className="space-y-2">
                    {form.questions.map((q, i) => (
                      <li key={i} className="rounded-md border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">
                            {i + 1}. {q.label || q.key}
                          </div>
                          {q.type && (
                            <Badge variant="outline" className="text-[10px] uppercase">{q.type}</Badge>
                          )}
                        </div>
                        {q.options && q.options.length > 0 && (
                          <ul className="mt-1.5 list-disc pl-5 text-xs text-muted-foreground">
                            {q.options.map((o, oi) => <li key={oi}>{o.value || o.key}</li>)}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No questions returned by Meta.</p>
                )}
              </section>

              {form.thank_you_page && (
                <section className="rounded-md border border-border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Thank-you screen</div>
                  {form.thank_you_page.title && <div className="font-medium">{form.thank_you_page.title}</div>}
                  {form.thank_you_page.body && <p className="text-sm mt-0.5">{form.thank_you_page.body}</p>}
                  {form.thank_you_page.website_url && (
                    <a
                      href={form.thank_you_page.website_url}
                      target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {form.thank_you_page.button_text || "Visit link"} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </section>
              )}

              {form.privacy_policy?.url && (
                <a
                  href={form.privacy_policy.url}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  {form.privacy_policy.link_text || "Privacy policy"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No form data.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
