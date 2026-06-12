import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { AiInsightsWidget } from "@/components/dashboard/AiInsightsWidget";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ClientHierarchyTable } from "@/components/dashboard/ClientHierarchyTable";
import { DailyFocus } from "@/components/dashboard/DailyFocus";

import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { useClientSegments } from "@/hooks/useClientSegments";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    <div className="rounded-xl border border-border bg-card p-5 h-full">
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
      <div className="mt-5 border-t border-border pt-4 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>In workflow</span>
          <span className="font-semibold text-foreground tabular-nums">{segments.inWorkflow}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total records · synced</span>
          <span className="tabular-nums">{segments.total} · {segments.synced}</span>
        </div>
      </div>
    </div>
  );
}

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();
  const { currentWorkspace } = useWorkspace();
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
        <DateRangePicker />
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
            <DailyFocus />
            <QuickActionBar />
          </div>
        )}
      </div>

      <KPIStrip />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortfolioChart />
        </div>
        <div className="lg:col-span-1">
          <PortfolioHealthCard />
        </div>
      </div>

      <ClientHierarchyTable />
    </div>
  );
};

export default Index;
