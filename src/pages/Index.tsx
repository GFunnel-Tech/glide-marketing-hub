import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { KPIStrip } from "@/components/dashboard/KPIStrip";
import { ClientTable } from "@/components/dashboard/ClientTable";
import { AlertBanner } from "@/components/dashboard/AlertBanner";

const Index = () => {
  return (
    <DashboardLayout>
      <AlertBanner />
      <KPIStrip />
      <ClientTable />
    </DashboardLayout>
  );
};

export default Index;
