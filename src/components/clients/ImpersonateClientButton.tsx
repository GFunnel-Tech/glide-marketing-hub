import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type PortalUser = { id: string; user_id: string; status: string };
type Profile = { id: string; email: string | null; display_name: string | null };

export function ImpersonateClientButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { isSuperAdmin } = useIsSuperAdmin();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState(false);

  const role = currentWorkspace?.role;
  const canImpersonate = isSuperAdmin || role === "owner" || role === "admin";

  useEffect(() => {
    if (!canImpersonate) return;
    (async () => {
      const { data } = await supabase
        .from("portal_users")
        .select("id, user_id, status")
        .eq("client_id", clientId);
      const rows = (data ?? []) as PortalUser[];
      setUsers(rows);
      if (rows.length === 0) return;
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    })();
  }, [clientId, canImpersonate]);

  if (!canImpersonate) return null;

  const impersonate = async (targetUserId: string, label: string) => {
    if (!confirm(`Sign in as ${label}? You will be acting as this client.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-impersonate", {
        body: { target_user_id: targetUserId, reason: `Client portal impersonation: ${clientName}` },
      });
      if (error) throw error;
      const { hashed_token, email } = data;
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        localStorage.setItem("impersonation.original_session", JSON.stringify(sess.session));
        localStorage.setItem("impersonation.target_email", email);
      }
      const { error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashed_token });
      if (vErr) throw vErr;
      toast.success(`Now acting as ${email}`);
      window.location.href = "/portal";
    } catch (e: any) {
      toast.error(e.message ?? "Impersonation failed");
      setBusy(false);
    }
  };

  const labelFor = (uid: string) =>
    profiles[uid]?.display_name || profiles[uid]?.email || uid.slice(0, 8);

  const active = users.filter((u) => u.status === "active" || u.status === "approved" || u.status === "accepted");
  const list = active.length > 0 ? active : users;

  const btn = (
    <button
      type="button"
      disabled={busy || users.length === 0}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
      title={users.length === 0 ? "No portal users for this client yet" : "Impersonate client portal user"}
      aria-label="Impersonate client"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
    </button>
  );

  if (users.length === 0) return btn;

  if (list.length === 1) {
    const u = list[0];
    return (
      <span onClick={() => impersonate(u.user_id, labelFor(u.user_id))}>{btn}</span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{btn}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Sign in as portal user</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => impersonate(u.user_id, labelFor(u.user_id))} className="cursor-pointer">
            <LogIn className="h-3.5 w-3.5 mr-2" />
            <span className="truncate">{labelFor(u.user_id)}</span>
            <span className="ml-auto text-[10px] uppercase text-muted-foreground">{u.status}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
