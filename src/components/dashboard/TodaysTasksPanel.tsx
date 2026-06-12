import { useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskEditDialog } from "@/components/tasks/TaskEditDialog";

export function TodaysTasksPanel() {
  const { items: today, isLoading } = useTasks({ view: "today" });
  const { items: overdue } = useTasks({ view: "overdue" });
  const [newOpen, setNewOpen] = useState(false);

  const combined = [...overdue, ...today];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ListChecks className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Today's Tasks</h3>
            <p className="text-xs text-muted-foreground">
              {overdue.length > 0 ? `${overdue.length} overdue · ` : ""}
              {today.length} due today
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5" asChild>
            <Link to="/tasks">
              All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <TaskList
        tasks={combined.slice(0, 8)}
        isLoading={isLoading}
        emptyMessage="No tasks due today. Add one to bookmark a future action."
        showClient
      />

      <TaskEditDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
