import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Shield, Ban, Trash2, UserCog, LogIn, Building2, History, LogOut as LogOutIcon } from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Navigate } from "react-router-dom";

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  profile: { display_name?: string | null } | null;
  roles: string[];
  workspaces: { id: string; name: string; role: string }[];
};

type AdminWorkspace = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  created_by: string | null;
  workspace_members: { count: number }[];
};

type AuditEntry = {
  id: string;
  super_admin_id: string;
  target_user_id: string | null;
  action: string;
  meta: any;
  created_at: string;
  super_admin: { email?: string; display_name?: string } | null;
  target_user: { email?: string; display_name?: string } | null;
};

export default function SuperAdmin() {
  const { data: isSuper, isLoading: checking } = useIsSuperAdmin();
  const [tab, setTab] = useState<"users" | "workspaces" | "audit">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [u, w, a] = await Promise.all([
        supabase.functions.invoke("admin-users", { body: { action: "list" } }),
        supabase.functions.invoke("admin-users", { body: { action: "list_workspaces" } }),
        supabase.functions.invoke("admin-users", { body: { action: "list_audit", limit: 200 } }),
      ]);
      if (u.error) throw u.error;
      if (w.error) throw w.error;
      if (a.error) throw a.error;
      setUsers(u.data?.users ?? []);
      setWorkspaces(w.data?.workspaces ?? []);
      setAudit(a.data?.entries ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuper) load(); }, [isSuper]);

  if (checking) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (!isSuper) return <Navigate to="/" replace />;

  const call = async (body: any, msg = "Done") => {
    const { error } = await supabase.functions.invoke("admin-users", { body });
    if (error) toast.error(error.message);
    else { toast.success(msg); load(); }
  };

  const impersonate = async (user: AdminUser) => {
    if (!confirm(`Impersonate ${user.email}? You will be signed in as them.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-impersonate", {
        body: { target_user_id: user.id },
      });
      if (error) throw error;
      const { hashed_token, email } = data;
      // Save current session so we can restore it
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        localStorage.setItem("impersonation.original_session", JSON.stringify(sess.session));
        localStorage.setItem("impersonation.target_email", email);
      }
      const { error: vErr } = await supabase.auth.verifyOtp({
        type: "magiclink", token_hash: hashed_token,
      });
      if (vErr) throw vErr;
      toast.success(`Now acting as ${email}`);
      window.location.href = "/";
    } catch (e: any) {
      toast.error(e.message ?? "Impersonation failed");
    }
  };

  const filteredUsers = users.filter((u) =>
    !query || u.email?.toLowerCase().includes(query.toLowerCase()) ||
    u.profile?.display_name?.toLowerCase().includes(query.toLowerCase())
  );
  const filteredWs = workspaces.filter((w) => !query || w.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Super Admin</h1>
        </div>
        <input
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-background text-sm w-64"
        />
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["users", "workspaces", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {tab === "users" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Roles</th>
                <th className="p-3">Workspaces</th>
                <th className="p-3">Last sign-in</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const banned = u.banned_until && new Date(u.banned_until) > new Date();
                const isSuper = u.roles.includes("super_admin");
                return (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{u.profile?.display_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className={`text-xs px-1.5 py-0.5 rounded ${
                            r === "super_admin" ? "bg-primary/20 text-primary" : "bg-muted"
                          }`}>{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-xs">
                      {u.workspaces.slice(0, 3).map((w) => `${w.name} (${w.role})`).join(", ")}
                      {u.workspaces.length > 3 && ` +${u.workspaces.length - 3}`}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3">
                      {banned ? <span className="text-xs text-destructive">Suspended</span> : <span className="text-xs text-muted-foreground">Active</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Impersonate" onClick={() => impersonate(u)} className="p-1.5 rounded hover:bg-accent"><LogIn className="h-4 w-4" /></button>
                        <button title={isSuper ? "Remove super admin" : "Make super admin"}
                          onClick={() => call({ action: "set_role", user_id: u.id, role: "super_admin", enabled: !isSuper },
                            isSuper ? "Removed super admin" : "Granted super admin")}
                          className="p-1.5 rounded hover:bg-accent"><UserCog className="h-4 w-4" /></button>
                        <button title={banned ? "Unsuspend" : "Suspend"}
                          onClick={() => call(banned ? { action: "unban", user_id: u.id } : { action: "ban", user_id: u.id },
                            banned ? "Unsuspended" : "Suspended")}
                          className="p-1.5 rounded hover:bg-accent"><Ban className="h-4 w-4" /></button>
                        <button title="Delete" onClick={() => {
                          if (confirm(`Delete ${u.email}? This is permanent.`)) call({ action: "delete_user", user_id: u.id }, "Deleted");
                        }} className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "workspaces" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Workspace</th>
                <th className="p-3">Members</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWs.map((w) => (
                <tr key={w.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{w.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{w.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{w.workspace_members?.[0]?.count ?? 0}</td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Rename" onClick={() => {
                        const name = prompt("New name:", w.name);
                        if (name && name !== w.name) call({ action: "rename_workspace", workspace_id: w.id, name }, "Renamed");
                      }} className="p-1.5 rounded hover:bg-accent"><UserCog className="h-4 w-4" /></button>
                      <button title="Delete" onClick={() => {
                        if (confirm(`Delete workspace "${w.name}" and all its data?`)) call({ action: "delete_workspace", workspace_id: w.id }, "Deleted");
                      }} className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
