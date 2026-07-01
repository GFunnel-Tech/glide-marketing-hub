import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Check, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TaskRow,
  TaskRecurrence,
  useTasks,
  useWorkspaceMembersForTasks,
  useClientsLookup,
} from "@/hooks/useTasks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskRow | null;
  defaultClientId?: number | null;
}

const combineDateTime = (date: Date | undefined, time: string): string | null => {
  if (!date) return null;
  const [hh, mm] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
};

export function TaskEditDialog({ open, onOpenChange, task, defaultClientId = null }: Props) {
  const { create, update } = useTasks({ clientId: "any" });
  const { data: members = [] } = useWorkspaceMembersForTasks();
  const { data: clients = [] } = useClientsLookup();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"task" | "note">("task");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [calOpen, setCalOpen] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [clientId, setClientId] = useState<string>("none");
  const [recurFreq, setRecurFreq] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurInterval, setRecurInterval] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title || "");
      setContent(task.content || "");
      setKind(task.kind);
      setPriority(task.priority);
      const due = task.nextDueAt ?? task.dueAt;
      if (due) {
        const d = new Date(due);
        setDate(d);
        setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      } else {
        setDate(undefined);
        setTime("09:00");
      }
      setAssignees(task.assignedToIds && task.assignedToIds.length > 0
        ? task.assignedToIds
        : (task.assignedTo ? [task.assignedTo] : []));
      setClientId(task.clientId != null ? String(task.clientId) : "none");
      setRecurFreq((task.recurrence?.freq as any) ?? "none");
      setRecurInterval(task.recurrence?.interval ?? 1);
    } else {
      setTitle("");
      setContent("");
      setKind("task");
      setPriority("normal");
      setDate(undefined);
      setTime("09:00");
      setAssignee("unassigned");
      setClientId(defaultClientId != null ? String(defaultClientId) : "none");
      setRecurFreq("none");
      setRecurInterval(1);
    }
  }, [open, task, defaultClientId]);

  const saving = create.isPending || update.isPending;

  const recurrence: TaskRecurrence =
    recurFreq === "none" ? null : { freq: recurFreq, interval: Math.max(1, recurInterval) };

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) return;
    const dueAt = combineDateTime(date, time);
    const payload = {
      title: title.trim() || null,
      content: content.trim(),
      kind,
      priority,
      dueAt,
      assignedTo: assignee === "unassigned" ? null : assignee,
      clientId: clientId === "none" ? null : Number(clientId),
      recurrence,
    };
    if (task) {
      await update.mutateAsync({ id: task.id, patch: payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit" : "New"} {kind === "note" ? "note" : "task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add details…"
              className="min-h-[80px]"
            />
          </div>

          {kind === "task" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Due date</Label>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start gap-2 font-normal", !date && "text-muted-foreground")}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {date ? format(date, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => { setDate(d); setCalOpen(false); }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Time</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Repeat</Label>
                  <Select value={recurFreq} onValueChange={(v) => setRecurFreq(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Does not repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recurFreq !== "none" && (
                  <div>
                    <Label className="text-xs">Every</Label>
                    <Input
                      type="number"
                      min={1}
                      value={recurInterval}
                      onChange={(e) => setRecurInterval(parseInt(e.target.value) || 1)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || (!title.trim() && !content.trim())}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
