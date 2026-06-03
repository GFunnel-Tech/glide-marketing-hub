import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check, Trash2, Target, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FocusItem = {
  id: string;
  title: string;
  notes: string | null;
  is_done: boolean;
  position: number;
};

const QK = ["daily-focus-items"] as const;

export function DailyFocus() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<FocusItem[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("daily_focus_items")
        .select("id,title,notes,is_done,position")
        .eq("user_id", auth.user.id)
        .order("is_done", { ascending: true })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FocusItem[];
    },
  });

  const addItem = useMutation({
    mutationFn: async (title: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const nextPos = (items[items.length - 1]?.position ?? 0) + 1;
      const { error } = await supabase.from("daily_focus_items").insert({
        user_id: auth.user.id,
        title: title.trim(),
        position: nextPos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add focus item"),
  });

  const toggle = useMutation({
    mutationFn: async (item: FocusItem) => {
      const { error } = await supabase
        .from("daily_focus_items")
        .update({ is_done: !item.is_done })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const updateTitle = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("daily_focus_items")
        .update({ title: title.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_focus_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Daily Focus</h3>
            <p className="text-xs text-muted-foreground">
              Your personal priorities for today.
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {doneCount}/{items.length} done
        </span>
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || addItem.isPending) return;
          addItem.mutate(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a focus item…"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          maxLength={200}
        />
        <button
          type="submit"
          disabled={!draft.trim() || addItem.isPending}
          className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {addItem.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add
        </button>
      </form>

      <ul className="mt-4 space-y-1.5">
        {isLoading && (
          <li className="text-xs text-muted-foreground py-2">Loading…</li>
        )}
        {!isLoading && items.length === 0 && (
          <li className="text-xs text-muted-foreground py-2">
            No focus items yet. Add what matters most today.
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors"
          >
            <button
              onClick={() => toggle.mutate(item)}
              aria-label={item.is_done ? "Mark not done" : "Mark done"}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition-colors shrink-0",
                item.is_done
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border hover:border-primary"
              )}
            >
              {item.is_done && <Check className="h-3 w-3" />}
            </button>
            <input
              defaultValue={item.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.title) updateTitle.mutate({ id: item.id, title: v });
                else e.target.value = item.title;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={cn(
                "flex-1 bg-transparent text-sm focus:outline-none focus:ring-0 border-0 px-1 py-0.5 rounded",
                item.is_done
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            />
            <button
              onClick={() => remove.mutate(item.id)}
              aria-label="Delete"
              className="opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
