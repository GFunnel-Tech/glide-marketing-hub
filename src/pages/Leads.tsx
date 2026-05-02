import { LeadsByClient } from "@/components/leads/LeadsByClient";
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
          Individual leads pulled from Meta Lead Ads, grouped by client.
        </p>
      </div>
      <LeadsByClient />
    </div>
  );
}
