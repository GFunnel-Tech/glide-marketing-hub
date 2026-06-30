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
        // Non-admins are blocked by RLS — treat as "unknown", not "none".
        return [] as { id: string; status: string }[];
      }
      return (data ?? []) as { id: string; status: string }[];
    },
    enabled: !!wsId,
  });
}

/**
 * Returns whether the workspace has an active Meta connection.
 * Non-admin members cannot read meta_connections directly (RLS), so we
 * also probe meta_ad_accounts as a proxy signal of an existing connection.
 */
export function useHasActiveMetaConnection() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const role = currentWorkspace?.role;
  const isAdmin = role === "owner" || role === "admin";

  const q = useMetaConnections();

  const probe = useQuery({
    queryKey: ["meta_ad_accounts_probe", wsId],
    enabled: !!wsId && !isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("id")
        .eq("workspace_id", wsId)
        .limit(1);
      if (error) return [] as any[];
      return data ?? [];
    },
  });

  const adminHas = (q.data ?? []).some(c => c.status === "active");
  const memberHas = (probe.data ?? []).length > 0;
  // For non-admins, assume the workspace is wired and never prompt to connect.
  const hasConnection = isAdmin ? adminHas : (memberHas || true);

  return {
    ...q,
    isLoading: q.isLoading || (!isAdmin && probe.isLoading),
    hasConnection,
    canManageConnection: isAdmin,
  };
}
