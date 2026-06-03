import { useState } from "react";
import { Loader2, Search, FileText, RefreshCw, UserPlus, NotebookPen, Bell, Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type UserLog = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

const LOGS_QK = ["user-logs"] as const;

function useUserLogs() {
  return useQuery({
    queryKey: LOGS_QK,
    queryFn: async (): Promise<UserLog[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("user_logs")
        .select("id,title,body,is_read,created_at")
        .eq("user_id", auth.user.id)
        .order("is_read", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as UserLog[];
    },
  });
}

function AddLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const addLog = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_logs").insert({
        user_id: auth.user.id,
        title: title.trim(),
        body: body.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOGS_QK });
      setTitle("");
      setBody("");
      onClose();
      toast.success("Log added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add log"),
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || addLog.isPending) return;
            addLog.mutate();
          }}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h4 className="text-sm font-semibold text-foreground">Add Log</h4>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What happened?"
                maxLength={200}
                className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Add context, links, or details…"
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || addLog.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {addLog.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Log
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LogList() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useUserLogs();

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_logs").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LOGS_QK }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LOGS_QK }),
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading logs…</p>;
  }
  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground">No logs yet. Use "Add Log" to record one.</p>;
  }

  return (
    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {logs.map((log) => (
        <li
          key={log.id}
          className={cn(
            "group flex items-start gap-2 rounded-md border px-3 py-2 transition-colors",
            log.is_read
              ? "border-border bg-background"
              : "border-primary/30 bg-primary/5"
          )}
        >
          {!log.is_read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className={cn("text-sm font-medium truncate", log.is_read ? "text-foreground" : "text-foreground")}>
                {log.title}
              </p>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
              </span>
            </div>
            {log.body && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{log.body}</p>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {!log.is_read && (
              <button
                onClick={() => markRead.mutate(log.id)}
                aria-label="Mark read"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => remove.mutate(log.id)}
              aria-label="Delete log"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function QuickActionBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: logs = [] } = useUserLogs();
  const unreadCount = logs.filter((l) => !l.is_read).length;

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setLoading(key);
    try {
      await fn();
      toast.success(`${key} completed successfully`);
    } catch (e: any) {
      toast.error(`${key} failed`, { description: e?.message ?? "Please try again." });
    } finally {
      setLoading(null);
    }
  };

  const syncAllMetaAccounts = async () => {
    if (!currentWorkspace?.id) throw new Error("No workspace selected");
    const { data, error } = await supabase.functions.invoke("meta-sync", {
      body: { workspaceId: currentWorkspace.id },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const actions = [
    { key: "Add Log", short: "Add Log", icon: NotebookPen, fn: async () => { setLogOpen(true); } },
    { key: "Run Portfolio Audit", short: "Run audit", icon: Search, fn: () => api.runAudit("all") },
    { key: "Export Monthly Reports", short: "Export reports", icon: FileText, fn: () => api.exportAllReports() },
    { key: "Sync All Accounts", short: "Sync accounts", icon: RefreshCw, fn: syncAllMetaAccounts },
    { key: "Add New Client", short: "Add client", icon: UserPlus, fn: async () => { window.open("https://forms.clickup.com/9014197198/f/8cmkeye-3094/RKUHI8R4POC323J6DY", "_blank", "noopener,noreferrer"); } },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
        <div className="relative flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          <span>{unreadCount} new {unreadCount === 1 ? "log" : "logs"}</span>
          {unreadCount > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map((a) => {
          const isAddLog = a.key === "Add Log";
          return (
            <button
              key={a.key}
              disabled={loading !== null && loading !== a.key}
              onClick={() => (isAddLog ? setLogOpen(true) : handleAction(a.key, a.fn))}
              className={cn(
                "relative inline-flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-colors active:scale-[0.99] disabled:opacity-50",
                isAddLog
                  ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent"
              )}
            >
              {loading === a.key ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <a.icon className="h-4 w-4 text-primary" />
              )}
              <span className="truncate">{a.short}</span>
              {isAddLog && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Logs</h4>
        </div>
        <LogList />
      </div>

      <AddLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
