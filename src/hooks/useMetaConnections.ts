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
      if (error) throw error;
      return (data ?? []) as { id: string; status: string }[];
    },
    enabled: !!wsId,
  });
}

export function useHasActiveMetaConnection() {
  const q = useMetaConnections();
  return {
    ...q,
    hasConnection: (q.data ?? []).some(c => c.status === "active"),
  };
}
