import { useState } from "react";
import { format, isToday, isPast } from "date-fns";
import { Calendar, Clock, Repeat, User, MoreHorizontal, Trash2, Pencil, AlarmClock, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { buildClientPath } from "@/lib/clientPath";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TaskRow as TaskRowT, taskDueAt, useTasks, useWorkspaceMembersForTasks, useClientsLookup } from "@/hooks/useTasks";
import { TaskEditDialog } from "./TaskEditDialog";

const priorityDot: Record<string, string> = {
  high: "bg-destructive",
  normal: "bg-primary",
  low: "bg-muted-foreground/50",
};

export function TaskRow({
  task,
  showClient = true,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  task: TaskRowT;
  showClient?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { toggle, snooze, remove } = useTasks({ clientId: "any" });
  const { data: members = [] } = useWorkspaceMembersForTasks();
  const { data: clients = [] } = useClientsLookup();
  const { currentWorkspace } = useWorkspace();
  const [editOpen, setEditOpen] = useState(false);

  const due = taskDueAt(task);
  const dueDate = due ? new Date(due) : null;
  const overdue = !!dueDate && !task.done && isPast(dueDate) && !isToday(dueDate);
  const today = !!dueDate && isToday(dueDate);

  const assigneeIds = task.assignedToIds && task.assignedToIds.length > 0
    ? task.assignedToIds
    : (task.assignedTo ? [task.assignedTo] : []);
  const assignees = assigneeIds
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as { id: string; display_name: string | null; email: string | null }[];
  const client = clients.find((c) => c.id === task.clientId);

  const clientHref =
    task.clientId && currentWorkspace?.id
      ? buildClientPath(currentWorkspace.id, task.clientId)
      : task.clientId
      ? `/client/${task.clientId}`
      : null;

  return (
    <>
      <div className="group flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40 hover:bg-accent/30 transition-colors">
        <Checkbox
          checked={task.done}
          onCheckedChange={() => toggle.mutate(task)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", priorityDot[task.priority] || priorityDot.normal)} />
            <button
              onClick={() => setEditOpen(true)}
              className={cn(
                "text-sm font-medium text-left truncate hover:underline",
                task.done && "line-through text-muted-foreground"
              )}
            >
              {task.title || task.content || "Untitled"}
            </button>
            {task.recurrence && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Repeat className="h-2.5 w-2.5" />
                {task.recurrence.freq}
              </span>
            )}
            {task.kind === "note" && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">note</span>
            )}
          </div>
          {task.title && task.content && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{task.content}</p>
          )}
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            {dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  overdue && "text-destructive font-medium",
                  today && !overdue && "text-primary font-medium"
                )}
              >
                <Clock className="h-3 w-3" />
                {format(dueDate, "MMM d, h:mm a")}
              </span>
            )}
            {assignees.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {a.display_name || a.email}
              </span>
            ))}
            {showClient && client && clientHref && (
              <Link
                to={clientHref}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 hover:bg-accent/80"
              >
                <Building2 className="h-3 w-3" />
                {client.name}
              </Link>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            {!task.done && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => snooze.mutate({ id: task.id, hours: 1 })}>
                  <AlarmClock className="h-3.5 w-3.5 mr-2" /> Snooze 1 hour
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => snooze.mutate({ id: task.id, hours: 24 })}>
                  <AlarmClock className="h-3.5 w-3.5 mr-2" /> Snooze 1 day
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => snooze.mutate({ id: task.id, hours: 24 * 7 })}>
                  <AlarmClock className="h-3.5 w-3.5 mr-2" /> Snooze 1 week
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => remove.mutate(task.id)} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TaskEditDialog open={editOpen} onOpenChange={setEditOpen} task={task} />
    </>
  );
}
