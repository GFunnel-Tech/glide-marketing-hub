import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientHierarchyTable } from "@/components/dashboard/ClientHierarchyTable";
import { DailyFocus } from "@/components/dashboard/DailyFocus";
import { LeadsByClient } from "@/components/leads/LeadsByClient";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { useClients } from "@/hooks/useDatabase";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LaunchPlatforms } from "@/components/dashboard/LaunchPlatforms";
import { ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function PortfolioHealthCard() {
  const { data: clients = [] } = useClients();
  const counts = useMemo(() => {
    const c = { GREEN: 0, YELLOW: 0, RED: 0, BLOCKED: 0, other: 0 };
    for (const cl of clients) {
      if (cl.status in c) (c as any)[cl.status]++;
      else c.other++;
    }
    return c;
  }, [clients]);

  const rows: { key: "GREEN" | "YELLOW" | "RED" | "BLOCKED"; label: string }[] = [
    { key: "GREEN", label: "Performing" },
    { key: "YELLOW", label: "Needs attention" },
    { key: "RED", label: "At risk" },
    { key: "BLOCKED", label: "Blocked" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 h-full">
      <h3 className="text-sm font-semibold text-foreground">Portfolio Health</h3>
      <p className="mt-1 text-xs text-muted-foreground">Status breakdown across all clients.</p>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2">
              <StatusBadge status={r.key} />
              <span className="text-sm text-muted-foreground">{r.label}</span>
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{(counts as any)[r.key]}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 border-t border-border pt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Total clients</span>
        <span className="font-semibold text-foreground tabular-nums">{clients.length}</span>
      </div>
    </div>
  );
}

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();
  const [focusOpen, setFocusOpen] = useState(false);

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

      <LaunchPlatforms />

      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setFocusOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
          aria-expanded={focusOpen}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-foreground">Daily Focus & Quick Actions</span>
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
      <LeadsByClient />
    </div>
  );
};

export default Index;
