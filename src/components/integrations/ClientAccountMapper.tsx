import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAgencyProfile } from "@/hooks/useAgencyProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, Facebook, Link2, Loader2, Plug, Plus, Sparkles, Unlink, Check,
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
type GhlLoc = {
  id: string;
  location_id: string;
  name: string | null;
  business_name: string | null;
};
type MetaAcc = {
  id: string;
  act_id: string;
  account_name: string | null;
  client_id: number | null;
  business_name: string | null;
};

/**
 * Three-column mapper: pick a GHL sub-account, a Meta ad account, and a client
 * side-by-side, then cross-link them with one click.
 */
export function ClientAccountMapper() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const { data: agencyProfile } = useAgencyProfile();

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [ghlLocs, setGhlLocs] = useState<GhlLoc[]>([]);
  const [metaAccs, setMetaAccs] = useState<MetaAcc[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedGhlId, setSelectedGhlId] = useState<string | null>(null);
  const [selectedMetaId, setSelectedMetaId] = useState<string | null>(null);

  const [ghlSearch, setGhlSearch] = useState("");
  const [metaSearch, setMetaSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const [newName, setNewName] = useState("");

  const invalidateDashboard = () => {
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["clients_with_meta_account"] });
  };

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [c, g, m] = await Promise.all([
      (supabase as any).from("clients")
        .select("id,name,brand,ghl_location_id,clickup_list_id,is_agency_account")
        .eq("workspace_id", wsId).order("name"),
      (supabase as any).from("ghl_locations")
        .select("id,location_id,name,business_name")
        .eq("workspace_id", wsId).order("name"),
      (supabase as any).from("meta_ad_accounts")
        .select("id,act_id,account_name,client_id,business_name")
        .eq("workspace_id", wsId).order("account_name"),
    ]);
    setClients(c.data || []);
    setGhlLocs(g.data || []);
    setMetaAccs(m.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [wsId]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const selectedGhl = useMemo(
    () => ghlLocs.find((g) => g.id === selectedGhlId) ?? null,
    [ghlLocs, selectedGhlId],
  );
  const selectedMeta = useMemo(
    () => metaAccs.find((m) => m.id === selectedMetaId) ?? null,
    [metaAccs, selectedMetaId],
  );

  const ghlByLocId = useMemo(() => {
    const m = new Map<string, GhlLoc>();
    ghlLocs.forEach((g) => m.set(g.location_id, g));
    return m;
  }, [ghlLocs]);

  const clientByGhlLoc = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach((c) => { if (c.ghl_location_id) m.set(c.ghl_location_id, c); });
    return m;
  }, [clients]);

  const metasByClientId = useMemo(() => {
    const m = new Map<number, MetaAcc[]>();
    metaAccs.forEach((a) => {
      if (a.client_id == null) return;
      const arr = m.get(a.client_id) ?? [];
      arr.push(a);
      m.set(a.client_id, arr);
    });
    return m;
  }, [metaAccs]);

  const ghlFiltered = useMemo(() => {
    const q = ghlSearch.trim().toLowerCase();
    if (!q) return ghlLocs;
    return ghlLocs.filter((g) =>
      (g.name || "").toLowerCase().includes(q) ||
      (g.business_name || "").toLowerCase().includes(q) ||
      g.location_id.toLowerCase().includes(q),
    );
  }, [ghlLocs, ghlSearch]);

  const metaFiltered = useMemo(() => {
    const q = metaSearch.trim().toLowerCase();
    if (!q) return metaAccs;
    return metaAccs.filter((a) =>
      (a.account_name || "").toLowerCase().includes(q) ||
      (a.business_name || "").toLowerCase().includes(q) ||
      a.act_id.toLowerCase().includes(q),
    );
  }, [metaAccs, metaSearch]);

  const clientFiltered = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.brand || "").toLowerCase().includes(q),
    );
  }, [clients, clientSearch]);

  // --- actions ---
  const createClient = async (name: string, asAgency = false): Promise<number | null> => {
    if (!wsId) return null;
    const clean = name.trim();
    if (!clean) { toast.error("Enter a name"); return null; }
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
      setSelectedClientId(data.id as number);
      invalidateDashboard();
      return data.id as number;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create account");
      return null;
    } finally {
      setCreating(false);
    }
  };

  const linkMetaToClient = async (metaAccId: string, clientId: number | null) => {
    setBusy(true);
    const { error } = await (supabase as any).from("meta_ad_accounts")
      .update({ client_id: clientId }).eq("id", metaAccId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(clientId ? "Ad account linked" : "Ad account unlinked");
    await load();
    invalidateDashboard();
  };

  const linkGhlToClient = async (clientId: number, locationId: string | null) => {
    setBusy(true);
    const { error } = await (supabase as any).from("clients")
      .update({ ghl_location_id: locationId }).eq("id", clientId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(locationId ? "Sub-account linked" : "Sub-account unlinked");
    await load();
    invalidateDashboard();
  };

  const linkSelectedGhl = async () => {
    if (!selectedClient || !selectedGhl) return;
    await linkGhlToClient(selectedClient.id, selectedGhl.location_id);
  };
  const linkSelectedMeta = async () => {
    if (!selectedClient || !selectedMeta) return;
    await linkMetaToClient(selectedMeta.id, selectedClient.id);
  };

  const createClientFromGhl = async () => {
    if (!selectedGhl) return;
    const name = (selectedGhl.name || selectedGhl.business_name || "").trim();
    if (!name) { toast.error("Sub-account has no name"); return; }
    const newId = await createClient(name);
    if (newId) {
      await linkGhlToClient(newId, selectedGhl.location_id);
      if (selectedMeta && selectedMeta.client_id == null) {
        await linkMetaToClient(selectedMeta.id, newId);
      }
    }
  };

  const toggleAgency = async (value: boolean) => {
    if (!selectedClient || !wsId) return;
    setBusy(true);
    try {
      if (value) {
        await (supabase as any).from("clients")
          .update({ is_agency_account: false })
          .eq("workspace_id", wsId).eq("is_agency_account", true).neq("id", selectedClient.id);
      }
      const { error } = await (supabase as any).from("clients")
        .update({ is_agency_account: value }).eq("id", selectedClient.id);
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

  // Counts
  const ghlLinkedCount = clients.filter((c) => c.ghl_location_id).length;
  const metaLinkedCount = metaAccs.filter((a) => a.client_id).length;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Account Mapping
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pick a GHL sub-account, a Meta ad account, and a client — then link them with one click.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">New client</label>
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Client name…"
                className="h-8 w-48 text-xs"
                onKeyDown={(e) => { if (e.key === "Enter") createClient(newName); }}
              />
              <Button size="sm" className="h-8" disabled={creating || !newName.trim()} onClick={() => createClient(newName)}>
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          {!hasAgencyAccount && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={creating}
              onClick={() => createClient(agencySeed || "Agency Account", true)}
            >
              <Building2 className="h-3 w-3" /> Agency account
            </Button>
          )}
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* GHL sub-accounts */}
        <Column
          title="GHL sub-accounts"
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          subtitle={`${ghlLocs.length} cached · ${ghlLinkedCount} linked`}
          search={ghlSearch}
          onSearch={setGhlSearch}
          empty={loading ? "Loading…" : "No sub-accounts cached. Sync from the GHL panel above."}
        >
          {ghlFiltered.map((g) => {
            const linkedClient = clientByGhlLoc.get(g.location_id);
            const isActive = selectedGhlId === g.id;
            return (
              <RowButton key={g.id} active={isActive} onClick={() => setSelectedGhlId(isActive ? null : g.id)}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">{g.name || "Unnamed"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {g.business_name || g.location_id}
                  </div>
                </div>
                {linkedClient ? (
                  <Badge variant="outline" className="text-[9px] border-success/40 text-success shrink-0">
                    {linkedClient.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">Unmapped</Badge>
                )}
              </RowButton>
            );
          })}
        </Column>

        {/* Meta ad accounts */}
        <Column
          title="Meta ad accounts"
          icon={<Facebook className="h-3.5 w-3.5 text-primary" />}
          subtitle={`${metaAccs.length} total · ${metaLinkedCount} linked`}
          search={metaSearch}
          onSearch={setMetaSearch}
          empty={loading ? "Loading…" : "No Meta ad accounts found."}
        >
          {metaFiltered.map((a) => {
            const linkedClient = a.client_id != null ? clients.find((c) => c.id === a.client_id) : null;
            const isActive = selectedMetaId === a.id;
            return (
              <RowButton key={a.id} active={isActive} onClick={() => setSelectedMetaId(isActive ? null : a.id)}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">
                    {a.account_name || a.act_id}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {a.act_id}{a.business_name ? ` · ${a.business_name}` : ""}
                  </div>
                </div>
                {linkedClient ? (
                  <Badge variant="outline" className="text-[9px] border-success/40 text-success shrink-0">
                    {linkedClient.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">Unmapped</Badge>
                )}
              </RowButton>
            );
          })}
        </Column>

        {/* Clients */}
        <Column
          title="Clients"
          icon={<Building2 className="h-3.5 w-3.5 text-primary" />}
          subtitle={`${clients.length} total`}
          search={clientSearch}
          onSearch={setClientSearch}
          empty={loading ? "Loading…" : "No clients yet — create one above."}
        >
          {clientFiltered.map((c) => {
            const isActive = selectedClientId === c.id;
            const ghl = c.ghl_location_id ? ghlByLocId.get(c.ghl_location_id) : null;
            const metas = metasByClientId.get(c.id) ?? [];
            return (
              <RowButton key={c.id} active={isActive} onClick={() => setSelectedClientId(isActive ? null : c.id)}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate flex items-center gap-1">
                    {c.is_agency_account && <Building2 className="h-3 w-3 text-primary shrink-0" />}
                    {c.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {ghl ? `GHL: ${ghl.name || ghl.location_id}` : "No GHL"}
                    {" · "}
                    {metas.length ? `${metas.length} Meta` : "No Meta"}
                  </div>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </RowButton>
            );
          })}
        </Column>
      </div>

      {/* Action bar */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Slot label="Client" value={selectedClient?.name} onClear={() => setSelectedClientId(null)} />
          <Slot label="GHL" value={selectedGhl ? (selectedGhl.name || selectedGhl.location_id) : null} onClear={() => setSelectedGhlId(null)} />
          <Slot label="Meta" value={selectedMeta ? (selectedMeta.account_name || selectedMeta.act_id) : null} onClear={() => setSelectedMetaId(null)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={busy || !selectedClient || !selectedGhl}
            onClick={linkSelectedGhl}
          >
            <Link2 className="h-3 w-3 mr-1" />
            Link GHL → Client
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={busy || !selectedClient || !selectedMeta}
            onClick={linkSelectedMeta}
          >
            <Link2 className="h-3 w-3 mr-1" />
            Link Meta → Client
          </Button>
          {selectedGhl && !clientByGhlLoc.get(selectedGhl.location_id) && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              disabled={busy || creating}
              onClick={createClientFromGhl}
            >
              {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
              Create client "{(selectedGhl.name || selectedGhl.business_name || "").trim() || "Unnamed"}"
            </Button>
          )}
          {selectedClient?.ghl_location_id && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => linkGhlToClient(selectedClient.id, null)}
            >
              <Unlink className="h-3 w-3 mr-1" /> Unlink GHL from {selectedClient.name}
            </Button>
          )}
          {selectedMeta?.client_id != null && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => linkMetaToClient(selectedMeta.id, null)}
            >
              <Unlink className="h-3 w-3 mr-1" /> Unlink this ad account
            </Button>
          )}
          {selectedClient && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs ml-auto"
              disabled={busy}
              onClick={() => toggleAgency(!selectedClient.is_agency_account)}
            >
              <Building2 className="h-3 w-3 mr-1" />
              {selectedClient.is_agency_account ? "Unset agency" : "Mark as agency"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({
  title, icon, subtitle, search, onSearch, empty, children,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  search: string;
  onSearch: (v: string) => void;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? (children as any[]).length > 0 : !!children;
  return (
    <div className="rounded-lg border border-border bg-background flex flex-col min-h-[360px]">
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {icon} {title}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="h-7 mt-2 text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px] p-1.5">
        {hasItems ? (
          <ul className="space-y-1">{children}</ul>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center py-8 px-3">{empty}</p>
        )}
      </div>
    </div>
  );
}

function RowButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
          active
            ? "border-primary bg-primary/10"
            : "border-transparent hover:border-border hover:bg-muted/60",
        )}
      >
        {children}
      </button>
    </li>
  );
}

function Slot({ label, value, onClear }: { label: string; value?: string | null; onClear: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}:</span>
      {value ? (
        <Badge variant="outline" className="text-xs gap-1 pr-1">
          <span className="truncate max-w-[180px]">{value}</span>
          <button onClick={onClear} className="opacity-60 hover:opacity-100" aria-label={`Clear ${label}`}>
            <Unlink className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground italic">none selected</span>
      )}
    </div>
  );
}
