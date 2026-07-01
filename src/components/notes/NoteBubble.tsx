import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, StickyNote, Trash2, Plus, Loader2, User, Check, Eye, EyeOff, ArrowUpDown, Pencil } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Note = {
  id: string;
  content: string;
  done: boolean;
  due_at: string | null;
  reminded_at: string | null;
  assigned_to: string | null;
  assigned_to_ids: string[] | null;
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
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [shareWithClient, setShareWithClient] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  type SortKey = "newest" | "oldest" | "az" | "za" | "due_soonest" | "due_latest";
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  // Edit dialog state
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editTime, setEditTime] = useState<string>("09:00");
  const [editCalOpen, setEditCalOpen] = useState(false);
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [editAssigneeOpen, setEditAssigneeOpen] = useState(false);
  const [editShare, setEditShare] = useState(false);

  function openEdit(n: Note) {
    setEditingNote(n);
    setEditContent(n.content);
    if (n.due_at) {
      const d = new Date(n.due_at);
      setEditDate(d);
      setEditTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setEditDate(undefined);
      setEditTime("09:00");
    }
    const ids = (n.assigned_to_ids && n.assigned_to_ids.length > 0)
      ? n.assigned_to_ids
      : (n.assigned_to ? [n.assigned_to] : []);
    setEditAssigneeIds(ids);
    setEditShare(!!n.visible_to_client);
  }


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
  const visibleNotes = useMemo(() => {
    const filtered = notes.filter((n) => (activeTab === "active" ? !n.done : n.done));
    const arr = [...filtered];
    const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
    switch (sortKey) {
      case "newest":
        arr.sort((a, b) => t(b.created_at) - t(a.created_at));
        break;
      case "oldest":
        arr.sort((a, b) => t(a.created_at) - t(b.created_at));
        break;
      case "az":
        arr.sort((a, b) => a.content.localeCompare(b.content));
        break;
      case "za":
        arr.sort((a, b) => b.content.localeCompare(a.content));
        break;
      case "due_soonest":
        arr.sort((a, b) => {
          const at = a.due_at ? t(a.due_at) : Infinity;
          const bt = b.due_at ? t(b.due_at) : Infinity;
          return at - bt;
        });
        break;
      case "due_latest":
        arr.sort((a, b) => {
          const at = a.due_at ? t(a.due_at) : -Infinity;
          const bt = b.due_at ? t(b.due_at) : -Infinity;
          return bt - at;
        });
        break;
    }
    return arr;
  }, [notes, activeTab, sortKey]);


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
        assigned_to: assigneeIds[0] ?? null,
        assigned_to_ids: assigneeIds,
        visible_to_client: shareWithClient && !!clientId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setDraftDate(undefined);
      setDraftTime("09:00");
      setAssigneeIds([]);
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

  const visibilityMut = useMutation({
    mutationFn: async (n: Note) => {
      const { error } = await supabase
        .from("client_notes")
        .update({ visible_to_client: !n.visible_to_client })
        .eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editingNote) throw new Error("No note");
      let dueAt: string | null = null;
      if (editDate) {
        const [hh, mm] = editTime.split(":").map(Number);
        const dt = new Date(editDate);
        dt.setHours(hh || 0, mm || 0, 0, 0);
        dueAt = dt.toISOString();
      }
      const { error } = await supabase
        .from("client_notes")
        .update({
          content: editContent.trim(),
          due_at: dueAt,
          assigned_to: editAssigneeIds[0] ?? null,
          assigned_to_ids: editAssigneeIds,
          visible_to_client: editShare && !!clientId,
        })
        .eq("id", editingNote.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingNote(null);
      qc.invalidateQueries({ queryKey });
      toast.success("Task updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update task"),
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
                    assigneeIds.length === 0 && "text-muted-foreground",
                  )}
                >
                  <User className="h-3 w-3" />
                  {assigneeIds.length === 0
                    ? "Assign to…"
                    : assigneeIds.length === 1
                    ? memberLabel(assigneeIds[0])
                    : `${assigneeIds.length} assignees`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search teammate…" className="text-xs" />
                  <CommandList>
                    <CommandEmpty>No teammates.</CommandEmpty>
                    <CommandGroup>
                      {members.map((m) => {
                        const selected = assigneeIds.includes(m.id);
                        return (
                          <CommandItem
                            key={m.id}
                            onSelect={() => {
                              setAssigneeIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((x) => x !== m.id)
                                  : [...prev, m.id],
                              );
                            }}
                            className="text-xs"
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span className="font-medium">{m.display_name || m.email}</span>
                              {m.display_name && m.email && (
                                <span className="text-[10px] text-muted-foreground">{m.email}</span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {assigneeIds.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssigneeIds([])}>
                Clear
              </Button>
            )}
          </div>
          {clientId != null && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShareWithClient((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium transition-colors",
                  shareWithClient
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
                title="Toggle visibility in the client portal"
              >
                {shareWithClient ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                {shareWithClient ? "Visible to client" : "Internal only"}
              </button>
            </div>
          )}
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

        <div className="flex items-center justify-between gap-1 border-b border-border px-2 pt-2">
          <div className="flex items-center gap-1">
          {(["active", "completed"] as const).map((t) => {
            const count = t === "active"
              ? notes.filter((n) => !n.done).length
              : notes.filter((n) => n.done).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={cn(
                  "rounded-t-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  activeTab === t
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "active" ? "Active" : "Completed"}
                {count > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Sort"
              >
                <ArrowUpDown className="h-3 w-3" />
                Sort
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sort by
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={sortKey} onValueChange={(v) => setSortKey(v as any)}>
                <DropdownMenuRadioItem value="newest" className="text-xs">Newest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest" className="text-xs">Oldest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="az" className="text-xs">A → Z</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="za" className="text-xs">Z → A</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="due_soonest" className="text-xs">Due soonest</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="due_latest" className="text-xs">Due latest</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading && (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!isLoading && visibleNotes.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {activeTab === "active" ? "No active notes." : "No completed notes yet."}
            </div>
          )}
          {!isLoading && visibleNotes.map((n) => {
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
                  <button
                    type="button"
                    onClick={() => openEdit(n)}
                    className={cn(
                      "text-xs whitespace-pre-wrap break-words text-left hover:underline",
                      n.done && "text-muted-foreground",
                    )}
                  >
                    {n.content}
                  </button>
                  {(() => {
                    const ids = (n.assigned_to_ids && n.assigned_to_ids.length > 0)
                      ? n.assigned_to_ids
                      : (n.assigned_to ? [n.assigned_to] : []);
                    if (!n.due_at && ids.length === 0) return null;
                    return (
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[10px]">
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
                        {ids.map((uid) => (
                          <span
                            key={uid}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary font-medium"
                          >
                            <User className="h-2.5 w-2.5" />
                            {memberLabel(uid)}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={() => visibilityMut.mutate(n)}
                  className={cn(
                    "transition-opacity",
                    n.visible_to_client
                      ? "text-success opacity-100"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                  )}
                  title={n.visible_to_client ? "Visible to client — click to hide" : "Internal — click to share with client"}
                >
                  {n.visible_to_client ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => openEdit(n)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
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

      <Dialog open={!!editingNote} onOpenChange={(o) => !o && setEditingNote(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Task</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Popover open={editCalOpen} onOpenChange={setEditCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 flex-1 justify-start gap-1.5 text-xs font-normal">
                    <CalendarIcon className="h-3 w-3" />
                    {editDate ? format(editDate, "MMM d, yyyy") : "No due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editDate} onSelect={(d) => { setEditDate(d ?? undefined); setEditCalOpen(false); }} initialFocus />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="h-8 w-[110px] text-xs"
                disabled={!editDate}
              />
              {editDate && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setEditDate(undefined)}>Clear</Button>
              )}
            </div>
            <div>
              <Label className="text-xs">Assignees</Label>
              <div className="mt-1 flex items-center gap-1.5">
                <Popover open={editAssigneeOpen} onOpenChange={setEditAssigneeOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-8 flex-1 justify-start gap-1.5 text-xs font-normal", editAssigneeIds.length === 0 && "text-muted-foreground")}>
                      <User className="h-3 w-3" />
                      {editAssigneeIds.length === 0
                        ? "Assign to…"
                        : editAssigneeIds.length === 1
                        ? memberLabel(editAssigneeIds[0])
                        : `${editAssigneeIds.length} assignees`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search teammate…" className="text-xs" />
                      <CommandList>
                        <CommandEmpty>No teammates.</CommandEmpty>
                        <CommandGroup>
                          {members.map((m) => {
                            const selected = editAssigneeIds.includes(m.id);
                            return (
                              <CommandItem
                                key={m.id}
                                onSelect={() => {
                                  setEditAssigneeIds((prev) =>
                                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                                  );
                                }}
                                className="text-xs"
                              >
                                <Check className={cn("mr-2 h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="font-medium">{m.display_name || m.email}</span>
                                  {m.display_name && m.email && (
                                    <span className="text-[10px] text-muted-foreground">{m.email}</span>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {editAssigneeIds.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setEditAssigneeIds([])}>Clear</Button>
                )}
              </div>
            </div>
            {!!clientId && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={editShare} onCheckedChange={(v) => setEditShare(!!v)} />
                Visible to client
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingNote(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!editContent.trim() || updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
