import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientEmbed = {
  id: string;
  client_id: number;
  tab_id: string;
  embed_url: string;
  status: string;
  tab: {
    id: string;
    label: string;
    icon: string;
    sort_order: number;
    enabled: boolean;
    provider: string;
  };
};

/**
 * Returns the enabled embeds for a client (joins workspace_embed_tabs + client_embeds).
 * Subscribes to realtime so the portal updates when the agency edits the URL.
 */
export function useClientEmbeds(clientId: number | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["client-embeds", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientEmbed[]> => {
      const { data, error } = await supabase
        .from("client_embeds")
        .select(`
          id, client_id, tab_id, embed_url, status,
          tab:workspace_embed_tabs!inner ( id, label, icon, sort_order, enabled, provider )
        `)
        .eq("client_id", clientId!);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.tab?.enabled)
        .sort((a, b) => (a.tab.sort_order ?? 100) - (b.tab.sort_order ?? 100));
    },
  });

  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client-embeds-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_embeds", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client-embeds", clientId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_embed_tabs" },
        () => qc.invalidateQueries({ queryKey: ["client-embeds", clientId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);

  return query;
}
