import { MetaAd, AdClass } from "@/hooks/useMetaAds";
import { Image as ImageIcon, ExternalLink, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS: Record<AdClass, { label: string; cls: string; Icon: any }> = {
  best: { label: "Best", cls: "bg-success/15 text-success border-success/30", Icon: Sparkles },
  worst: { label: "Worst", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  learning: { label: "Learning", cls: "bg-warning/15 text-warning border-warning/30", Icon: Loader2 },
  unclassified: { label: "—", cls: "bg-muted text-muted-foreground", Icon: ImageIcon },
};

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
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all flex flex-col cursor-pointer text-left"
    >
      <div className="relative aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
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
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        <span className={cn("absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", s.cls)}>
          <Icon className={cn("h-3 w-3", klass === "learning" && "animate-spin")} />
          {s.label}
        </span>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        {clientName && <span className="text-[10px] font-medium text-primary uppercase tracking-wider">{clientName}</span>}
        <p className="text-sm font-semibold text-foreground line-clamp-1">{ad.title || ad.name || "Untitled ad"}</p>
        {ad.body && <p className="text-xs text-muted-foreground line-clamp-2">{ad.body}</p>}
        {ad.adset_name && (
          <p className="text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/70">Audience · </span>
            <span className="text-foreground/80">{ad.adset_name}</span>
          </p>
        )}

        <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-border text-[11px]">
          <Stat label="Spend" value={`$${Math.round(ad.spend).toLocaleString()}`} />
          <Stat label="Leads" value={ad.leads.toString()} />
          <Stat label="CPL" value={ad.cpl > 0 ? `$${ad.cpl.toFixed(2)}` : "—"} />
          <Stat label="CTR" value={`${(ad.ctr).toFixed(2)}%`} />
        </div>
      </div>

      {ad.link_url && (
        <a
          href={ad.link_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary border-t border-border py-1.5"
        >
          View landing page <ExternalLink className="h-3 w-3" />
        </a>
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
