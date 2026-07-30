import { MetaAd, AdClass } from "@/hooks/useMetaAds";
import { Image as ImageIcon, Sparkles, AlertTriangle, Loader2, Play, MoreHorizontal, ThumbsUp, MessageCircle, Share2, Globe, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { metaAdsManagerUrl } from "@/lib/metaAdsLink";

const STATUS: Record<AdClass, { label: string; cls: string; Icon: any }> = {
  best: { label: "Best", cls: "bg-success/15 text-success border-success/30", Icon: Sparkles },
  worst: { label: "Worst", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  learning: { label: "Learning", cls: "bg-warning/15 text-warning border-warning/30", Icon: Loader2 },
  unclassified: { label: "—", cls: "bg-muted text-muted-foreground", Icon: ImageIcon },
};

// Friendly labels for Meta call-to-action types (e.g. LEARN_MORE → "Learn More")
function ctaLabel(cta: string | null): string {
  if (!cta) return "Learn More";
  return cta
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return null;
  }
}

export function CreativeCard({
  ad,
  klass,
  clientName,
  onClick,
}: {
  ad: MetaAd;
  klass: AdClass;
  clientName?: string | null;
  onClick?: () => void;
}) {
  const s = STATUS[klass];
  const Icon = s.Icon;
  const pageName = ad.page_name ?? clientName ?? "Sponsored";
  const initials = pageName.slice(0, 2).toUpperCase();
  const isVideo = ad.media_type === "video" || !!ad.video_id;
  const hostname = hostnameOf(ad.link_url);
  const cpl = ad.cpl > 0 ? `$${ad.cpl.toFixed(2)}` : "—";
  const adsManagerUrl = metaAdsManagerUrl({ adAccountId: ad.ad_account_id, adId: ad.id });

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all flex flex-col cursor-pointer text-left"
    >
      {/* FB-style header */}
      <div className="flex items-start gap-2 p-3 pb-2">
        {ad.page_avatar_url ? (
          <img
            src={ad.page_avatar_url}
            alt={pageName}
            className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{pageName}</p>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            Sponsored · <Globe className="h-3 w-3" />
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            s.cls,
          )}
        >
          <Icon className={cn("h-3 w-3", klass === "learning" && "animate-spin")} />
          {s.label}
        </span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>

      {/* Primary copy */}
      {ad.body && (
        <p className="px-3 pb-2 text-[13px] text-foreground/90 line-clamp-3 whitespace-pre-line">
          {ad.body}
        </p>
      )}

      {/* Media */}
      <div className="relative aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
        {(ad.image_url || ad.thumbnail_url) ? (
          <img
            src={ad.image_url ?? ad.thumbnail_url ?? ""}
            alt={ad.title ?? ad.name ?? "Ad"}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (ad.thumbnail_url && img.src !== ad.thumbnail_url) {
                img.src = ad.thumbnail_url;
              }
            }}
          />
        ) : (
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-14 w-14 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-lg">
              <Play className="h-7 w-7 text-foreground fill-foreground ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* CTA bar (Meta-style) */}
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-y border-border">
        <div className="flex-1 min-w-0">
          {hostname && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
              {hostname}
            </p>
          )}
          <p className="text-sm font-semibold text-foreground line-clamp-1">
            {ad.title || ad.name || "Untitled ad"}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (ad.link_url) window.open(ad.link_url, "_blank", "noopener,noreferrer");
          }}
          className="flex-shrink-0 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold px-3 py-1.5 transition-colors"
        >
          {ctaLabel(ad.call_to_action_type)}
        </button>
      </div>

      {/* Reactions row (visual only) */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Like</span>
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Comment</span>
        <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> Share</span>
      </div>

      {/* Performance footer */}
      <div className="grid grid-cols-4 gap-1 px-3 py-2 border-t border-border text-[11px] bg-card">
        <Stat label="Spend" value={`$${Math.round(ad.spend).toLocaleString()}`} />
        <Stat label="Leads" value={ad.leads.toString()} />
        <Stat label="CPL" value={cpl} />
        <Stat label="CTR" value={`${ad.ctr.toFixed(2)}%`} />
      </div>
      {adsManagerUrl && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(adsManagerUrl, "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open in Meta Ads
          </button>
        </div>
      )}

      {clientName && (
        <div className="px-3 pb-2 -mt-1">
          <span className="text-[10px] font-medium text-primary uppercase tracking-wider">{clientName}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
