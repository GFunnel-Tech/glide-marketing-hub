import { CheckSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Compact Tasks entry point for the top bar.
 * Badge counts open tasks that are due (overdue or today) — the ones that
 * actually need attention — preferring tasks assigned to the current user.
 */
export function TasksButton() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const wsId = currentWorkspace?.id ?? null;

  const { data: count = 0 } = useQuery({
    queryKey: ["tasks-due-count", wsId, user?.id ?? null],
    enabled: !!wsId,
    queryFn: async () => {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const base = () =>
        supabase
          .from("client_notes")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!)
          .eq("done", false)
          .or(
            `next_due_at.lte.${endOfToday.toISOString()},and(next_due_at.is.null,due_at.lte.${endOfToday.toISOString()})`,
          );

      // Prefer "my" due tasks; fall back to the workspace total when the user
      // has none assigned so the badge still reflects real work in progress.
      if (user?.id) {
        const mine = await base().contains("assigned_to_ids", [user.id]);
        if (!mine.error && (mine.count ?? 0) > 0) return mine.count ?? 0;
      }
      const all = await base();
      if (all.error) throw all.error;
      return all.count ?? 0;
    },
  });

  useEffect(() => {
    if (!wsId) return;
    const channel = supabase
      .channel(`tasks-badge-${wsId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_notes", filter: `workspace_id=eq.${wsId}` },
        () => qc.invalidateQueries({ queryKey: ["tasks-due-count", wsId] as any }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [wsId, qc]);

  return (
    <button
      onClick={() => navigate("/tasks")}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label={`Tasks${count ? `, ${count} due` : ""}`}
      title="Tasks"
    >
      <CheckSquare className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
