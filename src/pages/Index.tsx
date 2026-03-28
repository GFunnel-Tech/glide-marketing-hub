import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientTable } from "@/components/dashboard/ClientTable";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";

const Index = () => {
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
