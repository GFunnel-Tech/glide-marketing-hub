import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus, ArrowRight, AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTasks } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskEditDialog } from "@/components/tasks/TaskEditDialog";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function TodaysTasksPanel() {
  const { currentWorkspace } = useWorkspace();
  const isMember = currentWorkspace?.role === "member" || currentWorkspace?.role === "viewer";
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);
  const assigneeId = isMember && meId ? meId : undefined;
  const { items: today, isLoading } = useTasks({ view: "today", assigneeId });
  const { items: overdue } = useTasks({ view: "overdue", assigneeId });
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<"overdue" | "today">(overdue.length > 0 ? "overdue" : "today");

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "overdue" | "today")}>
        <TabsList className="mb-3">
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertCircle className={cn("h-3.5 w-3.5", overdue.length > 0 && "text-destructive")} />
            Overdue
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 text-[10px] font-semibold",
                overdue.length > 0
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {overdue.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Today
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
              {today.length}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overdue" className="mt-0">
          <TaskList
            tasks={overdue.slice(0, 10)}
            isLoading={isLoading}
            emptyMessage="Nothing overdue — nice work."
            showClient
          />
        </TabsContent>
        <TabsContent value="today" className="mt-0">
          <TaskList
            tasks={today.slice(0, 10)}
            isLoading={isLoading}
            emptyMessage="No tasks due today. Add one to bookmark a future action."
            showClient
          />
        </TabsContent>
      </Tabs>

      <TaskEditDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
