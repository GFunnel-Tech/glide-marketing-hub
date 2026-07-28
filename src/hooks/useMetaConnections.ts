import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export function useMetaConnections() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["meta_connections", wsId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_connections")
        .select("id,status")
        .eq("workspace_id", wsId);
      if (error) {
        // RLS / transient failure — surface as "unknown", never as "none".
        return { rows: [] as { id: string; status: string }[], errored: true };
      }
      return { rows: (data ?? []) as { id: string; status: string }[], errored: false };
    },
    enabled: !!wsId,
  });
}

/**
 * Returns whether the workspace has an active Meta connection.
 * The connect prompt should only ever appear when we are *certain* the
 * workspace has no Meta data: no readable connection AND no ad accounts.
 */
export function useHasActiveMetaConnection() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const role = currentWorkspace?.role;
  const isAdmin = role === "owner" || role === "admin";

  const q = useMetaConnections();

  // Probe ad accounts for everyone (admins included) — a workspace with
  // synced ad accounts is definitively connected.
  const probe = useQuery({
    queryKey: ["meta_ad_accounts_probe", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("id")
        .eq("workspace_id", wsId)
        .limit(1);
      if (error) return { rows: [] as any[], errored: true };
      return { rows: data ?? [], errored: false };
    },
  });

  const rows = q.data?.rows ?? [];
  const connErrored = q.data?.errored ?? false;
  const hasConnectionRow = rows.length > 0;
  const hasActiveRow = rows.some((c) => c.status === "active");
  const hasAdAccounts = (probe.data?.rows ?? []).length > 0;
  const probeErrored = probe.data?.errored ?? false;

  const isLoading = q.isLoading || probe.isLoading;

  const hasConnection =
    hasActiveRow ||
    hasConnectionRow ||
    hasAdAccounts ||
    connErrored ||
    probeErrored ||
    !isAdmin; // members never get prompted to connect

  return {
    ...q,
    data: rows,
    isLoading,
    hasConnection,
    canManageConnection: isAdmin,
  };
}
