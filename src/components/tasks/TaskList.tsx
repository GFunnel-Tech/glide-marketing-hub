import { TaskRow as TaskRowT } from "@/hooks/useTasks";
import { TaskRow } from "./TaskRow";

interface Props {
  tasks: TaskRowT[];
  isLoading?: boolean;
  showClient?: boolean;
  emptyMessage?: string;
}

export function TaskList({ tasks, isLoading, showClient = true, emptyMessage = "Nothing here." }: Props) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>;
  }
  if (tasks.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</div>;
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showClient={showClient} />
      ))}
    </div>
  );
}
