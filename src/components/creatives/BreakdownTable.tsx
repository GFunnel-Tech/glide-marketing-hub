import { useMemo } from "react";
import { MetaAd } from "@/hooks/useMetaAds";
import { cn } from "@/lib/utils";

type Dim = "creative" | "title" | "body" | "audience";

const LABELS: Record<Dim, string> = {
  creative: "Creative (image/video)",
  title: "Headline",
  body: "Primary copy",
  audience: "Audience",
};

function keyOf(ad: MetaAd, dim: Dim): { key: string; label: string; thumb?: string | null } | null {
  switch (dim) {
    case "creative":
      if (!ad.creative_hash) return null;
      return { key: ad.creative_hash, label: ad.title || ad.name || ad.creative_hash, thumb: ad.thumbnail_url };
    case "title":
      if (!ad.title) return null;
      return { key: ad.title, label: ad.title };
    case "body":
      if (!ad.body) return null;
      return { key: ad.body, label: ad.body };
    case "audience":
      if (!ad.adset_name) return null;
      return { key: ad.adset_name, label: ad.adset_name };
  }
}

export function BreakdownTable({ ads, dim, greenCpl, redCpl }: { ads: MetaAd[]; dim: Dim; greenCpl: number; redCpl: number }) {
  const rows = useMemo(() => {
    const m = new Map<string, { label: string; thumb?: string | null; usage: number; spend: number; leads: number; impressions: number; clicks: number; wins: number; }>();
    for (const a of ads) {
      const k = keyOf(a, dim);
      if (!k) continue;
      const r = m.get(k.key) ?? { label: k.label, thumb: k.thumb, usage: 0, spend: 0, leads: 0, impressions: 0, clicks: 0, wins: 0 };
      r.usage += 1;
      r.spend += a.spend;
      r.leads += a.leads;
      r.impressions += a.impressions;
      r.clicks += a.clicks;
      if (a.cpl > 0 && a.cpl <= greenCpl && a.spend >= 50) r.wins += 1;
      m.set(k.key, r);
    }
    return Array.from(m.values())
      .map((r) => ({
        ...r,
        cpl: r.leads > 0 ? r.spend / r.leads : 0,
        ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
        winRate: r.usage > 0 ? (r.wins / r.usage) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 50);
  }, [ads, dim, greenCpl]);

  if (rows.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">No data for {LABELS[dim].toLowerCase()} yet. Run a sync.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">{LABELS[dim]}</th>
            <th className="text-right font-medium px-3 py-2">Usage</th>
            <th className="text-right font-medium px-3 py-2">Spend</th>
            <th className="text-right font-medium px-3 py-2">Leads</th>
            <th className="text-right font-medium px-3 py-2">CPL</th>
            <th className="text-right font-medium px-3 py-2">CTR</th>
            <th className="text-right font-medium px-3 py-2">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cplClass = r.cpl === 0 ? "text-muted-foreground" : r.cpl <= greenCpl ? "text-success" : r.cpl >= redCpl ? "text-destructive" : "text-warning";
            return (
              <tr key={i} className="border-t border-border hover:bg-accent/30">
                <td className="px-3 py-2 max-w-md">
                  <div className="flex items-center gap-2">
                    {r.thumb && <img src={r.thumb} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
                    <span className="text-foreground line-clamp-2">{r.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.usage}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">${Math.round(r.spend).toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.leads}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", cplClass)}>{r.cpl > 0 ? `$${r.cpl.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.ctr.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.winRate.toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
