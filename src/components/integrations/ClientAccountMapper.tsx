import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAgencyProfile } from "@/hooks/useAgencyProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { GhlLocationLink } from "@/components/integrations/GhlLocationLink";
import { toast } from "sonner";
import {
  Building2, Check, ChevronsUpDown, Link2, Loader2, Plus, Unlink, Facebook, Sparkles, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Client = {
  id: number;
  name: string;
  brand: string | null;
  ghl_location_id: string | null;
  clickup_list_id: string | null;
  is_agency_account: boolean | null;
};
type MetaAcc = {
  id: string;
  act_id: string;
  account_name: string | null;
  client_id: number | null;
  business_name: string | null;
};

/**
 * Client-centric integration mapper: pick or create a client account, then map
 * GHL sub-account, Meta ad accounts, ClickUp list, etc. to that one profile in
 * a single place. Complements the integration-centric IntegrationMapper.
 */
export function ClientAccountMapper() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const { data: agencyProfile } = useAgencyProfile();

  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [metaAccs, setMetaAccs] = useState<MetaAcc[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [clickupDraft, setClickupDraft] = useState("");
  const [addMetaId, setAddMetaId] = useState("");
  const [busy, setBusy] = useState(false);

  const invalidateDashboard = () => {
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["clients_with_meta_account"] });
  };

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [c, m] = await Promise.all([
      (supabase as any).from("clients")
        .select("id,name,brand,ghl_location_id,clickup_list_id,is_agency_account")
        .eq("workspace_id", wsId).order("name"),
      (supabase as any).from("meta_ad_accounts")
        .select("id,act_id,account_name,client_id,business_name")
        .eq("workspace_id", wsId).order("account_name"),
    ]);
    setClients(c.data || []);
    setMetaAccs(m.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [wsId]);

  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );

  // Keep the local ClickUp draft in sync when the selected client changes.
  useEffect(() => {
    setClickupDraft(selected?.clickup_list_id ?? "");
    setAddMetaId("");
  }, [selectedId, selected?.clickup_list_id]);

  const linkedMeta = useMemo(
    () => metaAccs.filter((a) => a.client_id === selectedId),
    [metaAccs, selectedId],
  );
  const unmappedMeta = useMemo(
    () => metaAccs.filter((a) => !a.client_id),
    [metaAccs],
  );

  const createClient = async (name: string, asAgency = false) => {
    if (!wsId) return;
    const clean = name.trim();
    if (!clean) { toast.error("Enter a name"); return; }
    setCreating(true);
    try {
      if (asAgency) {
        await (supabase as any).from("clients")
          .update({ is_agency_account: false })
          .eq("workspace_id", wsId).eq("is_agency_account", true);
      }
      const { data, error } = await (supabase as any).from("clients")
        .insert({ workspace_id: wsId, name: clean, brand: clean, is_agency_account: asAgency })
        .select("id").single();
      if (error) throw error;
      toast.success(`Account "${clean}" created`);
      setNewName("");
      await load();
      setSelectedId(data.id as number);
      invalidateDashboard();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  const linkMeta = async (metaAccId: string, clientId: number | null) => {
    setBusy(true);
    const { error } = await (supabase as any).from("meta_ad_accounts")
      .update({ client_id: clientId }).eq("id", metaAccId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(clientId ? "Ad account linked" : "Ad account unlinked");
    await load();
    invalidateDashboard();
  };

  const saveClickup = async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await (supabase as any).from("clients")
      .update({ clickup_list_id: clickupDraft.trim() || null }).eq("id", selected.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("ClickUp list saved");
    await load();
    invalidateDashboard();
  };

  const toggleAgency = async (value: boolean) => {
    if (!selected || !wsId) return;
    setBusy(true);
    try {
      if (value) {
        await (supabase as any).from("clients")
          .update({ is_agency_account: false })
          .eq("workspace_id", wsId).eq("is_agency_account", true).neq("id", selected.id);
      }
      const { error } = await (supabase as any).from("clients")
        .update({ is_agency_account: value }).eq("id", selected.id);
      if (error) throw error;
      toast.success(value ? "Marked as agency account" : "Agency flag removed");
      await load();
      invalidateDashboard();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  if (!wsId) return null;

  const agencySeed =
    agencyProfile?.friendly_business_name || agencyProfile?.legal_business_name || "";
  const hasAgencyAccount = clients.some((c) => c.is_agency_account);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> Account Mapping
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Pick or create a client account, then map its GHL sub-account, Meta ad accounts, and other integrations — all in one place.
        </p>
      </div>

      {/* Pick / create account */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Client account</label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-72 justify-between gap-2">
                <span className="truncate flex items-center gap-1.5">
                  {selected ? (
                    <>
                      {selected.is_agency_account && <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                      {selected.name}
                    </>
                  ) : "Select an account…"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <Command>
                <CommandInput placeholder="Search accounts…" className="h-9" />
                <CommandList>
                  <CommandEmpty>No accounts found.</CommandEmpty>
                  <CommandGroup>
                    {clients.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.brand ?? ""}`}
                        onSelect={() => { setSelectedId(c.id); setPickerOpen(false); }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", selectedId === c.id ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.is_agency_account && (
                          <Badge variant="outline" className="ml-1 text-[9px] border-primary/40 text-primary">Agency</Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Create new account</label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New client name…"
              className="h-9 w-56 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") createClient(newName); }}
            />
            <Button size="sm" className="h-9" disabled={creating || !newName.trim()} onClick={() => createClient(newName)}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
        </div>

        {!hasAgencyAccount && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={creating}
            title="Create the agency's own account, seeded from the agency profile name"
            onClick={() => createClient(agencySeed || "Agency Account", true)}
          >
            <Building2 className="h-3.5 w-3.5" /> Add agency account
          </Button>
        )}
      </div>

      {/* Mapping for the selected account */}
      {selected ? (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {selected.name}
                  {selected.is_agency_account && (
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Agency account</Badge>
                  )}
                </div>
                {selected.brand && selected.brand !== selected.name && (
                  <div className="text-xs text-muted-foreground">{selected.brand}</div>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={busy}
              onClick={() => toggleAgency(!selected.is_agency_account)}
            >
              <Building2 className="h-3.5 w-3.5" />
              {selected.is_agency_account ? "Unset agency account" : "Mark as agency account"}
            </Button>
          </div>

          {/* GHL */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> GoHighLevel sub-account
            </div>
            <p className="text-xs text-muted-foreground">
              Link this account to a GHL sub-account so appointments and pipeline data flow in.
            </p>
            <GhlLocationLink
              clientId={selected.id}
              currentLocationId={selected.ghl_location_id}
              variant="panel"
            />
          </div>

          {/* Meta */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Facebook className="h-4 w-4 text-primary" /> Meta ad accounts
            </div>
            {linkedMeta.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ad accounts linked yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {linkedMeta.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{a.account_name || a.act_id}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{a.act_id}{a.business_name ? ` · ${a.business_name}` : ""}</div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => linkMeta(a.id, null)}>
                      <Unlink className="h-3 w-3 mr-1" /> Unlink
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Select value={addMetaId} onValueChange={setAddMetaId}>
                <SelectTrigger className="h-8 w-72 text-xs">
                  <SelectValue placeholder={unmappedMeta.length ? "Add an ad account…" : "No unmapped ad accounts"} />
                </SelectTrigger>
                <SelectContent>
                  {unmappedMeta.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.account_name || a.act_id)}{a.business_name ? ` · ${a.business_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy || !addMetaId}
                onClick={() => { if (addMetaId) linkMeta(addMetaId, selected.id); }}
              >
                <Link2 className="h-3 w-3 mr-1" /> Link
              </Button>
            </div>
          </div>

          {/* ClickUp */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link2 className="h-4 w-4 text-primary" /> ClickUp list
            </div>
            <p className="text-xs text-muted-foreground">Per-account ClickUp list (overrides the workspace default).</p>
            <div className="flex gap-2">
              <Input
                value={clickupDraft}
                onChange={(e) => setClickupDraft(e.target.value)}
                placeholder="ClickUp List ID (optional)"
                className="h-8 w-72 text-xs"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={saveClickup}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          {loading ? "Loading accounts…" : "Select or create a client account above to map its integrations."}
        </div>
      )}
    </div>
  );
}
