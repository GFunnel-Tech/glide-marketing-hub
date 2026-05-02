import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientTable } from "@/components/dashboard/ClientTable";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();

  if (isLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <>
      <AlertBanner />
      <KPIStrip />
      <PortfolioChart />
      <QuickActionBar />
      <ClientTable />
    </>
  );
};

export default Index;
