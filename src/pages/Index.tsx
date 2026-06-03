import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { LaunchPlatforms } from "@/components/dashboard/LaunchPlatforms";
import { ReportingView } from "@/components/dashboard/ReportingView";
import { DailyFocus } from "@/components/dashboard/DailyFocus";
import { QuickActionBar } from "@/components/dashboard/QuickActionBar";

const Index = () => {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();

  if (isLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reporting</h1>
          <p className="text-sm text-muted-foreground">Performance across every platform.</p>
        </div>
        <DateRangePicker />
      </div>

      <LaunchPlatforms />
      <DailyFocus />
      <QuickActionBar />
      <ReportingView />
    </div>
  );
};

export default Index;
