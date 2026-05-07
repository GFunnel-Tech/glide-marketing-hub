import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetaAd, AdClass } from "@/hooks/useMetaAds";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Image as ImageIcon, ExternalLink, Sparkles, AlertTriangle, Loader2, Calendar, Users, Target, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const STATUS: Record<AdClass, { label: string; cls: string; Icon: any }> = {
  best: { label: "Best", cls: "bg-success/15 text-success border-success/30", Icon: Sparkles },
  worst: { label: "Worst", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  learning: { label: "Learning", cls: "bg-warning/15 text-warning border-warning/30", Icon: Loader2 },
  unclassified: { label: "—", cls: "bg-muted text-muted-foreground", Icon: ImageIcon },
};

interface DailyPoint {
  date: string;
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  cpl: number;
}

function useAdTrend(adId: string | null, workspaceId: string | null) {
  return useQuery({
    queryKey: ["meta_ad_trend", workspaceId, adId],
    enabled: !!adId && !!workspaceId,
    queryFn: async (): Promise<DailyPoint[]> => {
      const { data, error } = await (supabase as any)
        .from("meta_insights_granular_daily")
        .select("date, spend, leads, clicks, impressions")
        .eq("workspace_id", workspaceId)
        .eq("level", "ad")
        .eq("object_id", adId)
        .order("date", { ascending: true })
        .limit(90);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        date: d.date,
        spend: Number(d.spend) || 0,
        leads: Number(d.leads) || 0,
        clicks: Number(d.clicks) || 0,
        impressions: Number(d.impressions) || 0,
        cpl: Number(d.leads) > 0 ? Number(d.spend) / Number(d.leads) : 0,
      }));
    },
  });
}

export function AdDetailDrawer({
  ad,
  klass,
  clientName,
  open,
  onOpenChange,
}: {
  ad: MetaAd | null;
  klass: AdClass;
  clientName?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: trend = [], isLoading: trendLoading } = useAdTrend(
    ad?.id ?? null,
    ad?.workspace_id ?? null,
  );

  if (!ad) return null;
  const s = STATUS[klass];
  const Icon = s.Icon;

  const targeting = ad.targeting_summary ?? {};
  const ageMin = targeting?.age_min;
  const ageMax = targeting?.age_max;
  const genders = Array.isArray(targeting?.genders) ? targeting.genders : null;
  const geos = targeting?.geo_locations ?? null;
  const interests = Array.isArray(targeting?.flexible_spec?.[0]?.interests)
    ? targeting.flexible_spec[0].interests.map((i: any) => i.name).filter(Boolean)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", s.cls)}>
              <Icon className={cn("h-3 w-3", klass === "learning" && "animate-spin")} />
              {s.label}
            </span>
            {clientName && <span className="text-[10px] font-medium text-primary uppercase tracking-wider">{clientName}</span>}
            {ad.effective_status && (
              <span className="text-[10px] text-muted-foreground uppercase">{ad.effective_status}</span>
            )}
          </div>
          <SheetTitle className="text-left">{ad.title || ad.name || "Untitled ad"}</SheetTitle>
          {ad.campaign_name && (
            <SheetDescription className="text-left">
              Campaign · {ad.campaign_name}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Creative */}
          <div className="rounded-lg border border-border overflow-hidden bg-muted/40">
            <div className="aspect-video flex items-center justify-center">
              {ad.thumbnail_url ? (
                <img src={ad.thumbnail_url} alt={ad.title ?? "Ad"} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Performance summary */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Spend" value={`$${Math.round(ad.spend).toLocaleString()}`} />
            <Stat label="Leads" value={ad.leads.toString()} />
            <Stat label="CPL" value={ad.cpl > 0 ? `$${ad.cpl.toFixed(2)}` : "—"} />
            <Stat label="CTR" value={`${ad.ctr.toFixed(2)}%`} />
            <Stat label="Impr." value={ad.impressions.toLocaleString()} />
            <Stat label="Clicks" value={ad.clicks.toLocaleString()} />
            <Stat label="Days active" value={ad.days_active.toString()} />
            <Stat label="CTA" value={ad.call_to_action_type || "—"} />
          </div>

          {/* Trend chart */}
          <Section title="Performance trend (daily)" icon={Calendar}>
            {trendLoading ? (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading trend…
              </div>
            ) : trend.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                No daily insights for this ad yet.
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(d) => d?.slice(5)} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Spend" />
                    <Line yAxisId="right" type="monotone" dataKey="leads" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Leads" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          {/* Copy */}
          <Section title="Headline" icon={Sparkles}>
            <p className="text-sm text-foreground whitespace-pre-wrap">{ad.title || <span className="text-muted-foreground">No headline</span>}</p>
          </Section>

          <Section title="Primary copy" icon={MousePointerClick}>
            <p className="text-sm text-foreground whitespace-pre-wrap">{ad.body || <span className="text-muted-foreground">No body copy</span>}</p>
          </Section>

          {/* Audience */}
          <Section title="Audience" icon={Users}>
            <div className="space-y-1.5 text-sm">
              {ad.adset_name && (
                <Row label="Ad set" value={ad.adset_name} />
              )}
              {(ageMin || ageMax) && (
                <Row label="Age" value={`${ageMin ?? "?"} – ${ageMax ?? "?"}`} />
              )}
              {genders && (
                <Row label="Gender" value={genders.map((g: number) => (g === 1 ? "Male" : g === 2 ? "Female" : "All")).join(", ")} />
              )}
              {geos?.countries && (
                <Row label="Countries" value={geos.countries.join(", ")} />
              )}
              {geos?.cities && Array.isArray(geos.cities) && (
                <Row label="Cities" value={geos.cities.map((c: any) => c.name).join(", ")} />
              )}
              {interests.length > 0 && (
                <Row label="Interests" value={interests.join(", ")} />
              )}
              {!ad.adset_name && !ageMin && !genders && !geos && interests.length === 0 && (
                <p className="text-xs text-muted-foreground">No audience details available.</p>
              )}
            </div>
          </Section>

          {/* Identifiers */}
          <Section title="Identifiers" icon={Target}>
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              <Row label="Ad ID" value={ad.id} mono />
              {ad.creative_id && <Row label="Creative" value={ad.creative_id} mono />}
              {ad.creative_hash && <Row label="Creative hash" value={ad.creative_hash} mono />}
            </div>
          </Section>

          {ad.link_url && (
            <a
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              View landing page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-2 py-1.5">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-semibold text-foreground tabular-nums text-sm truncate">{value}</div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground min-w-[80px]">{label}</span>
      <span className={cn("text-foreground break-all", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}
