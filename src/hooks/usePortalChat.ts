import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";

export interface PortalThread {
  conversation_id: string;
  client_id: number;
  point_of_contact: string | null;
}

/**
 * Find-or-create the current portal user's dedicated chat thread for the active
 * client, via the `portal-chat` edge function. Returns the conversation id the
 * chat bubble then drives with the normal messages hooks.
 *
 * Disabled until `enabled` is true so we don't provision a thread for portal
 * users who never open the chat.
 */
export function usePortalThread(enabled: boolean) {
  const { clientId } = usePortalClient();
  return useQuery({
    queryKey: ["portal-chat-thread", clientId],
    enabled: enabled && clientId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PortalThread> => {
      const { data, error } = await supabase.functions.invoke("portal-chat", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as PortalThread;
    },
  });
}

/** Manually (re)provision the thread — used to retry after an error. */
export function useEnsurePortalThread() {
  const qc = useQueryClient();
  const { clientId } = usePortalClient();
  return useMutation({
    mutationFn: async (): Promise<PortalThread> => {
      const { data, error } = await supabase.functions.invoke("portal-chat", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as PortalThread;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-chat-thread", clientId] }),
  });
}
