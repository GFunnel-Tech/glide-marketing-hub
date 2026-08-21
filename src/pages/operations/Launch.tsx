import { useEffect, useMemo, useState } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSaveAdDraft } from "@/hooks/useAdDrafts";
import { useClients } from "@/hooks/useDatabase";
import { clientDisplayName } from "@/lib/clientName";
import { PreviewPane } from "@/components/ads/builder/preview/PreviewPane";
import { ManualMode } from "@/components/ads/builder/ManualMode";
import { TemplateMode } from "@/components/ads/builder/TemplateMode";
import { AdSetSidebar } from "@/components/ads/builder/AdSetSidebar";
import { BuilderHeader } from "@/components/ads/builder/BuilderHeader";
import { GenerateLaunchPanel } from "@/components/launch/GenerateLaunchPanel";
import { PlanApproval } from "@/components/launch/PlanApproval";
import { planToBuilderState, type CampaignPlan } from "@/components/launch/planTypes";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Edit3, Lightbulb, Sparkles, Flame, Plug, Rocket, AlertCircle } from "lucide-react";
import { ConnectedAccountsModal } from "@/components/ads/builder/ConnectedAccountsModal";
import { PublishDialog } from "@/components/ads/builder/PublishDialog";
import { validateForPublish } from "@/lib/adBuilderValidation";
import type { BuilderMode, Objective, SpecialAdCategoryValue } from "@/components/ads/builder/types";

const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "website", label: "Website" },
  { id: "awareness", label: "Awareness" },
  { id: "messages", label: "Messages" },
];

const SPECIAL: { id: SpecialAdCategoryValue; label: string }[] = [
  { id: "housing", label: "Housing" },
  { id: "credit", label: "Financial" },
  { id: "employment", label: "Employment" },
];

export default function Launch() {
  const { currentWorkspace } = useWorkspace();
  const { data: clients = [] } = useClients();
  const state = useAdDraftStore((s) => s.state);
  const draftId = useAdDraftStore((s) => s.draftId);
  const setDraftId = useAdDraftStore((s) => s.setDraftId);
  const init = useAdDraftStore((s) => s.init);
  const patch = useAdDraftStore((s) => s.patch);
  const hydrate = useAdDraftStore((s) => s.hydrate);
  const dirty = useAdDraftStore((s) => s.dirty);
  const markClean = useAdDraftStore((s) => s.markClean);

  const [mode, setMode] = useState<BuilderMode>("generate");
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [savingNow, setSavingNow] = useState(false);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);

  const saveDraft = useSaveAdDraft();

  useEffect(() => {
    if (!state.objective) init("leads", [], ["US"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave every 2.5s when dirty
  useEffect(() => {
    if (!dirty || !currentWorkspace) return;
    const t = setTimeout(async () => {
      try {
        setSavingNow(true);
        const res = await saveDraft.mutateAsync({ id: draftId, state });
        if (!draftId) setDraftId(res.id);
        markClean();
      } catch (e: any) {
        console.error("autosave failed", e);
      } finally {
        setSavingNow(false);
      }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, state, draftId, currentWorkspace]);

  const issueCount = useMemo(
    () => validateForPublish(state).filter((i) => i.severity === "error").length,
    [state],
  );

  const manualSave = async () => {
    if (!currentWorkspace) return;
    try {
      setSavingNow(true);
      const res = await saveDraft.mutateAsync({ id: draftId, state });
      if (!draftId) setDraftId(res.id);
      markClean();
    } finally {
      setSavingNow(false);
    }
  };

  const approvePlan = () => {
    if (!plan) return;
    hydrate(null, planToBuilderState(plan, state.objective, state.specialAdCategory, state.clientId ?? null));
    setPlan(null);
    setMode("manual");
  };

  const toggleSpecial = (id: SpecialAdCategoryValue) => {
    const cur = state.specialAdCategory || [];
    patch("specialAdCategory", cur.includes(id) ? cur.filter((x: string) => x !== id) : [...cur, id]);
  };

  const headerColor = mode === "generate" ? "from-violet-500 to-fuchsia-500"
    : mode === "template" ? "from-blue-500 to-indigo-500"
    : "from-primary to-primary/70";

  return (
    <div className="h-full -m-6 flex flex-col bg-background overflow-hidden">
      <BuilderHeader
        saving={savingNow}
        saved={!dirty && !!draftId}
        onSave={manualSave}
        onReview={() => setPublishOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left: ad set sidebar */}
        <AdSetSidebar />

        {/* Middle: builder */}
        <div className="flex-1 min-w-0 border-r border-border bg-card/30 overflow-y-auto">
          <div className={cn("bg-gradient-to-r px-4 py-3 text-white space-y-2", headerColor)}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 bg-white/10 rounded-md p-0.5">
                <ModeBtn label="Generate" icon={<Sparkles className="h-3.5 w-3.5" />} active={mode === "generate"} onClick={() => setMode("generate")} />
                <ModeBtn label="Template" icon={<Lightbulb className="h-3.5 w-3.5" />} active={mode === "template"} onClick={() => setMode("template")} />
                <ModeBtn label="Manual" icon={<Edit3 className="h-3.5 w-3.5" />} active={mode === "manual"} onClick={() => setMode("manual")} />
              </div>

              {/* Client account */}
              <Select
                value={state.clientId ? String(state.clientId) : "none"}
                onValueChange={(v) => patch("clientId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger className="h-7 w-[200px] bg-white/15 border-0 text-xs font-medium text-white focus:ring-0">
                  <SelectValue placeholder="Client account" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No client (internal)</SelectItem>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{clientDisplayName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Objective */}
              <Select value={state.objective} onValueChange={(v) => patch("objective", v as Objective)}>
                <SelectTrigger className="h-7 w-[140px] bg-white/15 border-0 text-xs font-medium text-white focus:ring-0">
                  <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" /><SelectValue /></span>
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => setAccountsOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-w-[260px]"
                title="Connected accounts"
              >
                <Plug className="h-3.5 w-3.5 flex-shrink-0" />
                {state.pageName ? (
                  <span className="truncate">
                    {state.pageName}
                    {state.igUsername && <span className="opacity-80"> / @{state.igUsername}</span>}
                  </span>
                ) : (
                  <span className="truncate">Connect accounts</span>
                )}
              </button>
            </div>

            {/* Special ad categories */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide opacity-75">Special</span>
              {SPECIAL.map((s) => {
                const on = (state.specialAdCategory || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSpecial(s.id)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                      on ? "bg-white text-foreground font-semibold" : "bg-white/15 text-white/85 hover:bg-white/25",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs opacity-80">
              {mode === "generate" && "Describe the business and we'll build campaign, ad sets and ads with AI — then approve and edit."}
              {mode === "template" && "Pick a saved template to start from."}
              {mode === "manual" && `Editing ${currentSelectionLabel(state)} · Configure creatives, targeting and budget yourself.`}
            </p>
          </div>

          <div className="p-5 pb-32 max-w-2xl">
            {mode === "generate" && (
              plan ? (
                <PlanApproval plan={plan} onChange={setPlan} onRestart={() => setPlan(null)} onApprove={approvePlan} />
              ) : (
                <GenerateLaunchPanel
                  objective={state.objective}
                  specialAdCategory={state.specialAdCategory}
                  clientId={state.clientId ?? null}
                  onGenerated={setPlan}
                />
              )
            )}
            {mode === "template" && <TemplateMode onApplied={() => setMode("manual")} />}
            {mode === "manual" && <ManualMode />}
          </div>
        </div>

        {/* Right: preview */}
        <div className="w-[420px] flex-shrink-0 p-6 bg-muted/20 overflow-y-auto">
          <PreviewPane />
        </div>
      </div>

      {/* Sticky publish bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-card border-t border-border p-3 z-40">
        <div className="max-w-2xl mx-auto lg:mx-0 lg:ml-[276px] space-y-1">
          <Button
            onClick={() => setPublishOpen(true)}
            className="w-full h-12 bg-gradient-to-r from-primary via-primary to-violet-600 text-white text-sm font-semibold"
          >
            <Rocket className="h-4 w-4 mr-2" />
            Publish Campaign
            {issueCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                <AlertCircle className="h-3 w-3" /> {issueCount}
              </span>
            )}
          </Button>
          <div className="text-[10px] text-muted-foreground text-center">
            {issueCount > 0
              ? `${issueCount} issue${issueCount === 1 ? "" : "s"} to fix · `
              : "Ready to publish · "}
            {draftId ? (dirty ? "Saving…" : "Draft autosaved") : "New draft"}
          </div>
        </div>
      </div>

      <ConnectedAccountsModal open={accountsOpen} onOpenChange={setAccountsOpen} />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onMissingIdentity={() => { setPublishOpen(false); setAccountsOpen(true); }}
      />
    </div>
  );
}

function currentSelectionLabel(state: ReturnType<typeof useAdDraftStore.getState>["state"]): string {
  const set = state.adSets.find((s) => s.id === state.selectedAdSetId);
  const ad = set?.ads.find((a) => a.id === state.selectedAdId);
  if (!set || !ad) return "this ad";
  return `${set.name} › ${ad.name}`;
}

function ModeBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all", active ? "bg-white text-foreground" : "text-white/80 hover:text-white")}>
      {icon}{label}
    </button>
  );
}
