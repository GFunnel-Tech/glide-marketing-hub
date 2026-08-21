import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientHierarchyTable } from "@/components/dashboard/ClientHierarchyTable";
import { DailyFocus } from "@/components/dashboard/DailyFocus";
import { TodaysTasksPanel } from "@/components/dashboard/TodaysTasksPanel";
import { AtRiskClientsCard } from "@/components/dashboard/AtRiskClientsCard";
import { MorningBriefDialog } from "@/components/dashboard/MorningBriefDialog";
import { PaymentAlertBanner } from "@/components/billing/PaymentAlertBanner";
import { MetaScopeBanner } from "@/components/integrations/MetaScopeBanner";
import { MetaFreshnessBanner } from "@/components/integrations/MetaFreshnessBanner";


import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { useClientSegments } from "@/hooks/useClientSegments";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ChevronDown, Zap, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useDateRange } from "@/hooks/useDateRange";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { toast } from "sonner";

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(v: any) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ExportOverviewButton() {
  const clients = useVisibleClients();
  const { data: metrics, isLoading, isFetching, refetch } = useClientsRangeMetrics();
  const { from, to } = useDateRange();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!clients.length) {
      toast.error("No clients to export");
      return;
    }
    setExporting(true);
    try {
      // Always fetch fresh data at click time so the export reflects the
      // current date range even if the cached query hasn't resolved yet.
      let data = metrics;
      if (!data || Object.keys(data).length === 0) {
        const res = await refetch();
        data = res.data ?? {};
      }
      const m0: Record<number, any> = (data as any) || {};

      const headers = [
        "Client", "Status", "Brand", "Currency",
        "Spend", "Impressions", "Clicks", "CTR %",
        "Reported Leads", "True Leads", "CPL", "True CPL",
        "CPM", "Form CVR %", "Frequency", "Above 640 %",
      ];
      const rows = clients.map((c: any) => {
        const m: any = m0[c.id] || {};
        const ctr = m.impressions ? (m.clicks / m.impressions) * 100 : 0;
        return [
          c.name, c.status, c.brand || "", m.currency || "",
          (m.spend ?? 0).toFixed(2),
          m.impressions ?? 0, m.clicks ?? 0, ctr.toFixed(2),
          m.reportedLeads ?? 0, m.trueLeads ?? 0,
          (m.cpl ?? 0).toFixed(2), (m.trueCpl ?? 0).toFixed(2),
          (m.cpm ?? 0).toFixed(2),
          (m.formCvr ?? 0).toFixed(2),
          (m.frequency ?? 0).toFixed(2),
          m.above640Pct == null ? "" : m.above640Pct.toFixed(1),
        ].map(csvEscape).join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overview_${fmtDate(from)}_to_${fmtDate(to)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const withData = clients.filter((c: any) => m0[c.id]).length;
      toast.success(`Exported ${clients.length} clients (${withData} with metrics)`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Only reflect the actual export action — background metric refetches
  // shouldn't make the button look permanently busy (it refetches on click).
  const busy = exporting;
  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
      <Download className="h-4 w-4 mr-1.5" /> {busy ? "Preparing…" : "Export"}
    </Button>
  );
}

function PortfolioHealthCard() {
  const clients = useVisibleClients();
  const segments = useClientSegments();
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cl of clients) c[cl.status] = (c[cl.status] || 0) + 1;
    return c;
  }, [clients]);

  const rows: { key: "NEW" | "RELAUNCH" | "GREEN" | "YELLOW" | "RED" | "PAUSED"; label: string }[] = [
    { key: "NEW", label: "New" },
    { key: "RELAUNCH", label: "Re-Launch" },
    { key: "GREEN", label: "Green" },
    { key: "YELLOW", label: "Yellow" },
    { key: "RED", label: "Red" },
    { key: "PAUSED", label: "Paused" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Portfolio Health</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Status breakdown across clients in your workflow.
      </p>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2">
              <StatusBadge status={r.key} />
              <span className="text-sm text-muted-foreground">{r.label}</span>
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{counts[r.key] || 0}</dd>
          </div>
        ))}
      </dl>
    </div>

  );
}

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: focusItems = [] } = useQuery({
    queryKey: ["daily-focus-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_focus_items")
        .select("id,is_done");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pendingCount = focusItems.filter((i: any) => !i.is_done).length;

  if (isLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground">What's happening across your portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <MorningBriefDialog />
          <ExportOverviewButton />
          <DateRangePicker />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setFocusOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
          aria-expanded={focusOpen}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </span>
            <span className="text-sm font-semibold text-foreground">Daily Focus & Quick Actions</span>
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                {pendingCount} pending
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", focusOpen && "rotate-180")} />
        </button>
        {focusOpen && (
          <div className="border-t border-border p-5 space-y-6">
            <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
              <DailyFocus />
              <TodaysTasksPanel />
            </div>
            <QuickActionBar />
          </div>
        )}
      </div>

      <MetaScopeBanner />
      <MetaFreshnessBanner />
      <PaymentAlertBanner />


      <KPIStrip />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortfolioChart />
        </div>
        <div className="lg:col-span-1">
          <PortfolioHealthCard />
        </div>
      </div>

      <AtRiskClientsCard />

      <ClientHierarchyTable />
    </div>
  );
};

export default Index;
