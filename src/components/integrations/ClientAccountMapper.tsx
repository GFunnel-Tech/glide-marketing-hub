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
  Building2, Facebook, Link2, Loader2, Plug, Plus, Sparkles, Unlink, X, ArrowRight, AlertTriangle, CheckCircle2,
  ExternalLink, Copy,
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

const normalizeAccountName = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .replace(/\b(investor marketing|mortgage|llc|inc|ltd|co|company|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const accountNamesMatch = (client: Client, candidates: Array<string | null | undefined>) => {
  const clientNames = [client.name, client.brand].map(normalizeAccountName).filter(Boolean);
  const candidateNames = candidates.map(normalizeAccountName).filter(Boolean);
  return clientNames.some((clientName) =>
    candidateNames.some((candidateName) =>
      clientName === candidateName || clientName.includes(candidateName) || candidateName.includes(clientName),
    ),
  );
};

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

  // Auto-suggest a client when picking a GHL/Meta row — but only if user hasn't
  // already picked a client, so manual override always wins.
  useEffect(() => {
    if (selectedClientId) return;
    const selectedGhl = selectedGhlId ? ghlLocs.find((x) => x.id === selectedGhlId) : null;
    const selectedMeta = selectedMetaId ? metaAccs.find((x) => x.id === selectedMetaId) : null;
    if (selectedGhl) {
      const linked = clients.find((c) => c.ghl_location_id === selectedGhl.location_id);
      if (linked) { setSelectedClientId(linked.id); return; }
    }
    if (selectedMeta?.client_id) { setSelectedClientId(selectedMeta.client_id); return; }
    const matchedByName = clients.find((client) => accountNamesMatch(client, [
      selectedGhl?.name, selectedGhl?.business_name,
      selectedMeta?.account_name, selectedMeta?.business_name,
    ]));
    if (matchedByName) setSelectedClientId(matchedByName.id);
    // eslint-disable-next-line
  }, [selectedGhlId, selectedMetaId, ghlLocs, metaAccs, clients]);

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

  // --- mutations ---
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
    const { data, error } = await (supabase as any).from("meta_ad_accounts")
      .update({ client_id: clientId }).eq("id", metaAccId).select("id");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.length) {
      toast.error("Change was blocked — you may not have permission to edit this ad account.");
      return;
    }
    toast.success(clientId ? "Ad account linked" : "Ad account unlinked");
    await load();
    invalidateDashboard();
  };

  const linkGhlToClient = async (clientId: number, locationId: string | null) => {
    setBusy(true);
    const { data, error } = await (supabase as any).from("clients")
      .update({ ghl_location_id: locationId }).eq("id", clientId).select("id");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.length) {
      toast.error("Change was blocked — you may not have permission to edit this client.");
      return;
    }
    toast.success(locationId ? "Sub-account linked" : "Sub-account unlinked");
    await load();
    invalidateDashboard();
  };


  const createClientFromSelection = async () => {
    const ghlName = selectedGhl ? (selectedGhl.name || selectedGhl.business_name || "").trim() : "";
    const metaName = selectedMeta ? (selectedMeta.account_name || selectedMeta.business_name || "").trim() : "";
    const name = ghlName || metaName;
    if (!name) { toast.error("Pick a sub-account or ad account first"); return; }
    const newId = await createClient(name);
    if (!newId) return;
    if (selectedGhl) await linkGhlToClient(newId, selectedGhl.location_id);
    if (selectedMeta && selectedMeta.client_id == null) await linkMetaToClient(selectedMeta.id, newId);
    // Clear the picker so the next account can be mapped right away
    setSelectedClientId(null);
    setSelectedGhlId(null);
    setSelectedMetaId(null);
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

  // --- action-bar logic ---
  // What changes would happen if user clicks "Link selected"?
  const planned = useMemo(() => {
    if (!selectedClient) return { steps: [] as Array<{ kind: "ghl_link" | "ghl_move" | "ghl_replace" | "meta_link" | "meta_move"; text: string }>, hasReplace: false };
    const steps: Array<{ kind: "ghl_link" | "ghl_move" | "ghl_replace" | "meta_link" | "meta_move"; text: string }> = [];
    let hasReplace = false;
    if (selectedGhl) {
      const currentClientForGhl = clientByGhlLoc.get(selectedGhl.location_id);
      const currentGhlForClient = selectedClient.ghl_location_id
        ? ghlByLocId.get(selectedClient.ghl_location_id) ?? { name: selectedClient.ghl_location_id } as any
        : null;
      if (currentClientForGhl?.id === selectedClient.id) {
        // already linked - skip
      } else if (currentClientForGhl && currentGhlForClient) {
        steps.push({ kind: "ghl_replace", text: `Replace ${selectedClient.name}'s GHL "${currentGhlForClient.name || selectedClient.ghl_location_id}" with "${selectedGhl.name || selectedGhl.location_id}" (moves it from ${currentClientForGhl.name})` });
        hasReplace = true;
      } else if (currentClientForGhl) {
        steps.push({ kind: "ghl_move", text: `Move GHL "${selectedGhl.name || selectedGhl.location_id}" from ${currentClientForGhl.name} → ${selectedClient.name}` });
        hasReplace = true;
      } else if (currentGhlForClient) {
        steps.push({ kind: "ghl_replace", text: `Replace ${selectedClient.name}'s GHL "${currentGhlForClient.name || selectedClient.ghl_location_id}" with "${selectedGhl.name || selectedGhl.location_id}"` });
        hasReplace = true;
      } else {
        steps.push({ kind: "ghl_link", text: `Link GHL "${selectedGhl.name || selectedGhl.location_id}" → ${selectedClient.name}` });
      }
    }
    if (selectedMeta) {
      if (selectedMeta.client_id === selectedClient.id) {
        // already linked
      } else if (selectedMeta.client_id != null) {
        const prev = clients.find((c) => c.id === selectedMeta.client_id);
        steps.push({ kind: "meta_move", text: `Move Meta "${selectedMeta.account_name || selectedMeta.act_id}" from ${prev?.name ?? "another client"} → ${selectedClient.name}` });
        hasReplace = true;
      } else {
        steps.push({ kind: "meta_link", text: `Link Meta "${selectedMeta.account_name || selectedMeta.act_id}" → ${selectedClient.name}` });
      }
    }
    return { steps, hasReplace };
  }, [selectedClient, selectedGhl, selectedMeta, clientByGhlLoc, ghlByLocId, clients]);

  const applySelection = async () => {
    if (!selectedClient) return;
    setBusy(true);
    try {
      // Handle GHL: if the target GHL is currently linked to a different client,
      // unlink that other client first to avoid a unique-conflict.
      if (selectedGhl) {
        const otherClient = clientByGhlLoc.get(selectedGhl.location_id);
        if (otherClient && otherClient.id !== selectedClient.id) {
          await (supabase as any).from("clients")
            .update({ ghl_location_id: null }).eq("id", otherClient.id);
        }
        if (selectedClient.ghl_location_id !== selectedGhl.location_id) {
          const { error } = await (supabase as any).from("clients")
            .update({ ghl_location_id: selectedGhl.location_id }).eq("id", selectedClient.id);
          if (error) throw error;
        }
      }
      if (selectedMeta && selectedMeta.client_id !== selectedClient.id) {
        const { error } = await (supabase as any).from("meta_ad_accounts")
          .update({ client_id: selectedClient.id }).eq("id", selectedMeta.id);
        if (error) throw error;
      }
      toast.success("Mapping saved");
      // Reset the picker so the next account can be linked immediately
      setSelectedClientId(null);
      setSelectedGhlId(null);
      setSelectedMetaId(null);
      await load();
      invalidateDashboard();

    } catch (e: any) {
      toast.error(e.message ?? "Failed to save mapping");
    } finally {
      setBusy(false);
    }
  };

  if (!wsId) return null;

  const agencySeed =
    agencyProfile?.friendly_business_name || agencyProfile?.legal_business_name || "";
  const hasAgencyAccount = clients.some((c) => c.is_agency_account);
  const ghlLinkedCount = clients.filter((c) => c.ghl_location_id).length;
  const metaLinkedCount = metaAccs.filter((a) => a.client_id).length;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Account Mapping
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Click rows to select. Use the bar below to link selections, or the unlink button on any mapped row.
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

      {/* Selection / action bar */}
      <SelectionBar
        ghl={selectedGhl}
        meta={selectedMeta}
        client={selectedClient}
        onClearGhl={() => setSelectedGhlId(null)}
        onClearMeta={() => setSelectedMetaId(null)}
        onClearClient={() => setSelectedClientId(null)}
        steps={planned.steps}
        hasReplace={planned.hasReplace}
        busy={busy}
        onApply={applySelection}
        canCreate={!selectedClient && (!!selectedGhl || !!selectedMeta)}
        onCreate={createClientFromSelection}
        creating={creating}
      />

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* GHL */}
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
            const conflict = !!(selectedClient && linkedClient && linkedClient.id !== selectedClient.id);
            return (
              <RowButton
                key={g.id}
                active={isActive}
                conflict={conflict && isActive}
                onClick={() => setSelectedGhlId(isActive ? null : g.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">{g.name || "Unnamed"}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate">{g.business_name || "—"}</span>
                    <LocationIdChip locationId={g.location_id} />
                  </div>
                </div>

                {linkedClient ? (
                  <Badge variant="outline" className="text-[9px] border-success/40 text-success shrink-0">
                    {linkedClient.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">Unmapped</Badge>
                )}
                {linkedClient && (
                  <UnlinkBtn
                    disabled={busy}
                    label={`Unlink GHL from ${linkedClient.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      linkGhlToClient(linkedClient.id, null);
                    }}
                  />
                )}
              </RowButton>
            );
          })}
        </Column>

        {/* Meta */}
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
            const conflict = !!(selectedClient && linkedClient && linkedClient.id !== selectedClient.id);
            return (
              <RowButton
                key={a.id}
                active={isActive}
                conflict={conflict && isActive}
                onClick={() => setSelectedMetaId(isActive ? null : a.id)}
              >
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
                {linkedClient && (
                  <UnlinkBtn
                    disabled={busy}
                    label={`Unlink Meta from ${linkedClient.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      linkMetaToClient(a.id, null);
                    }}
                  />
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
          {(() => {
            const ghlName = selectedGhl ? (selectedGhl.name || selectedGhl.business_name || "").trim() : "";
            const metaName = selectedMeta ? (selectedMeta.account_name || selectedMeta.business_name || "").trim() : "";
            const seedName = ghlName || metaName;
            const ghlNeedsClient = selectedGhl && !clientByGhlLoc.get(selectedGhl.location_id);
            const metaNeedsClient = selectedMeta && selectedMeta.client_id == null;
            const existingClient = clients.find((client) => accountNamesMatch(client, [ghlName, metaName]));
            const show = !selectedClient && !existingClient && (ghlNeedsClient || metaNeedsClient) && !!seedName;
            if (!show) return null;
            return (
              <li className="mb-1">
                <button
                  type="button"
                  disabled={busy || creating}
                  onClick={createClientFromSelection}
                  className="w-full flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 px-2 py-2 text-left transition-colors"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-primary truncate">
                      Create client "{seedName}"
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Autofilled from {ghlName ? "GHL sub-account" : "Meta ad account"} · auto-links selection
                    </div>
                  </div>
                </button>
              </li>
            );
          })()}
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
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {ghl ? `GHL: ${ghl.name || ghl.location_id}` : "GHL not synced"}
                    </span>
                    {c.ghl_location_id && <LocationIdChip locationId={c.ghl_location_id} />}
                    <span>·</span>
                    <span className="truncate">{metas.length ? `${metas.length} Meta` : "Meta not synced"}</span>
                  </div>

                </div>
                {isActive && selectedClient?.id === c.id && (
                  <label
                    className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 accent-primary"
                      checked={!!c.is_agency_account}
                      onChange={(e) => toggleAgency(e.target.checked)}
                      disabled={busy}
                    />
                    Agency
                  </label>
                )}
              </RowButton>
            );
          })}
        </Column>
      </div>
    </div>
  );
}

function SelectionBar({
  ghl, meta, client,
  onClearGhl, onClearMeta, onClearClient,
  steps, hasReplace, busy, onApply,
  canCreate, onCreate, creating,
}: {
  ghl: GhlLoc | null;
  meta: MetaAcc | null;
  client: Client | null;
  onClearGhl: () => void;
  onClearMeta: () => void;
  onClearClient: () => void;
  steps: Array<{ kind: string; text: string }>;
  hasReplace: boolean;
  busy: boolean;
  onApply: () => void;
  canCreate: boolean;
  onCreate: () => void;
  creating: boolean;
}) {
  const hasAny = ghl || meta || client;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectionChip
          icon={<Sparkles className="h-3 w-3" />}
          label="GHL"
          value={ghl ? (ghl.name || ghl.location_id) : null}
          onClear={onClearGhl}
        />
        <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
        <SelectionChip
          icon={<Facebook className="h-3 w-3" />}
          label="Meta"
          value={meta ? (meta.account_name || meta.act_id) : null}
          onClear={onClearMeta}
        />
        <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
        <SelectionChip
          icon={<Building2 className="h-3 w-3" />}
          label="Client"
          value={client?.name ?? null}
          onClear={onClearClient}
        />

        <div className="ml-auto flex items-center gap-2">
          {canCreate && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={creating} onClick={onCreate}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create + link
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={busy || !client || steps.length === 0}
            variant={hasReplace ? "destructive" : "default"}
            onClick={onApply}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            {!client ? "Pick a client" :
              steps.length === 0 ? (ghl || meta ? "Already linked" : "Select to link") :
              hasReplace ? "Replace mapping" : "Link selected"}
          </Button>
        </div>
      </div>

      {!hasAny && (
        <p className="text-[11px] text-muted-foreground">
          Tip: click a row in any column to select it. Click the unlink icon on a mapped row to remove its mapping in one click.
        </p>
      )}

      {steps.length > 0 && (
        <ul className="space-y-1">
          {steps.map((s, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-1.5 text-[11px] rounded px-2 py-1",
                s.kind.includes("replace") || s.kind.includes("move")
                  ? "bg-warning/10 text-warning-foreground border border-warning/30"
                  : "bg-success/5 text-foreground border border-success/20",
              )}
            >
              {s.kind.includes("replace") || s.kind.includes("move")
                ? <AlertTriangle className="h-3 w-3 mt-0.5 text-warning shrink-0" />
                : <CheckCircle2 className="h-3 w-3 mt-0.5 text-success shrink-0" />}
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}

      {hasAny && client && steps.length === 0 && (ghl || meta) && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-success" /> These selections are already linked.
        </p>
      )}
    </div>
  );
}

function SelectionChip({
  icon, label, value, onClear,
}: { icon: React.ReactNode; label: string; value: string | null; onClear: () => void }) {
  if (!value) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
        {icon}
        <span className="font-medium">{label}</span>
        <span className="opacity-70">— none</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] text-foreground max-w-[260px]">
      <span className="text-primary">{icon}</span>
      <span className="font-medium text-primary">{label}:</span>
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
        aria-label={`Clear ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
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
  active, conflict, onClick, children,
}: { active: boolean; conflict?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
          active
            ? conflict
              ? "border-warning bg-warning/10"
              : "border-primary bg-primary/10"
            : "border-transparent hover:border-border hover:bg-muted/60",
        )}
      >
        {children}
      </button>
    </li>
  );
}

function UnlinkBtn({
  label, onClick, disabled,
}: { label: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity disabled:opacity-50"
    >
      <Unlink className="h-3 w-3" />
    </button>
  );
}

/**
 * Shows a GHL sub-account Location ID next to the row subheading, with a
 * copy button and a direct link into the GHL sub-account dashboard.
 */
function LocationIdChip({ locationId }: { locationId: string }) {
  if (!locationId) return null;
  const url = `https://app.gohighlevel.com/v2/location/${locationId}/`;
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <code
        className="rounded bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground"
        title={locationId}
      >
        {locationId}
      </code>
      <button
        type="button"
        aria-label="Copy Location ID"
        title="Copy Location ID"
        className="rounded p-px text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(locationId);
          toast.success("Location ID copied");
        }}
      >
        <Copy className="h-2.5 w-2.5" />
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open sub-account in GoHighLevel"
        title="Open sub-account in GoHighLevel"
        className="rounded p-px text-muted-foreground hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </span>
  );
}
