import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Loader2, Rocket, XCircle } from "lucide-react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSaveAdDraft } from "@/hooks/useAdDrafts";
import { useSaveAdTemplate } from "@/hooks/useAdTemplates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateForPublish, SECTION_LABELS, type PublishIssue } from "@/lib/adBuilderValidation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMissingIdentity?: () => void;
}

export function PublishDialog({ open, onOpenChange, onMissingIdentity }: Props) {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const state = useAdDraftStore((s) => s.state);
  const draftId = useAdDraftStore((s) => s.draftId);
  const setDraftId = useAdDraftStore((s) => s.setDraftId);
  const dirty = useAdDraftStore((s) => s.dirty);
  const markClean = useAdDraftStore((s) => s.markClean);
  const saveDraft = useSaveAdDraft();
  const saveTemplate = useSaveAdTemplate();
  const [publishing, setPublishing] = useState(false);

  const issues = useMemo<PublishIssue[]>(() => validateForPublish(state), [state]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const grouped = useMemo(() => {
    const byField: Record<string, PublishIssue[]> = {};
    for (const i of issues) (byField[i.section] ||= []).push(i);
    return byField;
  }, [issues]);

  const publish = async () => {
    if (!currentWorkspace) return;
    if (errors.length > 0) {
      if (errors.some((e) => e.section === "identity") && onMissingIdentity) onMissingIdentity();
      toast.error(`Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} before publishing`);
      return;
    }
    setPublishing(true);
    try {
      let id = draftId;
      if (!id || dirty) {
        const res = await saveDraft.mutateAsync({ id, state });
        id = res.id;
        setDraftId(id);
        markClean();
      }
      if (state.saveAsTemplate) {
        await saveTemplate.mutateAsync({
          name: state.campaignName || `Template ${new Date().toLocaleDateString()}`,
          state,
        });
      }
      const { data, error } = await supabase.functions.invoke("meta-ad-launch", {
        body: { workspaceId: currentWorkspace.id, draftId: id, state },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const campaignId = data?.campaignId || data?.campaign_id;
      if (state.activateOnPublish && campaignId) {
        try {
          const { data: statusData, error: statusErr } = await supabase.functions.invoke("meta-ad-status", {
            body: { workspaceId: currentWorkspace.id, adIds: [campaignId], status: "ACTIVE" },
          });
          if (statusErr) throw statusErr;
          const failed = (statusData?.results ?? []).filter((r: any) => !r.ok);
          if (failed.length) throw new Error(failed[0]?.error || "Activation failed");
          toast.success("Campaign published and activated. It's now live on Meta.");
        } catch (e: any) {
          toast.warning(`Published (PAUSED) but activation failed: ${e.message}. Activate manually.`);
        }
      } else {
        toast.success("Campaign published (PAUSED). Review and activate it in Meta Ads Manager.");
      }
      onOpenChange(false);
      navigate("/ads");
    } catch (e: any) {
      toast.error(e.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const lf = state.leadForm;
  const isLeads = state.objective === "leads";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" /> Publish campaign
          </DialogTitle>
          <DialogDescription className="text-xs">
            We'll create the campaign, ad set, and ad on Meta in <strong>PAUSED</strong> state so you can review before going live.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-5 space-y-4">
            {/* Summary */}
            <section className="rounded-lg border border-border p-3 bg-card/40">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Summary</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <SummaryRow label="Objective" value={state.objective} cap />
                {state.specialAdCategory && <SummaryRow label="Special category" value={state.specialAdCategory} cap />}
                <SummaryRow label="Campaign" value={state.campaignName || "Untitled"} />
                <SummaryRow label="Page" value={state.pageName ?? "—"} />
                {state.igUsername && <SummaryRow label="Instagram" value={`@${state.igUsername}`} />}
                <SummaryRow label="Ad account" value={state.adAccountName || state.adAccountId || "—"} />
                <SummaryRow label="Budget" value={`${state.currency} ${state.budgetAmount} ${state.budgetType}`} />
                <SummaryRow label="Countries" value={state.countries.join(", ") || "—"} />
                <SummaryRow label="Creatives" value={`${state.media.length + state.bankImages.length} image(s)`} />
                <SummaryRow label="Primary texts" value={String((state.primaryTexts ?? []).filter(Boolean).length + (state.bankCopy ?? []).length)} />
                {isLeads && (
                  <SummaryRow
                    label="Lead form"
                    value={lf.mode === "existing"
                      ? (lf.existingFormName || lf.existingFormId || "—")
                      : `${lf.name || "Untitled"} (${(lf.questions ?? []).length} questions)`}
                  />
                )}
                {state.objective === "website" && <SummaryRow label="Destination" value={state.websiteUrl || "—"} />}
              </dl>
            </section>

            {/* Errors */}
            {errors.length > 0 && (
              <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> {errors.length} required fix{errors.length === 1 ? "" : "es"}
                </h3>
                <IssueList grouped={grouped} severity="error" />
              </section>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </h3>
                <IssueList grouped={grouped} severity="warning" />
              </section>
            )}

            {errors.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4" />
                Everything checks out. You're ready to publish.
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 border-t border-border bg-muted/20">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={publishing}>
            Cancel
          </Button>
          <Button size="sm" onClick={publish} disabled={publishing || errors.length > 0} className="min-w-[140px]">
            {publishing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Publishing…</>
            ) : (
              <><Rocket className="h-3.5 w-3.5 mr-1.5" /> Publish (paused)</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, cap }: { label: string; value: string; cap?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cap ? "font-medium capitalize" : "font-medium truncate"}>{value}</dd>
    </>
  );
}

function IssueList({ grouped, severity }: { grouped: Record<string, PublishIssue[]>; severity: "error" | "warning" }) {
  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([section, list]) => {
        const filtered = list.filter((i) => i.severity === severity);
        if (filtered.length === 0) return null;
        return (
          <div key={section}>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="h-5 text-[10px]">{SECTION_LABELS[section as PublishIssue["section"]]}</Badge>
            </div>
            <ul className="space-y-0.5 ml-1">
              {filtered.map((i, idx) => (
                <li key={`${i.field}-${idx}`} className="text-xs text-foreground flex items-start gap-1.5">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
