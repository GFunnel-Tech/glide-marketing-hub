import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type PortalNote = {
  id: string;
  content: string;
  title: string | null;
  done: boolean;
  due_at: string | null;
  priority: string | null;
  created_at: string;
};

export function PortalTasksCard({ clientId }: { clientId: number | null }) {
  const qc = useQueryClient();
  const queryKey = ["portal-tasks", clientId];

  const { data: notes = [], isLoading } = useQuery<PortalNote[]>({
    queryKey,
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("id, content, title, done, due_at, priority, created_at")
        .eq("client_id", clientId!)
        .eq("visible_to_client", true)
        .order("done", { ascending: true })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as PortalNote[];
    },
  });

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`portal-tasks-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_notes", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" /> Tasks from your team
      </h3>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && notes.length === 0 && (
        <p className="text-sm text-muted-foreground">You're all caught up.</p>
      )}
      <ul className="space-y-2">
        {notes.map((n) => {
          const overdue = !n.done && n.due_at && isPast(new Date(n.due_at));
          return (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-2 rounded-md border border-border/60 p-2",
                n.done && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                  n.done ? "bg-success border-success" : "border-muted-foreground/40"
                )}
              />
              <div className="min-w-0 flex-1">
                {n.title && <p className="text-xs font-semibold text-foreground">{n.title}</p>}
                <p className={cn("text-xs whitespace-pre-wrap", n.done && "line-through")}>
                  {n.content}
                </p>
                {n.due_at && (
                  <p
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 text-[10px]",
                      overdue ? "text-destructive font-medium" : "text-muted-foreground"
                    )}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(n.due_at), "MMM d, h:mm a")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
