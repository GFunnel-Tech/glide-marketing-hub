import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Set of client ids that have at least one Meta ad account linked
 * (either single-tenant via meta_ad_accounts.client_id or shared via
 * meta_ad_account_clients).
 */
export function useLinkedMetaClients() {
  const { currentWorkspace } = useWorkspace() as any;
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["linked-meta-clients", wsId],
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ids = new Set<number>();

      const { data: owned } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("client_id")
        .eq("workspace_id", wsId)
        .not("client_id", "is", null);
      for (const r of owned || []) ids.add(r.client_id);

      const { data: shared } = await (supabase as any)
        .from("meta_ad_account_clients")
        .select("client_id")
        .eq("workspace_id", wsId);
      for (const r of shared || []) ids.add(r.client_id);

      return ids;
    },
  });
}
