import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { History, Plus, Trash2, Search, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAiThreads, useAiThreadMutations, type AiThread } from "@/hooks/useAiThreads";

interface Props {
  workspaceId: string;
  /** Limit history to one agent surface, or omit to show threads from every account/agent. */
  endpoint?: string;
  activeThreadId?: string | null;
  onSelect: (thread: AiThread) => void;
  onNew: () => void;
}

export function ThreadHistoryMenu({ workspaceId, endpoint, activeThreadId, onSelect, onNew }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: threads = [], isLoading } = useAiThreads(workspaceId, endpoint);
  const { deleteThread } = useAiThreadMutations(workspaceId);

  const filtered = q.trim()
    ? threads.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()))
    : threads;

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onNew}>
        <Plus className="h-3.5 w-3.5" /> New chat
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" /> History
            {threads.length > 0 && <span className="text-muted-foreground">({threads.length})</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search past threads…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="max-h-[360px]">
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No saved threads yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      "group flex items-start gap-2 px-3 py-2 hover:bg-accent cursor-pointer",
                      t.id === activeThreadId && "bg-accent",
                    )}
                    onClick={() => {
                      onSelect(t);
                      setOpen(false);
                    }}
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.messages.length} messages ·{" "}
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                        {t.endpoint === "ai-ops-chat" ? " · portfolio" : t.client_id ? ` · client #${t.client_id}` : ""}
                      </p>
                    </div>
                    <button
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteThread.mutate(t.id);
                      }}
                      aria-label="Delete thread"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
