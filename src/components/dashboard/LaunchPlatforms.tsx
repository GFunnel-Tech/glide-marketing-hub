import { useNavigate } from "react-router-dom";
import { Facebook, Search, Music2, Linkedin, Music, Globe, Ghost, Mail, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";

type Platform = {
  key: string;
  label: string;
  icon: any;
  tint: string;
  status: "active" | "coming-soon";
};

const PLATFORMS: Platform[] = [
  { key: "meta",       label: "Meta",        icon: Facebook,  tint: "bg-blue-500/10 text-blue-600",            status: "active" },
  { key: "google",     label: "Google",      icon: Search,    tint: "bg-amber-500/10 text-amber-600",          status: "coming-soon" },
  { key: "tiktok",     label: "TikTok",      icon: Music2,    tint: "bg-foreground/10 text-foreground",        status: "coming-soon" },
  { key: "linkedin",   label: "LinkedIn",    icon: Linkedin,  tint: "bg-sky-600/10 text-sky-700",              status: "coming-soon" },
  { key: "spotify",    label: "Spotify",     icon: Music,     tint: "bg-emerald-500/10 text-emerald-600",      status: "coming-soon" },
  { key: "bing",       label: "Bing",        icon: Globe,     tint: "bg-cyan-500/10 text-cyan-600",            status: "coming-soon" },
  { key: "snapchat",   label: "Snapchat",    icon: Ghost,     tint: "bg-yellow-400/20 text-yellow-700",        status: "coming-soon" },
  { key: "directmail", label: "Direct Mail", icon: Mail,      tint: "bg-orange-500/10 text-orange-600",        status: "coming-soon" },
];

export function LaunchPlatforms() {
  const navigate = useNavigate();
  const { hasConnection } = useHasActiveMetaConnection();

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Launch</h3>
            <p className="text-xs text-muted-foreground">Pick a platform to create your next campaign.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        {PLATFORMS.map((p) => {
          const isActive = p.status === "active";
          const cta = isActive
            ? (hasConnection ? "Create Ad" : "Connect")
            : "Coming soon";
          return (
            <button
              key={p.key}
              type="button"
              disabled={!isActive}
              onClick={() => {
                if (!isActive) return;
                if (!hasConnection) navigate("/settings?tab=integrations");
                else navigate("/ads/new");
              }}
              className={cn(
                "group relative flex flex-col items-center justify-between rounded-lg border p-3 transition-all",
                isActive
                  ? "border-border bg-background hover:border-primary/50 hover:bg-accent/40 active:scale-[0.99] cursor-pointer"
                  : "border-dashed border-border bg-muted/30 cursor-not-allowed opacity-70"
              )}
            >
              {!isActive && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground border border-border">
                  <Lock className="h-2.5 w-2.5" />
                  Soon
                </span>
              )}
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full mb-2", p.tint)}>
                <p.icon className="h-5 w-5" />
              </div>
              <div className="text-xs font-semibold text-foreground">{p.label}</div>
              <div
                className={cn(
                  "mt-2 w-full text-center text-[11px] font-medium rounded-md py-1.5 px-2 truncate",
                  isActive
                    ? "bg-primary text-primary-foreground group-hover:bg-primary/90"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {cta}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
