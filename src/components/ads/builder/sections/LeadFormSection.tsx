import { useEffect, useState } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "../shared/Section";
import { FileText, Plus, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LeadFormSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const lf = state.leadForm;
  const { currentWorkspace } = useWorkspace();
  const [forms, setForms] = useState<{ id: string; name: string; status?: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);

  if (state.objective !== "leads") return null;
  const setLf = (next: typeof lf) => patch("leadForm", next);

  useEffect(() => {
    if (lf.mode !== "existing" || !state.pageId || !currentWorkspace) return;
    setLoadingForms(true);
    supabase.functions
      .invoke("meta-lead-forms-list", { body: { workspaceId: currentWorkspace.id, pageId: state.pageId } })
      .then(({ data, error }) => {
        if (error || data?.error) { setForms([]); return; }
        setForms(data?.forms ?? []);
      })
      .finally(() => setLoadingForms(false));
  }, [lf.mode, state.pageId, currentWorkspace?.id]);

  return (
    <Section title="Lead Form" icon={<FileText className="h-4 w-4 text-primary" />}>
      <div className="flex gap-2">
        <Button type="button" variant={lf.mode === "new" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setLf({ ...lf, mode: "new" })}>Create new</Button>
        <Button type="button" variant={lf.mode === "existing" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setLf({ ...lf, mode: "existing" })}>Use existing</Button>
      </div>

      {lf.mode === "existing" ? (
        <div>
          <label className="text-xs font-medium text-foreground">Select a form from your Page</label>
          {!state.pageId ? (
            <p className="text-[11px] text-muted-foreground mt-1.5">Pick a Facebook Page in the Identity section first.</p>
          ) : loadingForms ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading forms…</div>
          ) : forms.length === 0 ? (
            <p className="text-[11px] text-muted-foreground mt-1.5">No existing forms found on this Page.</p>
          ) : (
            <Select
              value={lf.existingFormId ?? ""}
              onValueChange={(v) => {
                const f = forms.find((x) => x.id === v);
                setLf({ ...lf, existingFormId: v, existingFormName: f?.name });
              }}
            >
              <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue placeholder="Choose a lead form" /></SelectTrigger>
              <SelectContent>
                {forms.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <>
          <div>
            <Input value={lf.name ?? ""} onChange={(e) => setLf({ ...lf, name: e.target.value })} placeholder="Lead form name" className="h-9 text-sm" />
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
            <label className="text-xs font-medium text-foreground">Privacy Policy URL <span className="text-destructive">*</span></label>
            <Input value={lf.privacyUrl ?? ""} onChange={(e) => setLf({ ...lf, privacyUrl: e.target.value })} placeholder="https://example.com/privacy" className="mt-1.5 h-9 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Follow-up Website URL (Optional)</label>
            <Input value={lf.followUpUrl ?? ""} onChange={(e) => setLf({ ...lf, followUpUrl: e.target.value })} placeholder="https://example.com/thanks" className="mt-1.5 h-9 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Thank-You Message</label>
            <Textarea value={lf.thankYou ?? ""} onChange={(e) => setLf({ ...lf, thankYou: e.target.value })} rows={2} className="mt-1.5 text-sm" placeholder="Thanks! We'll be in touch." />
          </div>

          <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground">
            ℹ️ The lead form is created on your Page when you launch. Privacy Policy URL is required by Meta.
          </div>
        </>
      )}
    </Section>
  );
}
