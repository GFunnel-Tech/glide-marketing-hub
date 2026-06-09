import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserPlus, Pencil, Trash2, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember,
  type DbTeamMember, type TeamMemberInput,
} from "@/hooks/useDatabase";

const ROLE_OPTIONS = ["Owner", "Admin", "Manager", "Member", "Agency Admin", "Account Admin"];
const ACCESS_OPTIONS = ["Full", "Standard", "Restricted", "Read Only"];
const STATUS_OPTIONS = ["active", "invited", "inactive", "suspended"];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success/15 text-success",
  invited: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/15 text-destructive",
};

function initials(name: string) {
  return name.trim().split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}

/** Ensure the member's stored value is selectable even if it isn't in the preset list. */
function withValue(options: string[], value: string) {
  return value && !options.includes(value) ? [value, ...options] : options;
}

const EMPTY: TeamMemberInput = {
  name: "", email: "", phone: "", role: "Member", access_level: "Standard", member_status: "active",
};

export function TeamMembersPanel() {
  const { data: members = [], isLoading } = useTeamMembers();
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState<DbTeamMember | null>(null);
  const [form, setForm] = useState<TeamMemberInput>(EMPTY);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DbTeamMember | null>(null);

  const roles = useMemo(
    () => Array.from(new Set(members.map(m => m.role).filter(Boolean))),
    [members],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return [m.name, m.email, m.phone, m.role].some(v => v?.toLowerCase().includes(q));
    });
  }, [members, search, roleFilter]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (m: DbTeamMember) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email ?? "",
      phone: m.phone ?? "",
      role: m.role,
      access_level: m.access_level,
      member_status: m.member_status,
    });
    setDialogOpen(true);
  };

  const set = (patch: Partial<TeamMemberInput>) => setForm(f => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!editing && !form.email?.trim()) {
      return toast.error("An email is required — it's how the new user signs in");
    }
    const payload: TeamMemberInput = {
      ...form,
      name: form.name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
    };
    try {
      if (editing) {
        await updateMember.mutateAsync({ id: editing.id, ...payload });
        toast.success("Member updated");
      } else {
        const res = await createMember.mutateAsync(payload);
        if (res.invite_link) {
          toast.success(res.created ? "User created & invited" : "User added to workspace", {
            description: "Copy their sign-in link",
            action: {
              label: "Copy link",
              onClick: () => {
                navigator.clipboard.writeText(res.invite_link!);
                toast.success("Sign-in link copied");
              },
            },
            duration: 10000,
          });
        } else {
          toast.success("User added");
        }
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save member");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMember.mutateAsync(toDelete.id);
      toast.success("Member removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove member");
    } finally {
      setToDelete(null);
    }
  };

  const saving = createMember.isPending || updateMember.isPending;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Team Members</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Manage the people who can access this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="All roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="h-9 w-[220px] pl-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={openAdd}><UserPlus className="h-3.5 w-3.5 mr-1" />Add User</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading team…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" />
          {members.length === 0
            ? <>No team members yet. <button onClick={openAdd} className="text-primary hover:underline">Add your first user</button>.</>
            : "No members match your filters."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-accent/50">
            {["Name", "Email", "Phone", "Role", "Access Level", "Status", ""].map((h, i) => (
              <th key={i} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials(m.name)}</span>
                    <span className="font-medium text-foreground">{m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.email || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.phone || "—"}</td>
                <td className="px-4 py-3"><span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{m.role}</span></td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{m.access_level}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[m.member_status] ?? "bg-muted text-muted-foreground")}>
                    {m.member_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(m)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Edit ${m.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setToDelete(m)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${m.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit team member" : "Add team member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email {!editing && <span className="text-destructive">*</span>}</Label>
                <Input type="email" value={form.email ?? ""} onChange={e => set({ email: e.target.value })} placeholder="jane@agency.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone ?? ""} onChange={e => set({ phone: e.target.value })} placeholder="+1 555-123-4567" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => set({ role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {withValue(ROLE_OPTIONS, form.role).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Access Level</Label>
                <Select value={form.access_level} onValueChange={v => set({ access_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {withValue(ACCESS_OPTIONS, form.access_level).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.member_status} onValueChange={v => set({ member_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {withValue(STATUS_OPTIONS, form.member_status).map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Save changes" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && <>This removes <span className="font-medium text-foreground">{toDelete.name}</span> from the team. This action cannot be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMember.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
