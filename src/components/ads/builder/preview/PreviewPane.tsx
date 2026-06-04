import { useAdDraftStore } from "@/stores/adDraftStore";
import { ThumbsUp, MessageCircle, Share2, MoreHorizontal, Bookmark, Heart, Maximize2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Surface = "feed" | "story" | "reels";

export function PreviewPane() {
  const state = useAdDraftStore((s) => s.state);
  const [platform, setPlatform] = useState<"facebook" | "instagram">("facebook");
  const [surface, setSurface] = useState<Surface>("feed");

  const media = state.media[0] ?? state.bankImages[0];
  const primary = state.primaryTexts[0] || "Your ad copy will appear here once you start typing.";
  const headline = state.headlines[0] || state.pageName || "Headline";
  const cta = state.cta.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const pageName = state.pageName || "Your Page";
  const caption = state.caption || "";

  return (
    <div className="sticky top-4">
      <div className="rounded-xl border border-border bg-card p-3 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-foreground">Preview</div>
          <button className="text-muted-foreground hover:text-foreground" title="Expand">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Platform icons */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setPlatform("facebook")}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
              platform === "facebook"
                ? "bg-[#1877F2] text-white ring-2 ring-[#1877F2]/30"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
            title="Facebook"
          >f</button>
          <button
            onClick={() => setPlatform("instagram")}
            className={cn(
              "h-7 w-7 rounded-md transition-all",
              platform === "instagram"
                ? "bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 ring-2 ring-pink-500/30"
                : "bg-muted hover:bg-accent",
            )}
            title="Instagram"
          />
        </div>

        {/* Surface tabs (Feed / Story / Reels) */}
        <div className="grid grid-cols-3 rounded-lg bg-muted p-0.5 mb-3 text-xs">
          {(["feed", "story", "reels"] as Surface[]).map((s) => (
            <button
              key={s}
              onClick={() => setSurface(s)}
              className={cn(
                "py-1.5 rounded-md font-medium capitalize transition-colors",
                surface === s ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800/60 p-3">
          {caption && (
            <div className="text-[11px] text-muted-foreground italic mb-2 px-1 line-clamp-2">{caption}</div>
          )}

          {surface === "feed" && platform === "facebook" && (
            <FacebookCard media={media?.url} mediaType={media?.type} primary={primary} headline={headline} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} displayLink={state.displayLink} />
          )}
          {surface === "feed" && platform === "instagram" && (
            <InstagramCard media={media?.url} mediaType={media?.type} primary={primary} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} />
          )}
          {surface === "story" && (
            <StoryCard media={media?.url} mediaType={media?.type} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} />
          )}
          {surface === "reels" && (
            <ReelsCard media={media?.url} mediaType={media?.type} primary={primary} cta={cta} pageName={pageName} pageAvatar={state.pageAvatar} />
          )}
        </div>
      </div>
    </div>
  );
}

function MediaSlot({ url, type, aspect = "aspect-square" }: { url?: string; type?: "image" | "video"; aspect?: string }) {
  if (!url) {
    return (
      <div className={cn(aspect, "bg-gradient-to-br from-amber-50 to-blue-100 dark:from-amber-950/40 dark:to-blue-950/40 flex items-center justify-center relative")}>
        <div className="absolute inset-4 border-2 border-dashed border-foreground/15 rounded-lg" />
        <div className="text-xs text-muted-foreground">Add media to see ad examples.</div>
      </div>
    );
  }
  if (type === "video") return <video src={url} className={cn("w-full object-cover", aspect)} muted autoPlay loop playsInline />;
  return <img src={url} alt="" className={cn("w-full object-cover", aspect)} />;
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
      <div className="px-3 pb-2 text-sm text-foreground whitespace-pre-wrap line-clamp-4">{primary}</div>
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

function StoryCard({ media, mediaType, cta, pageName, pageAvatar }: any) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-black mx-auto" style={{ aspectRatio: "9/16", maxWidth: 240 }}>
      <div className="absolute inset-0">
        <MediaSlot url={media} type={mediaType} aspect="h-full w-full" />
      </div>
      <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
            <div className="w-full h-full rounded-full bg-background overflow-hidden">
              {pageAvatar ? <img src={pageAvatar} alt="" className="w-full h-full object-cover" /> : null}
            </div>
          </div>
          <div className="text-white text-xs font-semibold drop-shadow">{pageName}</div>
          <div className="text-white/70 text-[10px]">Sponsored</div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-3 px-3">
        <button className="w-full bg-white text-black rounded-full py-2 text-xs font-semibold">{cta} ›</button>
      </div>
    </div>
  );
}

function ReelsCard({ media, mediaType, primary, cta, pageName, pageAvatar }: any) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-black mx-auto" style={{ aspectRatio: "9/16", maxWidth: 240 }}>
      <div className="absolute inset-0">
        <MediaSlot url={media} type={mediaType} aspect="h-full w-full" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
            <div className="w-full h-full rounded-full bg-background overflow-hidden">
              {pageAvatar ? <img src={pageAvatar} alt="" className="w-full h-full object-cover" /> : null}
            </div>
          </div>
          <div className="text-white text-xs font-semibold drop-shadow">{pageName}</div>
          <button className="ml-auto text-[10px] text-white border border-white/70 rounded px-2 py-0.5">Follow</button>
        </div>
        <div className="text-white text-[11px] line-clamp-2 mb-2 drop-shadow">{primary}</div>
        <button className="w-full bg-white text-black rounded-md py-1.5 text-xs font-semibold">{cta}</button>
      </div>
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-3 text-white">
        <Heart className="h-5 w-5 drop-shadow" />
        <MessageCircle className="h-5 w-5 drop-shadow" />
        <Share2 className="h-5 w-5 drop-shadow" />
      </div>
    </div>
  );
}
