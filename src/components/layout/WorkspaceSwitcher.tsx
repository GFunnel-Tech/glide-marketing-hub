import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, setCurrentWorkspace, refresh } = useWorkspace();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const createWorkspace = async () => {
    if (!user || !newName.trim()) return;
    setCreating(true);
    try {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .insert({ name: newName.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      const { error: memberErr } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
      if (memberErr) throw memberErr;
      toast.success("Workspace created");
      setNewName("");
      setDialogOpen(false);
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Could not create workspace");
    } finally {
      setCreating(false);
    }
  };

  if (!currentWorkspace) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-primary text-primary-foreground text-xs font-bold">
              {currentWorkspace.name.charAt(0).toUpperCase()}
            </div>
            <span className="max-w-[160px] truncate">{currentWorkspace.name}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} onClick={() => setCurrentWorkspace(ws)} className="cursor-pointer">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-primary text-primary-foreground text-[10px] font-bold mr-2">
                {ws.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate">{ws.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase mr-1">{ws.role}</span>
              {currentWorkspace.id === ws.id && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input id="ws-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Marketing" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={createWorkspace} disabled={creating || !newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
