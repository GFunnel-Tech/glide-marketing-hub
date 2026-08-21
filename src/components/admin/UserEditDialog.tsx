import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const POSITIONS = [
  "Owner",
  "Account Manager",
  "Media Buying Specialist",
  "Content Specialist",
  "Creative Designer",
  "Data Analyst",
  "Sales",
  "Support",
];

const WS_ROLES = ["owner", "admin", "member", "viewer"] as const;

export type EditableUser = {
  id: string;
  email: string;
  profile: { display_name?: string | null; position?: string | null; department?: string | null } | null;
  workspaces: { id: string; name: string; role: string }[];
};

type WorkspaceOption = { id: string; name: string };

export default function UserEditDialog({
  open,
  onOpenChange,
  user,
  workspaces,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = create new user */
  user: EditableUser | null;
  workspaces: WorkspaceOption[];
  onSaved: () => void;
}) {
  const isNew = !user;
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState<string>("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newWsId, setNewWsId] = useState<string>("");
  const [newWsRole, setNewWsRole] = useState<string>("member");

  useEffect(() => {
    if (!open) return;
    setDisplayName(user?.profile?.display_name ?? "");
    setPosition(user?.profile?.position ?? "");
    setDepartment(user?.profile?.department ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setNewWsId("");
    setNewWsRole("member");
  }, [open, user]);

  const available = useMemo(
    () => workspaces.filter((w) => !(user?.workspaces ?? []).some((m) => m.id === w.id)),
    [workspaces, user]
  );

  const call = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw new Error((data as any)?.error ?? error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await call({
          action: "create_user",
          email: email.trim(),
          password,
          display_name: displayName.trim() || null,
          position: position || null,
          workspace_id: newWsId || null,
          workspace_role: newWsRole,
        });
        toast.success("User created");
      } else {
        await call({
          action: "update_user",
          user_id: user!.id,
          display_name: displayName.trim() || null,
          position: position || null,
          department: department.trim() || null,
          email: email.trim() !== user!.email ? email.trim() : undefined,
          password: password || undefined,
        });
        toast.success("User updated");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setMembership = async (workspace_id: string, role: string) => {
    try {
      await call({ action: "set_workspace_member", user_id: user!.id, workspace_id, role });
      toast.success("Workspace access updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  const removeMembership = async (workspace_id: string) => {
    try {
      await call({ action: "remove_workspace_member", user_id: user!.id, workspace_id });
      toast.success("Removed from workspace");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New user" : `Edit ${user?.profile?.display_name || user?.email}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select value={position || undefined} onValueChange={setPosition}>
                <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isNew && (
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Operations" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
          </div>

          <div className="space-y-1.5">
            <Label>{isNew ? "Password" : "Set new password (optional)"}</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <Label>Workspace access</Label>
            {!isNew && (
              <div className="space-y-2">
                {(user?.workspaces ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Not a member of any workspace.</p>
                )}
                {(user?.workspaces ?? []).map((w) => (
                  <div key={w.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate">{w.name}</span>
                    <Select value={w.role} onValueChange={(v) => setMembership(w.id, v)}>
                      <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WS_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMembership(w.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select value={newWsId || undefined} onValueChange={setNewWsId}>
                <SelectTrigger className="flex-1 h-8"><SelectValue placeholder={isNew ? "Assign workspace" : "Add to workspace"} /></SelectTrigger>
                <SelectContent>
                  {(isNew ? workspaces : available).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newWsRole} onValueChange={setNewWsRole}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WS_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {!isNew && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!newWsId}
                  onClick={async () => { await setMembership(newWsId, newWsRole); setNewWsId(""); }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? "Create user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
