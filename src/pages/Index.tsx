import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientTable } from "@/components/dashboard/ClientTable";
import { LeadsByClient } from "@/components/leads/LeadsByClient";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { DateRangePicker } from "@/components/common/DateRangePicker";

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();

  if (isLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Portfolio performance at a glance.</p>
        </div>
        <DateRangePicker />
      </div>
      <KPIStrip />
      <PortfolioChart />
      <QuickActionBar />
      <ClientTable />
      <LeadsByClient />
    </div>
  );
};

export default Index;
