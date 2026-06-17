import { useMemo, useState } from "react";
import { CheckSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTasks, TaskView, taskDueAt, TaskRow } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskQuickAdd } from "@/components/tasks/TaskQuickAdd";

export default function TasksPage() {
  const [view, setView] = useState<TaskView>("today");
  const { allItems, isLoading } = useTasks();

  const buckets = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const today: TaskRow[] = [];
    const upcoming: TaskRow[] = [];
    const overdue: TaskRow[] = [];
    const notes: TaskRow[] = [];
    const completed: TaskRow[] = [];
    for (const t of allItems) {
      if (t.done) { completed.push(t); continue; }
      const due = taskDueAt(t);
      const d = due ? new Date(due) : null;
      if (d) {
        if (d < startOfToday) overdue.push(t);
        else if (d < endOfToday) today.push(t);
        else upcoming.push(t);
      }
      if (t.kind === "note") notes.push(t);
    }
    return { today, upcoming, overdue, notes, completed };
  }, [allItems]);

  const tabData: Record<TaskView, { items: TaskRow[]; empty: string }> = {
    today: { items: buckets.today, empty: "No tasks due today." },
    upcoming: { items: buckets.upcoming, empty: "Nothing scheduled ahead." },
    overdue: { items: buckets.overdue, empty: "All caught up." },
    notes: { items: buckets.notes, empty: "No notes yet." },
    completed: { items: buckets.completed, empty: "No completed tasks." },
    all: { items: allItems, empty: "" },
  };

  const today = buckets.today;
  const overdue = buckets.overdue;
  const upcoming = buckets.upcoming;


  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CheckSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tasks & Notes</h1>
          <p className="text-sm text-muted-foreground">
            Bookmark future actions — scheduled items roll into today automatically.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <TaskQuickAdd defaultKind="task" />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
        <TabsList>
          <TabsTrigger value="today">
            Today
            {today.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {today.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue
            {overdue.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive">
                {overdue.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            Upcoming
            {upcoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold">
                {upcoming.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {(Object.keys(tabData) as TaskView[]).filter((k) => k !== "all").map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <TaskList
              tasks={tabData[k].items}
              isLoading={isLoading}
              emptyMessage={tabData[k].empty}
              showClient
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
