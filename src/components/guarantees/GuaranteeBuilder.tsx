import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { METRIC_LABELS } from "@/lib/guaranteeEvaluator";
import type {
  GuaranteeCriterion,
  GuaranteeMetric,
  GuaranteeSource,
  GuaranteeTemplate,
  ClientGuarantee,
} from "@/lib/guaranteeTypes";

interface BaseForm {
  name: string;
  description: string;
  terms: string;
  duration_days: number;
  criteria: GuaranteeCriterion[];
  enabled?: boolean;
  visible_to_client?: boolean;
  start_date?: string;
  deadline?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "template" | "client";
  initial?: Partial<GuaranteeTemplate & ClientGuarantee>;
  onSave: (form: BaseForm) => Promise<void> | void;
  templates?: GuaranteeTemplate[];
  onApplyTemplate?: (t: GuaranteeTemplate) => void;
}

const METRICS: GuaranteeMetric[] = [
  "leads", "appointments", "applications", "closed_deals",
  "commission_revenue", "deals_in_underwriting", "spend", "roas", "custom",
];

const SOURCES: { value: GuaranteeSource; label: string }[] = [
  { value: "auto", label: "Auto (from synced data)" },
  { value: "ghl", label: "From GoHighLevel" },
  { value: "meta", label: "From Meta" },
  { value: "manual", label: "Manual entry" },
];

const newCriterion = (): GuaranteeCriterion => ({
  id: crypto.randomUUID(),
  label: "",
  metric: "leads",
  target_count: undefined,
  target_conversion_pct: undefined,
  source: "auto",
  unit: "count",
});

export function GuaranteeBuilder({ open, onOpenChange, mode, initial, onSave, templates, onApplyTemplate }: Props) {
  const [form, setForm] = useState<BaseForm>({
    name: "",
    description: "",
    terms: "",
    duration_days: 30,
    criteria: [newCriterion()],
    enabled: true,
    visible_to_client: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      terms: initial?.terms ?? "",
      duration_days: (initial as any)?.duration_days ?? 30,
      criteria: (initial?.criteria as GuaranteeCriterion[] | undefined)?.length
        ? (initial!.criteria as GuaranteeCriterion[])
        : [newCriterion()],
      enabled: (initial as any)?.enabled ?? true,
      visible_to_client: (initial as any)?.visible_to_client ?? true,
      start_date: (initial as any)?.start_date,
      deadline: (initial as any)?.deadline,
    });
  }, [open, initial]);

  const updateCriterion = (idx: number, patch: Partial<GuaranteeCriterion>) => {
    setForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const removeCriterion = (idx: number) => {
    setForm((f) => ({ ...f, criteria: f.criteria.filter((_, i) => i !== idx) }));
  };

  const addCriterion = () => setForm((f) => ({ ...f, criteria: [...f.criteria, newCriterion()] }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {initial?.id ? "Edit" : "New"} {mode === "template" ? "Guarantee Template" : "Client Guarantee"}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {mode === "client" && templates && templates.length > 0 && !initial?.id && (
            <div>
              <Label>Start from template (optional)</Label>
              <Select onValueChange={(id) => {
                const t = templates.find((x) => x.id === id);
                if (t) {
                  setForm((f) => ({
                    ...f,
                    name: t.name,
                    description: t.description ?? "",
                    terms: t.terms ?? "",
                    duration_days: t.duration_days,
                    criteria: t.criteria.map((c) => ({ ...c, id: crypto.randomUUID() })),
                  }));
                  onApplyTemplate?.(t);
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Pick a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Money Back Guarantee — 30 Days" />
          </div>

          <div>
            <Label>Short description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. 2+ deals in underwriting within 30 days" />
          </div>

          <div>
            <Label>Terms (long form)</Label>
            <Textarea rows={4} value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
              placeholder="Full guarantee terms shown to the client..." />
          </div>

          {mode === "template" ? (
            <div>
              <Label>Default duration (days)</Label>
              <Input type="number" min={1} value={form.duration_days}
                onChange={(e) => setForm((f) => ({ ...f, duration_days: Number(e.target.value) || 30 }))} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={form.start_date ?? new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="date" value={form.deadline ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
          )}

          {mode === "client" && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Visible to client portal</p>
                <p className="text-xs text-muted-foreground">Show progress to the client in their portal</p>
              </div>
              <Switch checked={form.visible_to_client ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, visible_to_client: v }))} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Funnel criteria</Label>
              <Button type="button" size="sm" variant="outline" onClick={addCriterion}>
                <Plus className="h-3 w-3 mr-1" /> Add step
              </Button>
            </div>

            <div className="space-y-3">
              {form.criteria.map((c, idx) => (
                <div key={c.id} className="rounded-md border border-border p-3 space-y-2 bg-card/50">
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-2" />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input placeholder="Step label (e.g. Leads to Appointments)"
                        value={c.label} onChange={(e) => updateCriterion(idx, { label: e.target.value })} />
                      <Select value={c.metric} onValueChange={(v) => updateCriterion(idx, { metric: v as GuaranteeMetric })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {METRICS.map((m) => <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Target count/$"
                        value={c.target_count ?? ""} onChange={(e) => updateCriterion(idx, {
                          target_count: e.target.value === "" ? undefined : Number(e.target.value),
                        })} />
                      <Input type="number" placeholder="Target conv % from prev"
                        value={c.target_conversion_pct ?? ""} onChange={(e) => updateCriterion(idx, {
                          target_conversion_pct: e.target.value === "" ? undefined : Number(e.target.value),
                        })} />
                      <Select value={c.source} onValueChange={(v) => updateCriterion(idx, { source: v as GuaranteeSource })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {c.source === "manual" && (
                        <Input type="number" placeholder="Actual value"
                          value={c.manual_value ?? ""} onChange={(e) => updateCriterion(idx, {
                            manual_value: e.target.value === "" ? undefined : Number(e.target.value),
                          })} />
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeCriterion(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input placeholder="Note (optional)" value={c.note ?? ""}
                    onChange={(e) => updateCriterion(idx, { note: e.target.value })} />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Tip: Use "Target count" for absolute goals (e.g. 2 deals, $30,000), or "Target conv %" for funnel steps (e.g. 35% Leads → Appointments).
            </p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
