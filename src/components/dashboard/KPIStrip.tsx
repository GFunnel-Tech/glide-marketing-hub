import { useMemo, useState } from "react";
import { Users, Activity, DollarSign, Target, Percent, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientSegments } from "@/hooks/useClientSegments";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { useClients } from "@/hooks/useDatabase";
import { KpiLabel } from "@/components/kpi/KpiLabel";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

function deriveImpressionsFromCpm(spend: number, cpm: number) {
  if (!cpm || cpm <= 0) return 0;
  return (spend / cpm) * 1000;
}


interface KPITileProps {
  label: string;
  kpiKey?: string;
  value: string;
  sublabel?: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconTone: "blue" | "green" | "amber" | "pink";
}

const TONE: Record<KPITileProps["iconTone"], string> = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  pink: "bg-destructive/10 text-destructive",
};

function KPITile({ label, kpiKey, value, sublabel, Icon, iconTone }: KPITileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <KpiLabel
            label={label}
            kpiKey={kpiKey}
            className="text-xs font-medium text-muted-foreground"
          />
          <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[iconTone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

type ClientSegmentKey =
  | "active" | "new" | "paused" | "relaunch" | "cancelled"
  | "learning" | "blocked" | "all";

const SEGMENT_OPTIONS: { key: ClientSegmentKey; label: string; statuses: string[] | "all" | "active" }[] = [
  { key: "active",    label: "Active",      statuses: "active" },
  { key: "new",       label: "New",         statuses: ["NEW"] },
  { key: "paused",    label: "Paused",      statuses: ["PAUSED"] },
  { key: "relaunch",  label: "Re-Launch",   statuses: ["RELAUNCH"] },
  { key: "learning",  label: "Learning",    statuses: ["LEARNING"] },
  { key: "cancelled", label: "Cancelled",   statuses: ["CANCELLED", "PENDING_CANCELLATION"] },
  { key: "blocked",   label: "Blocked",     statuses: ["BLOCKED"] },
  { key: "all",       label: "All time",    statuses: "all" },
];

// Statuses considered "active" for the default Total Clients view.
const INACTIVE_STATUSES = new Set([
  "PAUSED", "CANCELLED", "PENDING_CANCELLATION", "BLOCKED",
]);

function ClientCountTile({
  clients,
  segments,
}: {
  clients: any[];
  segments: { total: number; synced: number; inWorkflow: number };
}) {
  const [seg, setSeg] = useState<ClientSegmentKey>("active");
  const opt = SEGMENT_OPTIONS.find((o) => o.key === seg) ?? SEGMENT_OPTIONS[0];

  const count = useMemo(() => {
    if (opt.statuses === "all") return clients.length;
    if (opt.statuses === "active") {
      return clients.filter((c: any) => !INACTIVE_STATUSES.has(String(c.status))).length;
    }
    const set = new Set(opt.statuses);
    return clients.filter((c: any) => set.has(String(c.status))).length;
  }, [clients, opt]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                {opt.label} Clients
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Show
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={seg} onValueChange={(v) => setSeg(v as ClientSegmentKey)}>
                {SEGMENT_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.key} value={o.key} className="text-xs">
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{count}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            of {segments.total} total · {segments.synced} synced
          </p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE.blue)}>
          <Users className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}


export function KPIStrip() {
  const { data: rangeMetrics = {}, isFetching } = useClientsRangeMetrics();
  const { label } = useDateRange();
  const { data: clients = [] } = useClients();


  // All client counts come from one source of truth so the dashboard can never
  // show two unexplained totals. Each number is labelled with its denominator.
  const segments = useClientSegments();

  const totals = Object.values(rangeMetrics).reduce(
    (acc, m) => {
      acc.spend += m.spend;
      acc.reportedLeads += m.reportedLeads;
      acc.trueLeads += m.trueLeads;
      // Sum the honest per-client lead count (deduped, with reported fallback)
      // so the portfolio total never inflates and CPL reconciles with spend.
      acc.effectiveLeads += m.effectiveLeads;
      acc.clicks += m.clicks;
      return acc;
    },
    { spend: 0, reportedLeads: 0, trueLeads: 0, effectiveLeads: 0, clicks: 0 }
  );

  const totalLeads = totals.effectiveLeads;
  const blendedCvr = totals.clicks > 0 ? (totals.reportedLeads / totals.clicks) * 100 : 0;
  // Surface when Meta over-reports vs the deduped count so the honest headline
  // is explainable rather than just looking "low".
  const dedupRemoved = Math.max(0, totals.reportedLeads - totals.effectiveLeads);
  const sub = isFetching ? "updating…" : label;

  // Spend and CPL are grouped by currency — CAD and USD are never summed into
  // one blended number. Highest-spend currency leads each tile; the rest go in
  // the sublabel.
  const currencyGroups = (() => {
    const map = new Map<string, { spend: number; leads: number }>();
    for (const m of Object.values(rangeMetrics)) {
      const cur = m.currency || "USD";
      const g = map.get(cur) ?? { spend: 0, leads: 0 };
      g.spend += m.spend;
      g.leads += m.effectiveLeads;
      map.set(cur, g);
    }
    return [...map.entries()]
      .map(([currency, g]) => ({ currency, spend: g.spend, leads: g.leads, cpl: g.leads > 0 ? g.spend / g.leads : 0 }))
      .sort((a, b) => b.spend - a.spend);
  })();
  const money = (v: number, currency: string, decimals = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency === "MIXED" ? "USD" : currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(v) + (currency === "MIXED" ? " (mixed)" : "");
  const primary = currencyGroups[0] ?? { currency: "USD", spend: 0, leads: 0, cpl: 0 };
  const others = currencyGroups.slice(1);
  const spendSub = others.length ? others.map(g => money(g.spend, g.currency)).join(" · ") : sub;
  const cplSub = others.length ? others.map(g => money(g.cpl, g.currency, 2)).join(" · ") : sub;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <ClientCountTile clients={clients} segments={segments} />
      <KPITile label="Total Leads" kpiKey="leads" value={totalLeads.toLocaleString()} sublabel={dedupRemoved > 0 ? `${sub} · deduped (−${dedupRemoved.toLocaleString()} vs Meta)` : sub} Icon={Activity} iconTone="green" />
      <KPITile label={others.length ? `CPL (${primary.currency})` : "Blended CPL"} kpiKey="cpl" value={money(primary.cpl, primary.currency, 2)} sublabel={cplSub} Icon={Target} iconTone="amber" />
      <KPITile label="Form CVR" kpiKey="formcvr" value={`${blendedCvr.toFixed(2)}%`} sublabel={sub} Icon={Percent} iconTone="green" />
      <KPITile label={others.length ? `Ad Spend (${primary.currency})` : "Total Ad Spend"} kpiKey="spend" value={money(primary.spend, primary.currency)} sublabel={spendSub} Icon={DollarSign} iconTone="pink" />
    </div>
  );
}
