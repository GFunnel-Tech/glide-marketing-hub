import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, StickyNote, Trash2, Plus, Loader2, User, Check, Eye, EyeOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Note = {
  id: string;
  content: string;
  done: boolean;
  due_at: string | null;
  reminded_at: string | null;
  assigned_to: string | null;
  created_at: string;
  user_id: string;
  visible_to_client: boolean;
};

type Member = { id: string; display_name: string | null; email: string | null };

interface NoteBubbleProps {
  clientId?: number | null;
  /** Visual variant: full button (section) or compact icon (row) */
  variant?: "button" | "icon";
  label?: string;
  align?: "start" | "end" | "center";
}

export function NoteBubble({ clientId = null, variant = "icon", label, align = "end" }: NoteBubbleProps) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState<Date | undefined>(undefined);
  const [draftTime, setDraftTime] = useState<string>("09:00");
  const [calOpen, setCalOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [shareWithClient, setShareWithClient] = useState(false);

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["ws-members-for-notes", wsId],
    enabled: !!wsId && open,
    queryFn: async () => {
      const { data: m, error } = await supabase
        .from("workspace_members").select("user_id").eq("workspace_id", wsId!);
      if (error) throw error;
      const ids = (m ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: p } = await supabase
        .from("profiles").select("id, display_name, email").in("id", ids);
      return (p ?? []) as Member[];
    },
  });
  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);
  const memberLabel = (id: string) => {
    const m = memberMap.get(id);
    return m?.display_name || m?.email || "Member";
  };

  const queryKey = ["client-notes", wsId, clientId ?? "ws"];
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey,
    enabled: !!wsId,
    queryFn: async () => {
      let q = supabase
        .from("client_notes")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("done", { ascending: true })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (clientId == null) q = q.is("client_id", null);
      else q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  // Live updates: refetch on any change to client_notes in this workspace/scope.
  useEffect(() => {
    if (!wsId) return;
    const filter =
      clientId == null
        ? `workspace_id=eq.${wsId}`
        : `client_id=eq.${clientId}`;
    const channel = supabase
      .channel(`client_notes-${wsId}-${clientId ?? "ws"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_notes", filter },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, clientId]);

  const dueCount = notes.filter((n) => !n.done).length;

  const addMut = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("No workspace");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      let dueAt: string | null = null;
      if (draftDate) {
        const [hh, mm] = draftTime.split(":").map(Number);
        const dt = new Date(draftDate);
        dt.setHours(hh || 0, mm || 0, 0, 0);
        dueAt = dt.toISOString();
      }
      const { error } = await supabase.from("client_notes").insert({
        workspace_id: wsId,
        client_id: clientId,
        user_id: u.user.id,
        content: draft.trim(),
        due_at: dueAt,
        assigned_to: assigneeId,
        visible_to_client: shareWithClient && !!clientId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setDraftDate(undefined);
      setDraftTime("09:00");
      setAssigneeId(null);
      setShareWithClient(false);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save note"),
  });

  const toggleMut = useMutation({
    mutationFn: async (n: Note) => {
      const { error } = await supabase
        .from("client_notes")
        .update({ done: !n.done })
        .eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const Trigger =
    variant === "button" ? (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs relative">
        <StickyNote className="h-3.5 w-3.5" />
        {label ?? "Notes"}
        {dueCount > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
            {dueCount}
          </span>
        )}
      </Button>
    ) : (
      <button
        type="button"
        className="relative inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Notes & tasks"
        onClick={(e) => e.stopPropagation()}
      >
        <StickyNote className="h-3.5 w-3.5" />
        {dueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground leading-none">
            {dueCount}
          </span>
        )}
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>{Trigger}</PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0"
        align={align}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <StickyNote className="h-3.5 w-3.5 text-primary" />
            {label ?? (clientId ? "Client notes & tasks" : "Notes & tasks")}
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a note or task…"
            className="min-h-[60px] resize-none text-xs"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 flex-1 justify-start gap-1.5 text-xs font-normal",
                    !draftDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {draftDate ? format(draftDate, "MMM d") : "Remind me…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={draftDate}
                  onSelect={(d) => {
                    setDraftDate(d);
                    setCalOpen(false);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {draftDate && (
              <Input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                className="h-7 w-[100px] text-xs"
              />
            )}
            {draftDate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setDraftDate(undefined)}
              >
                Clear
              </Button>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 flex-1 justify-start gap-1.5 text-xs font-normal",
                    !assigneeId && "text-muted-foreground",
                  )}
                >
                  <User className="h-3 w-3" />
                  {assigneeId ? memberLabel(assigneeId) : "Assign to…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search teammate…" className="text-xs" />
                  <CommandList>
                    <CommandEmpty>No teammates.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => { setAssigneeId(null); setAssigneeOpen(false); }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", !assigneeId ? "opacity-100" : "opacity-0")} />
                        Unassigned
                      </CommandItem>
                      {members.map((m) => (
                        <CommandItem
                          key={m.id}
                          onSelect={() => { setAssigneeId(m.id); setAssigneeOpen(false); }}
                          className="text-xs"
                        >
                          <Check className={cn("mr-2 h-3.5 w-3.5", assigneeId === m.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span className="font-medium">{m.display_name || m.email}</span>
                            {m.display_name && m.email && (
                              <span className="text-[10px] text-muted-foreground">{m.email}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {assigneeId && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssigneeId(null)}>
                Clear
              </Button>
            )}
          </div>
          <Button
            size="sm"
            className="mt-2 h-7 w-full gap-1.5 text-xs"
            disabled={!draft.trim() || addMut.isPending || !wsId}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add
          </Button>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading && (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!isLoading && notes.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">No notes yet.</div>
          )}
          {!isLoading && notes.map((n) => {
            const overdue = !n.done && n.due_at && new Date(n.due_at) < new Date();
            return (
              <div
                key={n.id}
                className="group flex items-start gap-2 rounded-md p-2 hover:bg-accent/40"
              >
                <Checkbox
                  checked={n.done}
                  onCheckedChange={() => toggleMut.mutate(n)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs whitespace-pre-wrap break-words",
                      n.done && "line-through text-muted-foreground",
                    )}
                  >
                    {n.content}
                  </p>
                  {(n.due_at || n.assigned_to) && (
                    <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                      {n.due_at && (
                        <span className={cn(
                          "inline-flex items-center gap-1",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground",
                        )}>
                          <CalendarIcon className="h-2.5 w-2.5" />
                          {format(new Date(n.due_at), "MMM d, h:mm a")}
                          {n.reminded_at && <span className="ml-1">· sent</span>}
                        </span>
                      )}
                      {n.assigned_to && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                          <User className="h-2.5 w-2.5" />
                          {memberLabel(n.assigned_to)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => delMut.mutate(n.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
