import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2, Plus, Trash2, UserCheck, UserX, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type Invite = {
  id: string;
  code: string;
  token: string;
  email: string | null;
  status: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_at: string;
};

type PortalUser = {
  id: string;
  user_id: string;
  status: string;
  accepted_at: string | null;
  approved_at: string | null;
};

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function ClientInvitesPanel({
  clientId,
  workspaceId,
  clientName,
}: {
  clientId: number;
  workspaceId: string | null;
  clientName: string;
}) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { email: string; display_name: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [inv, pu] = await Promise.all([
      supabase.from("client_invites").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("portal_users").select("id, user_id, status, accepted_at, approved_at").eq("client_id", clientId),
    ]);
    if (inv.data) setInvites(inv.data as Invite[]);
    if (pu.data) {
      setPortalUsers(pu.data as PortalUser[]);
      const ids = (pu.data as PortalUser[]).map((p) => p.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, email, display_name").in("id", ids);
        const map: Record<string, { email: string; display_name: string | null }> = {};
        (profs ?? []).forEach((p: any) => (map[p.id] = { email: p.email, display_name: p.display_name }));
        setProfiles(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const createInvite = async () => {
    if (!workspaceId || !user) return toast.error("Workspace not loaded");
    setCreating(true);
    const code = genCode();
    const { error } = await supabase.from("client_invites").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      code,
      email: email.trim() || null,
      created_by: user.id,
      max_uses: 1,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success("Invite created");
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("client_invites").update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
    load();
  };

  const updatePortalUser = async (id: string, status: "active" | "rejected") => {
    const payload: any = { status };
    if (status === "active") {
      payload.approved_at = new Date().toISOString();
      payload.approved_by = user?.id;
    }
    const { error } = await supabase.from("portal_users").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "active" ? "Approved" : "Rejected");
    load();
  };

  const removePortalUser = async (id: string) => {
    const { error } = await supabase.from("portal_users").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const buildLink = (token: string) => `${window.location.origin}/portal/accept?token=${token}`;

  const pending = portalUsers.filter((p) => p.status === "pending_approval");
  const active = portalUsers.filter((p) => p.status === "active");

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Client Portal Access</h3>
          <p className="text-xs text-muted-foreground">Invite {clientName} to their self-serve portal</p>
        </div>
      </div>

      {/* Create invite */}
      <div className="flex items-end gap-2 mb-4 p-3 rounded-md bg-muted/40 border border-border">
        <div className="flex-1">
          <Label htmlFor="invite-email" className="text-xs">Email (optional, pre-fills signup)</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="h-8"
          />
        </div>
        <Button size="sm" onClick={createInvite} disabled={creating}>
          {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Generate invite
        </Button>
      </div>

      {/* Pending approvals (highlighted) */}
      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2">Awaiting approval</p>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2.5 rounded-md border border-warning/30 bg-warning/5">
                <div className="text-sm">
                  <div className="font-medium">{profiles[p.user_id]?.display_name ?? profiles[p.user_id]?.email ?? p.user_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{profiles[p.user_id]?.email} · signed up {p.accepted_at ? new Date(p.accepted_at).toLocaleString() : "—"}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="default" onClick={() => updatePortalUser(p.id, "active")}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updatePortalUser(p.id, "rejected")}>
                    <UserX className="h-3.5 w-3.5 mr-1" />Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active portal users */}
      {active.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Active portal users ({active.length})</p>
          <div className="space-y-1.5">
            {active.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md border border-border">
                <div className="text-sm">
                  <span className="font-medium">{profiles[p.user_id]?.display_name ?? profiles[p.user_id]?.email}</span>
                  <span className="text-xs text-muted-foreground ml-2">{profiles[p.user_id]?.email}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removePortalUser(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invites */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Invites</p>
        {loading ? (
          <p className="text-xs text-muted-foreground italic">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No invites yet. Generate one above.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const isPending = inv.status === "pending" && !expired && inv.used_count < inv.max_uses;
              return (
                <div key={inv.id} className="p-2.5 rounded-md border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={isPending ? "default" : "secondary"} className="text-[10px]">
                        {expired ? "expired" : inv.status}
                      </Badge>
                      {inv.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{inv.email}</span>}
                      <span className="text-[11px] text-muted-foreground">
                        {inv.used_count}/{inv.max_uses} used · expires {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    {isPending && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap text-xs">
                    <span className="text-muted-foreground">Code:</span>
                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{inv.code}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => copy(inv.code, "Code")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 ml-2" onClick={() => copy(buildLink(inv.token), "Invite link")}>
                      <Copy className="h-3 w-3 mr-1" />Copy link
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
