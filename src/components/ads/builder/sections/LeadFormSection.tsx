import { useEffect, useState } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "../shared/Section";
import { FileText, Plus, X, Loader2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import type { LeadFormQuestion } from "../types";
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
              {(lf.questions ?? []).map((q, i) => {
                const list = lf.questions ?? [];
                const updateQ = (patch: Partial<LeadFormQuestion>) => {
                  const next = [...list];
                  next[i] = { ...q, ...patch } as LeadFormQuestion;
                  setLf({ ...lf, questions: next });
                };
                const move = (dir: -1 | 1) => {
                  const j = i + dir;
                  if (j < 0 || j >= list.length) return;
                  const next = [...list];
                  [next[i], next[j]] = [next[j], next[i]];
                  setLf({ ...lf, questions: next });
                };
                const remove = () => setLf({ ...lf, questions: list.filter((qq) => qq.id !== q.id) });
                const isMC = q.type === "MULTIPLE_CHOICE";
                return (
                  <div key={q.id} className="rounded-lg border border-border p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select value={q.type} onValueChange={(v) => updateQ({ type: v as LeadFormQuestion["type"], options: v === "MULTIPLE_CHOICE" ? (q.options ?? ["Option 1"]) : undefined })}>
                        <SelectTrigger className="h-7 text-xs w-[140px] shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FULL_NAME">Full name</SelectItem>
                          <SelectItem value="EMAIL">Email</SelectItem>
                          <SelectItem value="PHONE">Phone</SelectItem>
                          <SelectItem value="CUSTOM">Short answer</SelectItem>
                          <SelectItem value="MULTIPLE_CHOICE">Multiple choice</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={q.label}
                        onChange={(e) => updateQ({ label: e.target.value })}
                        placeholder="Question text"
                        className="h-7 text-sm flex-1"
                      />
                      <button type="button" onClick={() => move(-1)} disabled={i === 0} className="disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button type="button" onClick={() => move(1)} disabled={i === list.length - 1} className="disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button type="button" onClick={remove}>
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                    {isMC && (
                      <div className="pl-6 space-y-1.5">
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-4">{oi + 1}.</span>
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const opts = [...(q.options ?? [])];
                                opts[oi] = e.target.value;
                                updateQ({ options: opts });
                              }}
                              placeholder={`Option ${oi + 1}`}
                              className="h-7 text-xs flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => updateQ({ options: (q.options ?? []).filter((_, k) => k !== oi) })}
                              disabled={(q.options ?? []).length <= 1}
                              className="disabled:opacity-30"
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => updateQ({ options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add option
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
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
