import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type ArchivedEntityType = "campaign" | "adset" | "ad" | "client";

export interface ArchivedEntity {
  id: string;
  workspace_id: string;
  entity_type: ArchivedEntityType;
  entity_id: string;
  archived_at: string;
}

export function useArchivedEntities() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["archived_entities", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("archived_entities")
        .select("*")
        .eq("workspace_id", currentWorkspace!.id);
      if (error) throw error;
      return (data ?? []) as ArchivedEntity[];
    },
  });
}

/** Build a quick lookup set of archived keys ("entity:id"). */
export function useArchivedSet() {
  const { data = [] } = useArchivedEntities();
  return new Set(data.map((a) => `${a.entity_type}:${a.entity_id}`));
}

export function useArchiveEntities() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (
      items: { entity: ArchivedEntityType; id: string }[],
    ) => {
      if (!currentWorkspace) throw new Error("No workspace");
      const rows = items.map((i) => ({
        workspace_id: currentWorkspace.id,
        entity_type: i.entity,
        entity_id: i.id,
      }));
      const { error } = await supabase
        .from("archived_entities")
        .upsert(rows, { onConflict: "workspace_id,entity_type,entity_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archived_entities"] }),
  });
}

export function useUnarchiveEntities() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (
      items: { entity: ArchivedEntityType; id: string }[],
    ) => {
      if (!currentWorkspace) throw new Error("No workspace");
      // Delete in parallel grouped by entity_type
      const byType = new Map<ArchivedEntityType, string[]>();
      for (const i of items) {
        if (!byType.has(i.entity)) byType.set(i.entity, []);
        byType.get(i.entity)!.push(i.id);
      }
      await Promise.all(
        Array.from(byType.entries()).map(async ([entity, ids]) => {
          const { error } = await supabase
            .from("archived_entities")
            .delete()
            .eq("workspace_id", currentWorkspace.id)
            .eq("entity_type", entity)
            .in("entity_id", ids);
          if (error) throw error;
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archived_entities"] }),
  });
}
