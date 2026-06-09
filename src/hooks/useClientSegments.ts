import { useMemo } from "react";
import { useClients, useClientsWithMetaAccount } from "@/hooks/useDatabase";
import { useArchivedSet } from "@/hooks/useArchivedEntities";
import { useVisibleClients } from "@/hooks/useVisibleClients";

/**
 * Single source of truth for the client counts shown across the dashboard.
 *
 * Every client number on the Overview must come from here so the page can never
 * display two unexplained totals (the "43 vs 30 vs 23" problem). Each segment is
 * an explicit, labelled denominator:
 *
 *  - total       — every client record in the workspace (e.g. 43).
 *  - synced      — clients with a GHL sub-account linked AND a Meta ad account
 *                  mapped (the "integration linked" set, e.g. 23).
 *  - archived    — clients manually archived out of the workspace view.
 *  - inWorkflow  — the set rendered in the "All Clients" table and Portfolio
 *                  Health card: excludes archived clients and fully-synced
 *                  clients with zero campaign activity (e.g. 30). This is the
 *                  same set as `useVisibleClients`.
 *
 * Note: `synced` counts ALL synced clients (including archived / no-activity),
 * so it is reported independently of `inWorkflow` rather than as a subset.
 */
export interface ClientSegments {
  total: number;
  synced: number;
  archived: number;
  inWorkflow: number;
}

export function useClientSegments(): ClientSegments {
  const { data: clients = [] } = useClients();
  const { data: clientsWithMetaAcct = new Set<number>() } = useClientsWithMetaAccount();
  const archivedSet = useArchivedSet();
  const inWorkflowClients = useVisibleClients();

  return useMemo(() => {
    const synced = clients.filter(
      (c: any) => !!c.ghlLocationId && clientsWithMetaAcct.has(Number(c.id)),
    ).length;
    const archived = clients.filter((c: any) => archivedSet.has(`client:${c.id}`)).length;
    return {
      total: clients.length,
      synced,
      archived,
      inWorkflow: inWorkflowClients.length,
    };
  }, [clients, clientsWithMetaAcct, archivedSet, inWorkflowClients]);
}
