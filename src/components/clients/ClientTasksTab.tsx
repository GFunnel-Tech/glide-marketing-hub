import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTasks, TaskView } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskQuickAdd } from "@/components/tasks/TaskQuickAdd";

interface Props {
  clientId: number;
}

export function ClientTasksTab({ clientId }: Props) {
  const [view, setView] = useState<TaskView>("today");
  const { items: all, isLoading } = useTasks({ clientId, view: "all" });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const filtered = all.filter((t) => {
    const due = t.nextDueAt ?? t.dueAt;
    const d = due ? new Date(due) : null;
    switch (view) {
      case "today":
        return !t.done && d && d < endOfToday;
      case "upcoming":
        return !t.done && d && d >= endOfToday;
      case "overdue":
        return !t.done && d && d < startOfToday;
      case "notes":
        return t.kind === "note" && !t.done;
      case "completed":
        return t.done;
      default:
        return true;
    }
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <TaskQuickAdd defaultClientId={clientId} defaultKind="task" />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value={view} className="mt-4">
          <TaskList
            tasks={filtered}
            isLoading={isLoading}
            showClient={false}
            emptyMessage="Nothing here yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
