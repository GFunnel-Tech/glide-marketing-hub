import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useInAppEnabledEventTypes } from "./useNotificationPreferences";

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

const errMsg = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : (typeof e === "string" ? e : fallback);

// Retry network/transient errors a few times with exponential backoff.
// Don't retry on auth/permission errors (401/403/PGRST301).
const queryRetry = (failureCount: number, error: unknown) => {
  const msg = (error as any)?.message ?? "";
  const code = (error as any)?.code ?? "";
  if (/permission|denied|unauthor|jwt|forbidden/i.test(msg)) return false;
  if (code === "PGRST301" || code === "42501") return false;
  return failureCount < 3;
};
const queryRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

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
    retry: queryRetry,
    retryDelay: queryRetryDelay,
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
    retry: queryRetry,
    retryDelay: queryRetryDelay,
  });
}

export function useUnreadNotificationCount() {
  const q = useNotifications();
  return {
    ...q,
    unread: (q.data ?? []).filter((n) => !n.read_at).length,
  };
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>, userId: string | undefined) => {
  qc.invalidateQueries({ queryKey: ["notifications", userId] });
  qc.invalidateQueries({ queryKey: ["notifications_infinite", userId] });
};

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
    retry: 2,
    retryDelay: queryRetryDelay,
    onSuccess: () => invalidateAll(qc, user?.id),
    onError: (e) => toast.error(errMsg(e, "Couldn't mark notification as read")),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    retry: 2,
    retryDelay: queryRetryDelay,
    onSuccess: () => invalidateAll(qc, user?.id),
    // Silent: this is used for background "mark visible as read" sweeps.
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
    retry: 2,
    retryDelay: queryRetryDelay,
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("All notifications marked as read");
    },
    onError: (e) => toast.error(errMsg(e, "Couldn't mark all as read")),
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
    retry: 2,
    retryDelay: queryRetryDelay,
    onSuccess: () => invalidateAll(qc, user?.id),
    onError: (e) => toast.error(errMsg(e, "Couldn't delete notification")),
  });
}
