import { LeadsByClient } from "@/components/leads/LeadsByClient";
import { LeadSyncHealth } from "@/components/leads/LeadSyncHealth";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";

export default function Leads() {
  const { hasConnection, isLoading } = useHasActiveMetaConnection();
  if (isLoading) return null;
  if (!hasConnection) return <ConnectMetaPrompt />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Individual leads pulled from Meta Lead Ads, grouped by client. Each lead is automatically
          verified against your CRM 5 minutes after arrival, with auto-recovery on failure.
        </p>
      </div>
      <LeadSyncHealth />
      <LeadsByClient />
    </div>
  );
}
