import { useMemo, useState } from "react";
import { useMetaAds, classifyAd, type AdClass, type MetaAd } from "@/hooks/useMetaAds";
import { useClients } from "@/hooks/useDatabase";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { CreativeCard } from "@/components/creatives/CreativeCard";
import { BreakdownTable } from "@/components/creatives/BreakdownTable";
import { AdDetailDrawer } from "@/components/creatives/AdDetailDrawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "best" | "worst" | "learning";

export default function Creatives() {
  const { hasConnection, isLoading: connLoading } = useHasActiveMetaConnection();
  const { data: clients = [] } = useClients();
  const { data: ads = [], isLoading } = useMetaAds();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<{ ad: MetaAd; klass: AdClass; clientName: string | null } | null>(null);

  // For now use sensible defaults; can be wired to kpi_threshold_presets later
  const greenCpl = 30;
  const redCpl = 60;

  const enriched = useMemo(() => {
    return ads.map((ad) => ({
      ad,
      klass: classifyAd(ad, { greenCpl, redCpl }),
      clientName: clients.find((c) => c.id === ad.client_id)?.name ?? null,
    }));
  }, [ads, clients]);

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (clientFilter !== "all" && String(e.ad.client_id) !== clientFilter) return false;
      if (statusFilter !== "all" && e.klass !== statusFilter) return false;
      return true;
    });
  }, [enriched, clientFilter, statusFilter]);

  const grouped: Record<AdClass, typeof enriched> = {
    best: filtered.filter((e) => e.klass === "best"),
    learning: filtered.filter((e) => e.klass === "learning"),
    worst: filtered.filter((e) => e.klass === "worst"),
    unclassified: [],
  };

  if (connLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Creatives</h1>
        <p className="text-sm text-muted-foreground">
          See which ads, headlines, copy, and audiences are winning — broken down so you can replicate them.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        {(["all", "best", "learning", "worst"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {enriched.length} ads · last 30 days
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading creatives…</div>
      ) : enriched.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No ads synced yet. Trigger a Meta sync from the dashboard to populate creatives.
        </div>
      ) : (
        <>
          <ColumnSection title="Best performers" icon={Sparkles} tone="success" items={grouped.best} onSelect={setSelected} />
          <ColumnSection title="Learning" icon={Loader2} tone="warning" items={grouped.learning} spin onSelect={setSelected} />
          <ColumnSection title="Worst performers" icon={AlertTriangle} tone="destructive" items={grouped.worst} onSelect={setSelected} />

          <div className="pt-4">
            <h2 className="text-lg font-semibold text-foreground mb-3">What's working — by element</h2>
            <Tabs defaultValue="creative">
              <TabsList>
                <TabsTrigger value="creative">Creatives</TabsTrigger>
                <TabsTrigger value="title">Headlines</TabsTrigger>
                <TabsTrigger value="body">Primary copy</TabsTrigger>
                <TabsTrigger value="audience">Audiences</TabsTrigger>
              </TabsList>
              <TabsContent value="creative" className="mt-3">
                <BreakdownTable ads={filtered.map((e) => e.ad)} dim="creative" greenCpl={greenCpl} redCpl={redCpl} />
              </TabsContent>
              <TabsContent value="title" className="mt-3">
                <BreakdownTable ads={filtered.map((e) => e.ad)} dim="title" greenCpl={greenCpl} redCpl={redCpl} />
              </TabsContent>
              <TabsContent value="body" className="mt-3">
                <BreakdownTable ads={filtered.map((e) => e.ad)} dim="body" greenCpl={greenCpl} redCpl={redCpl} />
              </TabsContent>
              <TabsContent value="audience" className="mt-3">
                <BreakdownTable ads={filtered.map((e) => e.ad)} dim="audience" greenCpl={greenCpl} redCpl={redCpl} />
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </div>
  );
}

function ColumnSection({
  title,
  icon: Icon,
  tone,
  items,
  spin,
}: {
  title: string;
  icon: any;
  tone: "success" | "warning" | "destructive";
  items: { ad: any; klass: AdClass; clientName: string | null }[];
  spin?: boolean;
}) {
  if (!items.length) return null;
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-destructive";
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("h-4 w-4", toneClass, spin && "animate-spin")} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.slice(0, 12).map((it) => (
          <CreativeCard key={it.ad.id} ad={it.ad} klass={it.klass} clientName={it.clientName} />
        ))}
      </div>
    </section>
  );
}
