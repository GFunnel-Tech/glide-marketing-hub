import { useState } from "react";
import { Plus, CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/useTasks";
import { TaskEditDialog } from "./TaskEditDialog";

interface Props {
  defaultClientId?: number | null;
  defaultKind?: "task" | "note";
}

export function TaskQuickAdd({ defaultClientId = null, defaultKind = "task" }: Props) {
  const { create } = useTasks({ clientId: "any" });
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || create.isPending) return;
    const dueAt = date
      ? (() => {
          const d = new Date(date);
          d.setHours(9, 0, 0, 0);
          return d.toISOString();
        })()
      : null;
    await create.mutateAsync({
      title: title.trim(),
      content: "",
      kind: defaultKind,
      priority: "normal",
      dueAt,
      clientId: defaultClientId,
    });
    setTitle("");
    setDate(undefined);
  };

  return (
    <>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultKind === "note" ? "Quick note…" : "Add a task…"}
          className="flex-1"
        />
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn("gap-1.5", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {date ? format(date, "MMM d") : "Date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { setDate(d); setCalOpen(false); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdvancedOpen(true)}>
          More…
        </Button>
      </form>
      <TaskEditDialog open={advancedOpen} onOpenChange={setAdvancedOpen} defaultClientId={defaultClientId} />
    </>
  );
}
