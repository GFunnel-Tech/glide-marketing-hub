import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type TaskRecurrence = {
  freq: "daily" | "weekly" | "monthly";
  interval?: number;
  end_at?: string | null;
} | null;

export type TaskRow = {
  id: string;
  workspaceId: string;
  clientId: number | null;
  userId: string;
  assignedTo: string | null;
  title: string | null;
  content: string;
  kind: "note" | "task";
  priority: "low" | "normal" | "high";
  dueAt: string | null;
  nextDueAt: string | null;
  recurrence: TaskRecurrence;
  done: boolean;
  completedAt: string | null;
  remindedAt: string | null;
  createdAt: string;
};

export type TaskView =
  | "today"
  | "upcoming"
  | "overdue"
  | "notes"
  | "completed"
  | "all";

const adapt = (r: any): TaskRow => ({
  id: r.id,
  workspaceId: r.workspace_id,
  clientId: r.client_id ?? null,
  userId: r.user_id,
  assignedTo: r.assigned_to ?? null,
  title: r.title ?? null,
  content: r.content ?? "",
  kind: (r.kind ?? "note") as "note" | "task",
  priority: (r.priority ?? "normal") as "low" | "normal" | "high",
  dueAt: r.due_at ?? null,
  nextDueAt: r.next_due_at ?? null,
  recurrence: (r.recurrence ?? null) as TaskRecurrence,
  done: !!r.done,
  completedAt: r.completed_at ?? null,
  remindedAt: r.reminded_at ?? null,
  createdAt: r.created_at,
});

export const taskDueAt = (t: TaskRow): string | null => t.nextDueAt ?? t.dueAt;

export interface UseTasksOptions {
  clientId?: number | null | "any";
  view?: TaskView;
  assigneeId?: string | null;
  scope?: "workspace" | "client" | "global-notes";
}

export function useTasks(opts: UseTasksOptions = {}) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();
  const { clientId = "any", view = "all", assigneeId, scope } = opts;
  const subscriptionIdRef = useRef<string>();

  if (!subscriptionIdRef.current) {
    subscriptionIdRef.current = Math.random().toString(36).slice(2);
  }

  const queryKey = ["tasks", wsId, clientId, scope ?? "any", assigneeId ?? "any"];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    enabled: !!wsId,
    queryFn: async (): Promise<TaskRow[]> => {
      let q = supabase
        .from("client_notes")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("done", { ascending: true })
        .order("next_due_at", { ascending: true, nullsFirst: false })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (clientId === null || scope === "global-notes") q = q.is("client_id", null);
      else if (typeof clientId === "number") q = q.eq("client_id", clientId);

      if (assigneeId) q = q.eq("assigned_to", assigneeId);

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []).map(adapt);
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!wsId) return;
    const channel = supabase
      .channel(`tasks-${wsId}-${subscriptionIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_notes", filter: `workspace_id=eq.${wsId}` },
        () => qc.invalidateQueries({ queryKey: ["tasks", wsId] as any })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [wsId, qc]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    return items.filter((t) => {
      const due = taskDueAt(t);
      const dueDate = due ? new Date(due) : null;
      switch (view) {
        case "today":
          if (t.done) return false;
          if (!dueDate) return false;
          return dueDate < endOfToday;
        case "upcoming":
          if (t.done) return false;
          if (!dueDate) return false;
          return dueDate >= endOfToday;
        case "overdue":
          if (t.done) return false;
          if (!dueDate) return false;
          return dueDate < startOfToday;
        case "notes":
          return t.kind === "note" && !t.done;
        case "completed":
          return t.done;
        case "all":
        default:
          return true;
      }
    });
  }, [items, view]);

  const create = useMutation({
    mutationFn: async (payload: Partial<TaskRow> & { content?: string; title?: string | null }) => {
      if (!wsId) throw new Error("No workspace");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const insert = {
        workspace_id: wsId,
        client_id: payload.clientId ?? null,
        user_id: u.user.id,
        assigned_to: payload.assignedTo ?? null,
        title: payload.title ?? null,
        content: payload.content ?? "",
        kind: payload.kind ?? "task",
        priority: payload.priority ?? "normal",
        due_at: payload.dueAt ?? null,
        next_due_at: payload.dueAt ?? null,
        recurrence: (payload.recurrence as any) ?? null,
      };
      const { error } = await supabase.from("client_notes").insert(insert);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", wsId] as any }),
    onError: (e: any) => toast.error(e?.message ?? "Could not create"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TaskRow> }) => {
      const dbPatch: any = {};
      if ("title" in patch) dbPatch.title = patch.title;
      if ("content" in patch) dbPatch.content = patch.content;
      if ("kind" in patch) dbPatch.kind = patch.kind;
      if ("priority" in patch) dbPatch.priority = patch.priority;
      if ("dueAt" in patch) {
        dbPatch.due_at = patch.dueAt;
        dbPatch.next_due_at = patch.dueAt;
        dbPatch.reminded_at = null;
      }
      if ("assignedTo" in patch) dbPatch.assigned_to = patch.assignedTo;
      if ("clientId" in patch) dbPatch.client_id = patch.clientId;
      if ("recurrence" in patch) dbPatch.recurrence = patch.recurrence as any;
      if ("done" in patch) dbPatch.done = patch.done;
      const { error } = await supabase.from("client_notes").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", wsId] as any }),
    onError: (e: any) => toast.error(e?.message ?? "Could not update"),
  });

  const toggle = useMutation({
    mutationFn: async (t: TaskRow) => {
      const { error } = await supabase
        .from("client_notes")
        .update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", wsId] as any }),
  });

  const snooze = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const next = new Date(Date.now() + hours * 3600_000).toISOString();
      const { error } = await supabase
        .from("client_notes")
        .update({ due_at: next, next_due_at: next, reminded_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", wsId] as any });
      toast.success("Snoozed");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", wsId] as any }),
  });

  return { items: filtered, allItems: items, isLoading, create, update, toggle, snooze, remove };
}

export function useWorkspaceMembersForTasks() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["ws-members-tasks", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data: m, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", wsId!);
      if (error) throw error;
      const ids = (m ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [] as { id: string; display_name: string | null; email: string | null }[];
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      return (p ?? []) as { id: string; display_name: string | null; email: string | null }[];
    },
  });
}

export function useClientsLookup() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients-lookup", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, brand")
        .eq("workspace_id", wsId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: number; name: string; brand: string | null }[];
    },
  });
}
