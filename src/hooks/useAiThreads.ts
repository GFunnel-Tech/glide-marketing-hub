import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AiThread {
  id: string;
  workspace_id: string;
  client_id: number | null;
  user_id: string;
  endpoint: string;
  title: string;
  messages: any[];
  created_at: string;
  updated_at: string;
}

/** All saved AI conversations in the workspace (every account/agent), newest first. */
export function useAiThreads(workspaceId?: string, endpoint?: string) {
  return useQuery({
    queryKey: ["ai-threads", workspaceId, endpoint ?? "all"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<AiThread[]> => {
      let q = supabase
        .from("ai_chat_threads")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (endpoint) q = q.eq("endpoint", endpoint);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t: any) => ({ ...t, messages: Array.isArray(t.messages) ? t.messages : [] }));
    },
  });
}

export function useAiThreadMutations(workspaceId?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-threads"] });

  const saveThread = useMutation({
    mutationFn: async (input: {
      id?: string | null;
      clientId: number | null;
      endpoint: string;
      title: string;
      messages: any[];
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("ai_chat_threads")
          .update({ messages: input.messages, title: input.title, client_id: input.clientId })
          .eq("id", input.id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        return data?.id ?? input.id;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ai_chat_threads")
        .insert({
          workspace_id: workspaceId!,
          client_id: input.clientId,
          endpoint: input.endpoint,
          title: input.title,
          messages: input.messages,
          user_id: auth.user?.id as string,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const renameThread = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("ai_chat_threads").update({ title }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteThread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_chat_threads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { saveThread, renameThread, deleteThread };
}
