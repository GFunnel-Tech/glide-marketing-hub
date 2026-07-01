import { useMemo, useState } from "react";
import { CheckSquare, X, UserPlus, CheckCheck, RotateCcw, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";
import { useTasks, TaskView, taskDueAt, TaskRow, useWorkspaceMembersForTasks } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskQuickAdd } from "@/components/tasks/TaskQuickAdd";
import { cn } from "@/lib/utils";

export default function TasksPage() {
  const [view, setView] = useState<TaskView>("today");
  const { allItems, isLoading, bulkToggle, bulkAssign, bulkRemove } = useTasks();
  const { data: members = [] } = useWorkspaceMembersForTasks();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignPicks, setAssignPicks] = useState<Set<string>>(new Set());

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

  const currentItems = tabData[view].items;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(currentItems.map((t) => t.id)));
  const clearSelection = () => setSelected(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const selectedIds = Array.from(selected);
  const anyIncomplete = selectedIds.some((id) => allItems.find((t) => t.id === id && !t.done));
  const allSelectedComplete = selectedIds.length > 0 && !anyIncomplete;

  const runBulkComplete = async () => {
    await bulkToggle.mutateAsync({ ids: selectedIds, done: true });
    exitSelectMode();
  };
  const runBulkReopen = async () => {
    await bulkToggle.mutateAsync({ ids: selectedIds, done: false });
    exitSelectMode();
  };
  const runBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"}?`)) return;
    await bulkRemove.mutateAsync(selectedIds);
    exitSelectMode();
  };
  const runBulkAssign = async () => {
    await bulkAssign.mutateAsync({ ids: selectedIds, assigneeIds: Array.from(assignPicks) });
    setAssignPickerOpen(false);
    setAssignPicks(new Set());
    exitSelectMode();
  };

  const today = buckets.today;
  const overdue = buckets.overdue;
  const upcoming = buckets.upcoming;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
        {!selectMode ? (
          <Button size="sm" variant="outline" onClick={() => setSelectMode(true)}>
            Select
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={exitSelectMode}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <TaskQuickAdd defaultKind="task" />
      </div>

      {selectMode && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <Button size="sm" variant="ghost" onClick={selectAllVisible}>
            Select all visible ({currentItems.length})
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          )}
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <Popover open={assignPickerOpen} onOpenChange={setAssignPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={selected.size === 0}>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Assign
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search teammates..." />
                  <CommandList>
                    <CommandEmpty>No members.</CommandEmpty>
                    <CommandGroup>
                      {members.map((m) => {
                        const picked = assignPicks.has(m.id);
                        return (
                          <CommandItem
                            key={m.id}
                            onSelect={() => {
                              setAssignPicks((prev) => {
                                const n = new Set(prev);
                                if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                                return n;
                              });
                            }}
                          >
                            <Check className={cn("h-4 w-4 mr-2", picked ? "opacity-100" : "opacity-0")} />
                            {m.display_name || m.email}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                  <div className="p-2 border-t flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setAssignPicks(new Set()); }}>
                      Unassign
                    </Button>
                    <Button size="sm" onClick={runBulkAssign} disabled={bulkAssign.isPending}>
                      Apply
                    </Button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
            {allSelectedComplete ? (
              <Button size="sm" variant="outline" onClick={runBulkReopen} disabled={bulkToggle.isPending || selected.size === 0}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
              </Button>
            ) : (
              <Button size="sm" onClick={runBulkComplete} disabled={bulkToggle.isPending || selected.size === 0}>
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Complete
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={runBulkDelete} disabled={bulkRemove.isPending || selected.size === 0}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      )}

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

        <TabsContent value={view} className="mt-4">
          <TaskList
            tasks={currentItems}
            isLoading={isLoading}
            emptyMessage={tabData[view].empty}
            showClient
            selectable={selectMode}
            selectedIds={selected}
            onToggleSelect={toggleSelect}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
