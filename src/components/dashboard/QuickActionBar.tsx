import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, FileText, RefreshCw, UserPlus, NotebookPen, Bell, Check, Trash2, X, Users, Building2, User as UserIcon, Archive, CheckCircle2, Clock, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const DEPARTMENTS = [
  "Leadership",
  "Account Management",
  "Ads",
  "Operations",
  "Engineering",
  "Design",
  "Sales",
  "Support",
] as const;

type AudienceKind = "general" | "department" | "user";

type LogStatus = "new" | "in_process" | "needs_feedback" | "completed" | "archived";

type UserLog = {
  id: string;
  title: string;
  body: string | null;
  audience_kind: AudienceKind;
  department: string | null;
  recipient_user_id: string | null;
  workspace_id: string | null;
  user_id: string;
  created_at: string;
  status: LogStatus;
  status_note: string | null;
  completed_by: string | null;
  completed_at: string | null;
  archived_at: string | null;
};


const LOGS_QK = (wsId: string | null | undefined) => ["user-logs", wsId ?? "none"] as const;
const READS_QK = ["user-log-reads"] as const;
const MY_PROFILE_QK = ["my-profile-department"] as const;
const WS_MEMBERS_QK = (wsId: string | null | undefined) => ["ws-members-profiles", wsId ?? "none"] as const;

function useMyProfile() {
  return useQuery({
    queryKey: MY_PROFILE_QK,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email, department")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useUserLogs() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: LOGS_QK(currentWorkspace?.id),
    queryFn: async (): Promise<UserLog[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("user_logs")
        .select("id,title,body,audience_kind,department,recipient_user_id,workspace_id,user_id,created_at,status,status_note,completed_by,completed_at,archived_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as UserLog[];
    },
  });
}


function useMyReads() {
  return useQuery({
    queryKey: READS_QK,
    queryFn: async (): Promise<Set<string>> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return new Set();
      const { data, error } = await supabase
        .from("user_log_reads")
        .select("log_id")
        .eq("user_id", auth.user.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.log_id));
    },
  });
}

function useWorkspaceMembers() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: WS_MEMBERS_QK(currentWorkspace?.id),
    enabled: !!currentWorkspace?.id,
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", currentWorkspace.id);
      if (error) throw error;
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, email, department")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles ?? []) as Array<{ id: string; display_name: string | null; email: string | null; department: string | null }>;
    },
  });
}

function AddLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { data: profile } = useMyProfile();
  const { data: members = [] } = useWorkspaceMembers();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceKind>("general");
  const [department, setDepartment] = useState<string>("");
  const [recipientId, setRecipientId] = useState<string>("");
  const [myDept, setMyDept] = useState<string>("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setAudience("general");
      setDepartment(profile?.department ?? "");
      setRecipientId("");
      setMyDept(profile?.department ?? "");
    }
  }, [open, profile?.department]);

  const updateMyDept = useMutation({
    mutationFn: async (dept: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update({ department: dept }).eq("id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PROFILE_QK }),
  });

  const addLog = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const payload: any = {
        user_id: auth.user.id,
        workspace_id: currentWorkspace?.id ?? null,
        title: title.trim(),
        body: body.trim() || null,
        audience_kind: audience,
        department: audience === "department" ? department || null : null,
        recipient_user_id: audience === "user" ? recipientId || null : null,
      };
      if (audience === "general" && !currentWorkspace?.id) {
        throw new Error("No workspace selected for a general log");
      }
      if (audience === "department" && !payload.department) {
        throw new Error("Pick a department");
      }
      if (audience === "user" && !payload.recipient_user_id) {
        throw new Error("Pick a recipient");
      }
      const { error } = await supabase.from("user_logs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOGS_QK(currentWorkspace?.id) });
      onClose();
      toast.success("Log added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add log"),
  });

  if (!open) return null;

  const audienceTabs: { value: AudienceKind; label: string; icon: typeof Users }[] = [
    { value: "general", label: "Everyone", icon: Users },
    { value: "department", label: "Department", icon: Building2 },
    { value: "user", label: "Specific user", icon: UserIcon },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
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

          <div className="space-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Audience</label>
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-0.5">
                {audienceTabs.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setAudience(t.value)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-8 rounded text-xs font-medium transition-colors",
                      audience === t.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {audience === "department" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Select department…</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {audience === "user" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Recipient</label>
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Select teammate…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email || m.id.slice(0, 8)}
                      {m.department ? ` · ${m.department}` : ""}
                    </option>
                  ))}
                </select>
                {members.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">No teammates in this workspace yet.</p>
                )}
              </div>
            )}

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
                rows={3}
                maxLength={2000}
                placeholder="Add context, links, or details…"
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Your department
              </label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={myDept}
                  onChange={(e) => {
                    setMyDept(e.target.value);
                    if (e.target.value) updateMyDept.mutate(e.target.value);
                  }}
                  className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Not set</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">used to receive dept logs</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-accent">
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

function AudienceBadge({ log, recipientName }: { log: UserLog; recipientName?: string }) {
  const base = "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded";
  if (log.audience_kind === "general") {
    return <span className={cn(base, "bg-blue-500/10 text-blue-600 dark:text-blue-400")}><Users className="h-3 w-3" />Everyone</span>;
  }
  if (log.audience_kind === "department") {
    return <span className={cn(base, "bg-amber-500/10 text-amber-600 dark:text-amber-400")}><Building2 className="h-3 w-3" />{log.department}</span>;
  }
  return <span className={cn(base, "bg-pink-500/10 text-pink-600 dark:text-pink-400")}><UserIcon className="h-3 w-3" />{recipientName ?? "User"}</span>;
}

function LogList() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { data: logs = [], isLoading } = useUserLogs();
  const { data: reads = new Set<string>() } = useMyReads();
  const { data: members = [] } = useWorkspaceMembers();
  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((p) => m.set(p.id, p.display_name || p.email || p.id.slice(0, 8)));
    return m;
  }, [members]);

  const sorted = useMemo(() => {
    return [...logs].sort((a, b) => {
      const aRead = reads.has(a.id) ? 1 : 0;
      const bRead = reads.has(b.id) ? 1 : 0;
      if (aRead !== bRead) return aRead - bRead;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [logs, reads]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_log_reads").insert({ log_id: id, user_id: auth.user.id });
      if (error && !String(error.message).includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: READS_QK }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LOGS_QK(currentWorkspace?.id) }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading logs…</p>;
  if (sorted.length === 0) return <p className="text-xs text-muted-foreground">No logs yet. Use "Add Log" to record one.</p>;

  return (
    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {sorted.map((log) => {
        const isRead = reads.has(log.id);
        const recipientName = log.recipient_user_id ? memberMap.get(log.recipient_user_id) : undefined;
        return (
          <li
            key={log.id}
            className={cn(
              "group flex items-start gap-2 rounded-md border px-3 py-2 transition-colors",
              isRead ? "border-border bg-background" : "border-primary/30 bg-primary/5"
            )}
          >
            {!isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate text-foreground">{log.title}</p>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                <AudienceBadge log={log} recipientName={recipientName} />
              </div>
              {log.body && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{log.body}</p>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isRead && (
                <button onClick={() => markRead.mutate(log.id)} aria-label="Mark read" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => remove.mutate(log.id)} aria-label="Delete log" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function QuickActionBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: logs = [] } = useUserLogs();
  const { data: reads = new Set<string>() } = useMyReads();
  const unreadCount = logs.filter((l) => !reads.has(l.id)).length;

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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent Logs</h4>
        <LogList />
      </div>

      <AddLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
