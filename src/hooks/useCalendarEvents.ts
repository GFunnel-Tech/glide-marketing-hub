import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type CalendarSource = "ghl" | "task" | "google";

export type CalendarEvent = {
  id: string;
  source: CalendarSource;
  title: string;
  start: string; // ISO
  end: string | null;
  clientId: number | null;
  status?: string | null;
  url?: string | null;
};

export function useCalendarEvents(rangeStart: Date, rangeEnd: Date) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["calendar-events", wsId, rangeStart.toISOString(), rangeEnd.toISOString()],
    enabled: !!wsId,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const startIso = rangeStart.toISOString();
      const endIso = rangeEnd.toISOString();

      const [appts, tasks] = await Promise.all([
        supabase
          .from("ghl_appointments")
          .select("id, title, start_time, end_time, status, client_id")
          .eq("workspace_id", wsId!)
          .gte("start_time", startIso)
          .lte("start_time", endIso)
          .limit(500),
        supabase
          .from("client_notes")
          .select("id, title, content, due_at, next_due_at, client_id, done, priority")
          .eq("workspace_id", wsId!)
          .or(
            `and(due_at.gte.${startIso},due_at.lte.${endIso}),and(next_due_at.gte.${startIso},next_due_at.lte.${endIso})`
          )
          .limit(500),
      ]);

      const events: CalendarEvent[] = [];

      for (const a of appts.data ?? []) {
        events.push({
          id: `ghl-${a.id}`,
          source: "ghl",
          title: a.title || "Appointment",
          start: a.start_time,
          end: a.end_time,
          clientId: a.client_id,
          status: a.status,
        });
      }

      for (const t of tasks.data ?? []) {
        const start = t.next_due_at ?? t.due_at;
        if (!start) continue;
        events.push({
          id: `task-${t.id}`,
          source: "task",
          title: t.title || (t.content?.slice(0, 60) ?? "Task"),
          start,
          end: null,
          clientId: t.client_id,
          status: t.done ? "done" : t.priority,
        });
      }

      return events;
    },
  });
}
