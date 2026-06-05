import { Users, Activity, DollarSign, Target, Percent } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useClients, useCampaigns, useClientsWithMetaAccount } from "@/hooks/useDatabase";
import { useArchivedSet } from "@/hooks/useArchivedEntities";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { KpiLabel } from "@/components/kpi/KpiLabel";

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

export function KPIStrip() {
  const { data: clients = [] } = useClients();
  const { data: allCampaigns = [] } = useCampaigns();
  const { data: clientsWithMetaAcct = new Set<number>() } = useClientsWithMetaAccount();
  const archivedSet = useArchivedSet();
  const { data: rangeMetrics = {}, isFetching } = useClientsRangeMetrics();
  const { label } = useDateRange();

  // "Fully synced" = GHL sub-account linked + Meta ad account mapped.
  // Active Clients = fully synced + recent campaign activity + not archived.
  const fullySyncedClients = useMemo(
    () => clients.filter((c: any) => !!c.ghlLocationId && clientsWithMetaAcct.has(Number(c.id))),
    [clients, clientsWithMetaAcct],
  );

  // Active = every client. Cancelled/blocked clients can be marked later.
  const activeClientCount = clients.length;

  const totals = Object.values(rangeMetrics).reduce(
    (acc, m) => {
      acc.spend += m.spend;
      acc.reportedLeads += m.reportedLeads;
      acc.trueLeads += m.trueLeads;
      acc.clicks += m.clicks;
      return acc;
    },
    { spend: 0, reportedLeads: 0, trueLeads: 0, clicks: 0 }
  );

  const totalLeads = Math.max(totals.reportedLeads, totals.trueLeads);
  const blendedCpl = totalLeads > 0 ? totals.spend / totalLeads : 0;
  const blendedCvr = totals.clicks > 0 ? (totals.reportedLeads / totals.clicks) * 100 : 0;
  const sub = isFetching ? "updating…" : label;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <KPITile label="Total Clients" value={String(clients.length)} sublabel={`${activeClientCount} active · ${fullySyncedClients.length} synced`} Icon={Users} iconTone="blue" />
      <KPITile label="Total Leads" kpiKey="leads" value={totalLeads.toLocaleString()} sublabel={sub} Icon={Activity} iconTone="green" />
      <KPITile label="Blended CPL" kpiKey="cpl" value={`$${blendedCpl.toFixed(2)}`} sublabel={sub} Icon={Target} iconTone="amber" />
      <KPITile label="Form CVR" kpiKey="formcvr" value={`${blendedCvr.toFixed(2)}%`} sublabel={sub} Icon={Percent} iconTone="green" />
      <KPITile label="Total Ad Spend" kpiKey="spend" value={`$${Math.round(totals.spend).toLocaleString()}`} sublabel={sub} Icon={DollarSign} iconTone="pink" />
    </div>
  );
}
