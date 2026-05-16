import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { FileText, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function LeadFormSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const lf = state.leadForm;

  if (state.objective !== "leads") return null;

  const setLf = (next: typeof lf) => patch("leadForm", next);

  return (
    <Section title="Lead Form" icon={<FileText className="h-4 w-4 text-primary" />}>
      <div>
        <Input
          value={lf.name ?? ""}
          onChange={(e) => setLf({ ...lf, name: e.target.value })}
          placeholder="Lead form name"
          className="h-9 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">Intro (Optional)</label>
        <Textarea value={lf.intro ?? ""} onChange={(e) => setLf({ ...lf, intro: e.target.value })} rows={2} className="mt-1.5 text-sm" placeholder="Brief intro shown to leads" />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Questions</label>
        <div className="space-y-2">
          {(lf.questions ?? []).map((q, i) => (
            <div key={q.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{q.type}</span>
              <Input
                value={q.label}
                onChange={(e) => {
                  const next = [...(lf.questions ?? [])]; next[i] = { ...q, label: e.target.value }; setLf({ ...lf, questions: next });
                }}
                className="h-7 text-sm border-0 bg-transparent focus-visible:ring-0 px-0"
              />
              <button onClick={() => setLf({ ...lf, questions: (lf.questions ?? []).filter((qq) => qq.id !== q.id) })}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setLf({ ...lf, questions: [...(lf.questions ?? []), { id: crypto.randomUUID(), type: "CUSTOM", label: "New question" }] })}>
          <Plus className="h-3 w-3 mr-1" /> Add Question
        </Button>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">Privacy Policy URL</label>
        <Input value={lf.privacyUrl ?? ""} onChange={(e) => setLf({ ...lf, privacyUrl: e.target.value })} placeholder="https://example.com/privacy" className="mt-1.5 h-9 text-sm" />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">Thank-You Message</label>
        <Textarea value={lf.thankYou ?? ""} onChange={(e) => setLf({ ...lf, thankYou: e.target.value })} rows={2} className="mt-1.5 text-sm" placeholder="Thanks! We'll be in touch." />
      </div>

      <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground">
        ℹ️ The lead form is created when you launch. Make sure your privacy policy URL is accessible.
      </div>
    </Section>
  );
}
