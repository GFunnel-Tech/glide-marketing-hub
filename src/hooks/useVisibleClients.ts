import { useMemo } from "react";
import { useClients, useCampaigns, useClientsWithMetaAccount } from "@/hooks/useDatabase";
import { useArchivedSet } from "@/hooks/useArchivedEntities";

function deriveImpressionsFromCpm(spend: number, cpm: number) {
  if (!cpm || cpm <= 0) return 0;
  return (spend / cpm) * 1000;
}

/**
 * Returns the same client set rendered in the main "All Clients" table:
 *   - excludes archived clients
 *   - excludes fully-synced clients with zero campaign activity (matches `hideZero` default)
 *   - keeps unconnected clients so they remain visible for setup
 *
 * Both the Portfolio Health card and the table should use this so counts match.
 */
export function useVisibleClients() {
  const { data: clients = [] } = useClients();
  const { data: allCampaigns = [] } = useCampaigns();
  const { data: clientsWithMetaAcct = new Set<number>() } = useClientsWithMetaAccount();
  const archivedSet = useArchivedSet();

  const clientsWithActivity = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCampaigns as any[]) {
      const impr = (c.impressions || 0) > 0
        ? (c.impressions || 0)
        : deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0);
      if ((c.spend || 0) > 0 && impr > 0) s.add(String(c.clientId));
    }
    return s;
  }, [allCampaigns]);

  return useMemo(() => {
    const hiddenStatuses = new Set(["PAUSED", "CANCELLED", "PENDING_CANCELLATION"]);
    return clients.filter((c: any) => {
      if (archivedSet.has(`client:${c.id}`)) return false;
      if (hiddenStatuses.has(String(c.status))) return false;
      return true;
    });
  }, [clients, archivedSet]);
}
