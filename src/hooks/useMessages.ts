import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Conversation {
  id: string;
  workspace_id: string;
  subject: string;
  created_by: string;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Participant {
  id: string;
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
}

/** Conversations the current user participates in, newest activity first. */
export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user) return [];
      // RLS already restricts to participants; just sort by last_message_at
      const { data, error } = await (supabase as any)
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
    enabled: !!user,
  });
}

export function useConversationParticipants(conversationId?: string | null) {
  return useQuery({
    queryKey: ["conversation_participants", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await (supabase as any)
        .from("conversation_participants")
        .select("*")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return (data ?? []) as Participant[];
    },
    enabled: !!conversationId,
  });
}

export function useMessages(conversationId?: string | null) {
  const qc = useQueryClient();

  // Realtime: refresh on any new message in this conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (subject: string) => {
      if (!user || !currentWorkspace) throw new Error("Missing context");
      const { data: conv, error } = await (supabase as any)
        .from("conversations")
        .insert({
          workspace_id: currentWorkspace.id,
          subject: subject || "New conversation",
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      // creator is added as a participant
      const { error: pErr } = await (supabase as any)
        .from("conversation_participants")
        .insert({ conversation_id: conv.id, user_id: user.id });
      if (pErr) throw pErr;
      return conv as Conversation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation_participants"] }),
  });
}

/** Total unread messages across all the user's conversations. */
export function useUnreadMessageCount() {
  const { user } = useAuth();
  const { data: conversations = [] } = useConversations();

  return useQuery({
    queryKey: ["unread_messages_total", user?.id, conversations.map(c => c.id).join(",")],
    queryFn: async () => {
      if (!user || conversations.length === 0) return 0;
      const { data: parts } = await (supabase as any)
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);
      const partMap = new Map<string, string | null>(
        (parts ?? []).map((p: any) => [p.conversation_id, p.last_read_at])
      );
      const unread = conversations.filter((c) => {
        const lr = partMap.get(c.id);
        if (!lr) return true;
        return new Date(c.last_message_at) > new Date(lr);
      }).length;
      return unread;
    },
    enabled: !!user,
  });
}

/** Realtime: refresh conversation list when any conversation/message changes for this user. */
export function useConversationsRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`conversations-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "conversations" },
        () => qc.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "conversation_participants" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversation_participants"] });
          qc.invalidateQueries({ queryKey: ["unread_messages_total"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);
}
