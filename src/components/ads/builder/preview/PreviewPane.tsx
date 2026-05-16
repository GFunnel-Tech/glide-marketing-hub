import { useAdDraftStore } from "@/stores/adDraftStore";
import { ThumbsUp, MessageCircle, Share2, MoreHorizontal, Bookmark, Heart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function PreviewPane() {
  const state = useAdDraftStore((s) => s.state);
  const [platform, setPlatform] = useState<"facebook" | "instagram">("facebook");

  const media = state.media[0] ?? state.bankImages[0];
  const primary = state.primaryTexts[0] || "Your ad copy will appear here once you start typing.";
  const headline = state.headlines[0] || state.pageName || "Headline";
  const cta = state.cta.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const pageName = state.pageName || "Your Page";

  return (
    <div className="sticky top-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">Ad Set 1</div>
        <button className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2.5 py-1" disabled title="Multiple ad sets coming soon">+ Add More Ad Sets</button>
        <div className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">Ad combinations ⓘ</div>
      </div>

      <div className="flex justify-center gap-6 mb-4">
        <button onClick={() => setPlatform("facebook")} className={cn("flex flex-col items-center gap-1 px-3 pb-2 border-b-2 transition-colors", platform === "facebook" ? "border-[#1877F2] text-foreground" : "border-transparent text-muted-foreground")}>
          <div className="w-6 h-6 rounded-full bg-[#1877F2] text-white flex items-center justify-center text-sm font-bold">f</div>
          <span className="text-xs">Facebook</span>
        </button>
        <button onClick={() => setPlatform("instagram")} className={cn("flex flex-col items-center gap-1 px-3 pb-2 border-b-2 transition-colors", platform === "instagram" ? "border-pink-500 text-foreground" : "border-transparent text-muted-foreground")}>
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600" />
          <span className="text-xs">Instagram</span>
        </button>
      </div>

      <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-4 max-w-sm mx-auto">
        {platform === "facebook" ? (
          <FacebookCard media={media?.url} mediaType={media?.type} primary={primary} headline={headline} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} displayLink={state.displayLink} />
        ) : (
          <InstagramCard media={media?.url} mediaType={media?.type} primary={primary} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} />
        )}
      </div>
    </div>
  );
}

function MediaSlot({ url, type }: { url?: string; type?: "image" | "video" }) {
  if (!url) {
    return (
      <div className="aspect-[4/3] bg-gradient-to-br from-amber-50 to-blue-100 dark:from-amber-950/40 dark:to-blue-950/40 flex items-center justify-center relative">
        <div className="absolute inset-4 border-2 border-dashed border-foreground/15 rounded-lg" />
        <div className="text-xs text-muted-foreground">Add media to see ad examples.</div>
      </div>
    );
  }
  if (type === "video") return <video src={url} className="w-full aspect-square object-cover" muted autoPlay loop playsInline />;
  return <img src={url} alt="" className="w-full aspect-square object-cover" />;
}

function FacebookCard({ media, mediaType, primary, headline, cta, pageName, pageAvatar, displayLink }: any) {
  return (
    <div className="bg-white dark:bg-card rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
          {pageAvatar ? <img src={pageAvatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground line-clamp-1">{pageName}</div>
          <div className="text-[11px] text-muted-foreground">Sponsored · 🌐</div>
        </div>
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="px-3 pb-2 text-sm text-foreground whitespace-pre-wrap">{primary}</div>
      <MediaSlot url={media} type={mediaType} />
      <div className="bg-muted/40 px-3 py-2.5 flex items-center justify-between border-t border-border/40">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-muted-foreground line-clamp-1">{displayLink || "example.com"}</div>
          <div className="text-sm font-semibold text-foreground line-clamp-1">{headline}</div>
        </div>
        <button className="bg-muted hover:bg-accent text-foreground text-xs font-medium rounded-md px-3 py-1.5 whitespace-nowrap">{cta}</button>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-[#1877F2] text-white text-[8px] flex items-center justify-center">👍</div>991</span>
        <span>265 comments · 77 shares</span>
      </div>
      <div className="flex border-t border-border/40">
        <FBAction icon={<ThumbsUp className="h-4 w-4" />} label="Like" />
        <FBAction icon={<MessageCircle className="h-4 w-4" />} label="Comment" />
        <FBAction icon={<Share2 className="h-4 w-4" />} label="Share" />
      </div>
    </div>
  );
}

function FBAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">
      {icon}{label}
    </button>
  );
}

function InstagramCard({ media, mediaType, primary, cta, pageName, pageAvatar }: any) {
  return (
    <div className="bg-white dark:bg-card rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
          <div className="w-full h-full rounded-full bg-background overflow-hidden">
            {pageAvatar ? <img src={pageAvatar} alt="" className="w-full h-full object-cover" /> : null}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground line-clamp-1">{pageName}</div>
          <div className="text-[10px] text-muted-foreground">Sponsored</div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <MediaSlot url={media} type={mediaType} />
      <div className="bg-muted/50 px-3 py-2 text-center text-sm font-medium text-foreground border-t border-border/40 flex items-center justify-between">
        <span>{cta}</span>
        <span className="text-muted-foreground">›</span>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 text-foreground">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Share2 className="h-5 w-5" />
        <Bookmark className="h-5 w-5 ml-auto" />
      </div>
      <div className="px-3 pb-3 text-xs text-foreground">
        <span className="font-semibold">{pageName}</span>{" "}
        <span className="line-clamp-2">{primary}</span>
      </div>
    </div>
  );
}
