import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSaveAdDraft } from "@/hooks/useAdDrafts";
import { useSaveAdTemplate } from "@/hooks/useAdTemplates";
import { supabase } from "@/integrations/supabase/client";
import { PreviewPane } from "@/components/ads/builder/preview/PreviewPane";
import { ManualMode } from "@/components/ads/builder/ManualMode";
import { GenerateMode } from "@/components/ads/builder/GenerateMode";
import { TemplateMode } from "@/components/ads/builder/TemplateMode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit3, Lightbulb, ChevronLeft, Flame, Plug } from "lucide-react";
import { ConnectedAccountsModal } from "@/components/ads/builder/ConnectedAccountsModal";
import { toast } from "sonner";
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
  const [launching, setLaunching] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);

  const saveDraft = useSaveAdDraft();
  const saveTemplate = useSaveAdTemplate();

  // Initialize from URL params on first mount if needed
  useEffect(() => {
    const obj = params.get("objective") as Objective | null;
    if (obj && state.objective !== obj) {
      const sac = (params.get("special") as SpecialAdCategory) || null;
      init(obj, sac, ["US"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave every 2.5s when dirty
  useEffect(() => {
    if (!dirty || !currentWorkspace) return;
    const t = setTimeout(async () => {
      try {
        const res = await saveDraft.mutateAsync({ id: draftId, state });
        if (!draftId) setDraftId(res.id);
        markClean();
      } catch (e: any) {
        console.error("autosave failed", e);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [dirty, state, draftId, currentWorkspace]);

  const launch = async () => {
    if (!currentWorkspace) return;
    if (!state.pageId || !state.adAccountId) {
      toast.error("Choose connected accounts first");
      setAccountsOpen(true);
      return;
    }
    if (!state.media.length && !state.bankImages.length) { toast.error("Add at least one creative image"); return; }
    if (state.objective === "leads") {
      const lf = state.leadForm;
      if (lf.mode === "existing" && !lf.existingFormId) { toast.error("Pick an existing lead form or switch to Create new"); return; }
      if (lf.mode === "new" && !lf.privacyUrl) { toast.error("Add a Privacy Policy URL to the lead form"); return; }
      if (lf.mode === "new" && !(lf.questions ?? []).length) { toast.error("Add at least one lead form question"); return; }
    }
    setLaunching(true);
    try {
      // Ensure draft saved
      let id = draftId;
      if (!id || dirty) {
        const res = await saveDraft.mutateAsync({ id, state });
        id = res.id; setDraftId(id); markClean();
      }
      // Save as template if requested
      if (state.saveAsTemplate) {
        await saveTemplate.mutateAsync({ name: state.campaignName || `Template ${new Date().toLocaleDateString()}`, state });
      }
      const { data, error } = await supabase.functions.invoke("meta-ad-launch", {
        body: { workspaceId: currentWorkspace.id, draftId: id, state },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Campaign launched (PAUSED). Review and activate in Meta Ads Manager.");
      navigate("/ads");
    } catch (e: any) {
      toast.error(e.message || "Launch failed");
    } finally { setLaunching(false); }
  };

  const headerColor = mode === "generate" ? "from-violet-500 to-fuchsia-500"
    : mode === "template" ? "from-blue-500 to-indigo-500"
    : "from-primary to-primary/70";

  return (
    <div className="min-h-screen bg-background -mt-6 -mx-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-0">
        {/* Left: builder */}
        <div className="border-r border-border bg-card/30">
          <div className={cn("bg-gradient-to-r p-4 text-white", headerColor)}>
            <button onClick={() => navigate("/ads")} className="text-xs opacity-80 hover:opacity-100 inline-flex items-center gap-1 mb-3">
              <ChevronLeft className="h-3 w-3" /> Back to Ads
            </button>
            <div className="flex items-center gap-2">
              <ModeBtn label="Generate" icon={<Lightbulb className="h-3.5 w-3.5" />} active={mode === "generate"} onClick={() => setMode("generate")} />
              <ModeBtn label="Template" icon={<Lightbulb className="h-3.5 w-3.5" />} active={mode === "template"} onClick={() => setMode("template")} />
              <ModeBtn label="Manual" icon={<Edit3 className="h-3.5 w-3.5" />} active={mode === "manual"} onClick={() => setMode("manual")} />
              <div className="ml-auto inline-flex items-center gap-1.5 bg-white/15 rounded-md px-2.5 py-1 text-xs font-medium">
                <Flame className="h-3.5 w-3.5" /> {state.objective.charAt(0).toUpperCase() + state.objective.slice(1)}
                {state.specialAdCategory && <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-[10px] capitalize">Special: {state.specialAdCategory}</span>}
              </div>
            </div>
            <p className="text-xs opacity-80 mt-2">
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
        <div className="p-6 bg-muted/20">
          <PreviewPane />
        </div>
      </div>

      {/* Sticky launch bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 z-40">
        <div className="max-w-2xl mx-auto lg:mx-0 lg:ml-6">
          <Button
            onClick={launch}
            disabled={launching}
            className="w-full h-12 bg-gradient-to-r from-primary via-primary to-violet-600 text-white text-sm font-semibold"
          >
            {launching ? "Launching…" : "💡 Launch Campaign"}
          </Button>
          {draftId && <div className="text-[10px] text-muted-foreground text-center mt-1">{dirty ? "Saving…" : "Draft autosaved"}</div>}
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all", active ? "bg-white text-foreground" : "text-white/80 hover:text-white")}>
      {icon}{label}
    </button>
  );
}
