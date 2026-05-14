import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChannelLead, LeadChannel, LeadStage } from "@/hooks/useChannelLeads";
import { useUpdateLead } from "@/hooks/useChannelLeads";

const STAGES: { value: LeadStage; label: string }[] = [
  { value: "intake", label: "Intake" },
  { value: "in_progress", label: "In Progress" },
  { value: "converted", label: "Converted" },
];

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

  useEffect(() => {
    setNote(lead?.note ?? "");
    setStage(lead?.stage ?? "intake");
  }, [lead?.id]);

  const dirty = lead ? note !== (lead.note ?? "") || stage !== lead.stage : false;

  const save = () => {
    if (!lead) return;
    update.mutate(
      { id: lead.id, patch: { note, stage } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
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
  );
}
