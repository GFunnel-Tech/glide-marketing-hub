import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Notification {
  id: string;
  user_id: string;
  workspace_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!user,
  });
}

const PAGE_SIZE = 25;

export function useInfiniteNotifications(pageSize: number = PAGE_SIZE) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["notifications_infinite", user?.id, pageSize],
    enabled: !!user,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      let q = (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    getNextPageParam: (last) =>
      last.length < pageSize ? undefined : last[last.length - 1].created_at,
  });
}

export function useUnreadNotificationCount() {
  const q = useNotifications();
  return {
    ...q,
    unread: (q.data ?? []).filter((n) => !n.read_at).length,
  };
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}
