import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, RotateCcw } from "lucide-react";
import { CreativeRules, DEFAULT_RULES } from "@/hooks/useCreativeRules";

export function ClassificationSettings({
  rules,
  onChange,
  onReset,
}: {
  rules: CreativeRules;
  onChange: (r: CreativeRules) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<CreativeRules>(rules);
  const [open, setOpen] = useState(false);

  const update = (k: keyof CreativeRules, v: string) => {
    const n = Number(v);
    setDraft({ ...draft, [k]: isFinite(n) && n >= 0 ? n : 0 });
  };

  const save = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(rules); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="text-xs">Classification</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Classification rules</h3>
            <p className="text-[11px] text-muted-foreground">Tune what counts as Best, Worst, and Learning.</p>
          </div>

          <Section label="CPL thresholds (USD)">
            <Field label="Green (Best at or below)" v={draft.greenCpl} onChange={(v) => update("greenCpl", v)} />
            <Field label="Red (Worst at or above)" v={draft.redCpl} onChange={(v) => update("redCpl", v)} />
          </Section>

          <Section label="Best requires">
            <Field label="Min leads" v={draft.minLeadsBest} onChange={(v) => update("minLeadsBest", v)} />
            <Field label="Min spend ($)" v={draft.minSpendBest} onChange={(v) => update("minSpendBest", v)} />
          </Section>

          <Section label="Worst kicks in after">
            <Field label="Spend with 0 leads ($)" v={draft.minSpendWorst} onChange={(v) => update("minSpendWorst", v)} />
          </Section>

          <Section label="Learning if">
            <Field label="Days active under" v={draft.learningMaxDays} onChange={(v) => update("learningMaxDays", v)} />
            <Field label="Leads under" v={draft.learningMinLeads} onChange={(v) => update("learningMinLeads", v)} />
          </Section>

          <div className="flex justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => { setDraft(DEFAULT_RULES); onReset(); setOpen(false); }}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={save}>Save</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">{label}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Field({ label, v, onChange }: { label: string; v: number; onChange: (s: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input type="number" min={0} value={v} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs" />
    </div>
  );
}
