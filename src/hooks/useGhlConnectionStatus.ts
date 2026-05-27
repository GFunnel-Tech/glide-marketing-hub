import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Detects GHL auth issues by looking for 401 / "Api key is invalid" errors
 * on meta_leads in the last 24h for the current workspace.
 */
export function useGhlConnectionStatus() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  return useQuery({
    queryKey: ["ghl-connection-status", wsId],
    enabled: !!wsId,
    refetchInterval: 5 * 60 * 1000, // every 5 min
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await (supabase as any)
        .from("meta_leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .or(
          "last_sync_error.ilike.%401%,last_sync_error.ilike.%Api key is invalid%",
        )
        .gte("updated_at", since);
      if (error) return { failedCount: 0 };
      return { failedCount: count ?? 0 };
    },
  });
}
