import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSaveAdDraft } from "@/hooks/useAdDrafts";
import { PreviewPane } from "@/components/ads/builder/preview/PreviewPane";
import { ManualMode } from "@/components/ads/builder/ManualMode";
import { GenerateMode } from "@/components/ads/builder/GenerateMode";
import { TemplateMode } from "@/components/ads/builder/TemplateMode";
import { AdSetSidebar } from "@/components/ads/builder/AdSetSidebar";
import { BuilderHeader } from "@/components/ads/builder/BuilderHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit3, Lightbulb, Flame, Plug, Rocket, AlertCircle } from "lucide-react";
import { ConnectedAccountsModal } from "@/components/ads/builder/ConnectedAccountsModal";
import { PublishDialog } from "@/components/ads/builder/PublishDialog";
import { validateForPublish } from "@/lib/adBuilderValidation";
import type { BuilderMode, Objective, SpecialAdCategory } from "@/components/ads/builder/types";

export default function AdCreator() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const state = useAdDraftStore((s) => s.state);
  const draftId = useAdDraftStore((s) => s.draftId);
  const setDraftId = useAdDraftStore((s) => s.setDraftId);
  const init = useAdDraftStore((s) => s.init);
  const dirty = useAdDraftStore((s) => s.dirty);
  const markClean = useAdDraftStore((s) => s.markClean);

  const [mode, setMode] = useState<BuilderMode>("manual");
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [savingNow, setSavingNow] = useState(false);

  const saveDraft = useSaveAdDraft();

  // Initialize from URL params on first mount if needed
  useEffect(() => {
    const obj = params.get("objective") as Objective | null;
    if (obj && state.objective !== obj) {
      const specialParam = params.get("special");
      const sac: SpecialAdCategory = specialParam
        ? (specialParam.split(",").filter((v) => ["housing", "credit", "employment"].includes(v)) as SpecialAdCategory)
        : [];
      init(obj, sac, ["US"]);
    }
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

  const headerColor = mode === "generate" ? "from-violet-500 to-fuchsia-500"
    : mode === "template" ? "from-blue-500 to-indigo-500"
    : "from-primary to-primary/70";

  return (
    <div className="min-h-screen bg-background -mt-6 -mx-6 flex flex-col">
      <BuilderHeader
        saving={savingNow}
        saved={!dirty && !!draftId}
        onSave={manualSave}
        onReview={() => setPublishOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left: Ad set sidebar */}
        <AdSetSidebar />

        {/* Middle: builder */}
        <div className="flex-1 min-w-0 border-r border-border bg-card/30 overflow-y-auto">
          <div className={cn("bg-gradient-to-r p-4 text-white", headerColor)}>
            <div className="flex items-center gap-2 flex-wrap">
              <ModeBtn label="Generate" icon={<Lightbulb className="h-3.5 w-3.5" />} active={mode === "generate"} onClick={() => setMode("generate")} />
              <ModeBtn label="Template" icon={<Lightbulb className="h-3.5 w-3.5" />} active={mode === "template"} onClick={() => setMode("template")} />
              <ModeBtn label="Manual" icon={<Edit3 className="h-3.5 w-3.5" />} active={mode === "manual"} onClick={() => setMode("manual")} />
              <button
                type="button"
                onClick={() => setAccountsOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                title="Connected accounts"
              >
                <Plug className="h-3.5 w-3.5" />
                {state.pageName ? (
                  <>
                    <span className="max-w-[120px] truncate">{state.pageName}</span>
                    {state.igUsername && <span className="opacity-80">/ @{state.igUsername}</span>}
                  </>
                ) : (
                  "Connect accounts"
                )}
              </button>
              <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-md px-2.5 py-1 text-xs font-medium">
                <Flame className="h-3.5 w-3.5" /> {state.objective.charAt(0).toUpperCase() + state.objective.slice(1)}
                {state.specialAdCategory.length > 0 && <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-[10px] capitalize">Special: {state.specialAdCategory.join(", ")}</span>}
              </div>
            </div>
            <p className="text-xs opacity-80 mt-2">
              Editing <span className="font-semibold">{currentSelectionLabel(state)}</span> ·{" "}
              {mode === "generate" && "Fill in these steps and we'll create creatives + targeting with AI."}
              {mode === "template" && "Pick a saved template to start from."}
              {mode === "manual" && "Configure creatives, targeting and budget yourself."}
            </p>
          </div>

          <div className="p-5 pb-32 max-w-2xl">
            {mode === "manual" && <ManualMode />}
            {mode === "generate" && <GenerateMode onSwitchToManual={() => setMode("manual")} />}
            {mode === "template" && <TemplateMode onApplied={() => setMode("manual")} />}
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
