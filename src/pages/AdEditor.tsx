import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { PreviewPane } from "@/components/ads/builder/preview/PreviewPane";
import { ManualMode } from "@/components/ads/builder/ManualMode";
import { AdSetSidebar } from "@/components/ads/builder/AdSetSidebar";
import { ConnectedAccountsModal } from "@/components/ads/builder/ConnectedAccountsModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getAdapter } from "@/lib/adChannels";
import { metaAdsManagerUrl } from "@/lib/metaAdsLink";
import { makeInitialState, makeAdSet, type CTA } from "@/components/ads/builder/types";
import {
  ChevronLeft, Edit3, Plug, Save, Loader2, ExternalLink, Pause, Play,
} from "lucide-react";

export default function AdEditor() {
  const { adId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  const hydrate = useAdDraftStore((s) => s.hydrate);
  const state = useAdDraftStore((s) => s.state);
  const dirty = useAdDraftStore((s) => s.dirty);
  const markClean = useAdDraftStore((s) => s.markClean);

  const [accountsOpen, setAccountsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const { data: ad, isLoading } = useQuery({
    queryKey: ["meta_ad", adId, wsId],
    enabled: !!adId && !!wsId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_ads").select("*").eq("id", adId).eq("workspace_id", wsId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Hydrate the builder from the live ad
  useEffect(() => {
    if (!ad) return;
    const cta = (ad.call_to_action_type as CTA) || "LEARN_MORE";
    const base = makeInitialState("leads", [], ["US"]);
    const set = makeAdSet(ad.adset_name || "Ad Set 1", cta);
    const media = ad.image_url || ad.thumbnail_url
      ? [{ id: "live", url: ad.image_url || ad.thumbnail_url, type: (ad.video_id ? "video" : "image") as "image" | "video", name: ad.name ?? undefined }]
      : [];
    set.ads = [{
      ...set.ads[0],
      name: ad.name || "Ad 1",
      media,
      primaryTexts: [ad.body || ""],
      headlines: ad.title ? [ad.title] : [],
      cta,
      websiteUrl: ad.link_url || "",
      displayLink: ad.link_url ? safeHost(ad.link_url) : "",
    }];
    hydrate(null, {
      ...base,
      clientId: ad.client_id ?? null,
      draftName: ad.name || "Ad",
      pageName: ad.page_name ?? base.pageName,
      adSets: [set],
      selectedAdSetId: set.id,
      selectedAdId: set.ads[0].id,
      media,
      primaryTexts: [ad.body || ""],
      headlines: ad.title ? [ad.title] : [],
      cta,
      websiteUrl: ad.link_url || "",
      displayLink: ad.link_url ? safeHost(ad.link_url) : "",
    } as any);
    markClean();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id]);

  const isPaused = ad?.effective_status === "PAUSED";
  const metaUrl = useMemo(
    () => metaAdsManagerUrl({ adAccountId: ad?.ad_account_id, adId: ad?.id }),
    [ad?.ad_account_id, ad?.id],
  );

  const saveChanges = async () => {
    if (!wsId || !ad) return;
    setSaving(true);
    try {
      await getAdapter("meta").updateCreative({
        workspaceId: wsId,
        adId: ad.id,
        title: state.headlines?.[0] || undefined,
        body: state.primaryTexts?.[0] || undefined,
        callToActionType: state.cta || undefined,
        linkUrl: state.websiteUrl || undefined,
      });
      toast.success("Ad updated");
      markClean();
      qc.invalidateQueries({ queryKey: ["meta_ads"] });
      qc.invalidateQueries({ queryKey: ["meta_ad", adId] });
    } catch (e: any) {
      toast.error(`Update failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!wsId || !ad) return;
    setStatusBusy(true);
    try {
      await getAdapter("meta").setStatus({ workspaceId: wsId, adIds: [ad.id], status: isPaused ? "ACTIVE" : "PAUSED" });
      toast.success(isPaused ? "Ad resumed" : "Ad paused");
      qc.invalidateQueries({ queryKey: ["meta_ads"] });
      qc.invalidateQueries({ queryKey: ["meta_ad", adId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setStatusBusy(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading ad…</div>;
  }
  if (!ad) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="text-sm font-medium">Ad not found</div>
        <Button variant="outline" onClick={() => navigate("/ads")}>Back to ads</Button>
      </div>
    );
  }

  return (
    <div className="h-full -m-6 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-border bg-card flex items-center px-4 gap-3 relative z-30">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate max-w-[50vw]">{ad.name || "Untitled ad"}</span>
          <Badge variant={isPaused ? "secondary" : "default"} className="text-[10px]">{ad.effective_status || "UNKNOWN"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {metaUrl && (
            <Button variant="ghost" size="sm" onClick={() => window.open(metaUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Meta
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={toggleStatus} disabled={statusBusy}>
            {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaused ? <Play className="h-4 w-4 mr-1.5" /> : <Pause className="h-4 w-4 mr-1.5" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button size="sm" onClick={saveChanges} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save changes
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <AdSetSidebar />

        <div className="flex-1 min-w-0 border-r border-border bg-card/30 overflow-y-auto">
          <div className={cn("bg-gradient-to-r from-primary to-primary/70 px-4 py-3 text-white space-y-2")}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 bg-white/10 rounded-md p-0.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-white text-foreground">
                  <Edit3 className="h-3.5 w-3.5" /> Manual
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-md px-2.5 py-1 text-xs font-medium max-w-[280px]">
                <span className="truncate">{ad.campaign_name || "Campaign"} › {ad.adset_name || "Ad set"}</span>
              </div>
              <button
                type="button"
                onClick={() => setAccountsOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-w-[260px]"
              >
                <Plug className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{ad.page_name || state.pageName || "Connect accounts"}</span>
              </button>
            </div>
            <p className="text-xs opacity-80">
              Editing <span className="font-semibold">{ad.name || "this ad"}</span> · Changes to copy, CTA and link are pushed to Meta on save.
            </p>
          </div>

          <div className="p-5 pb-32 max-w-2xl">
            <ManualMode />
          </div>
        </div>

        <div className="w-[420px] flex-shrink-0 p-6 bg-muted/20 overflow-y-auto">
          <PreviewPane />
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-card border-t border-border p-3 z-40">
        <div className="max-w-2xl mx-auto lg:mx-0 lg:ml-[276px] space-y-1">
          <Button onClick={saveChanges} disabled={saving || !dirty} className="w-full h-12 text-sm font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save changes to Meta
          </Button>
          <div className="text-[10px] text-muted-foreground text-center">
            {dirty ? "Unsaved changes" : "All changes saved"} · Creative updates create a new creative and swap it in
          </div>
        </div>
      </div>

      <ConnectedAccountsModal open={accountsOpen} onOpenChange={setAccountsOpen} />
    </div>
  );
}

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
