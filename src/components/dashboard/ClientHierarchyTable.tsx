import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useCampaigns } from "@/hooks/useDatabase";
import { useMetaAds, type MetaAd } from "@/hooks/useMetaAds";
import {
  useArchivedSet, useArchiveEntities, useUnarchiveEntities,
} from "@/hooks/useArchivedEntities";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search, ChevronDown, ChevronRight, Check, RefreshCw, Loader2,
  ExternalLink, Building2, Layers, Image as ImageIcon, FolderKanban,
  Sparkles, DollarSign, Settings2, Pause as PauseIcon, AlertTriangle,
  Play, Trash2, X, ChevronsDownUp, ChevronsUpDown, Archive, ArchiveRestore,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "./StatusBadge";

// ---------- helpers ----------
function fmtMoney(n: number) { return `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function fmtInt(n: number) { return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"; }
function cplColor(v: number) {
  if (!v) return "text-muted-foreground";
  if (v < 30) return "text-success";
  if (v <= 60) return "text-warning";
  return "text-destructive";
}
function deriveImpressionsFromCpm(spend: number, cpm: number) {
  if (!cpm || cpm <= 0) return 0;
  return (spend / cpm) * 1000;
}

type StatusFilter = "All" | "Active" | "Paused" | "Issues";

export function ClientHierarchyTable() {
  const navigate = useNavigate();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: allCampaigns = [], isLoading: campLoading } = useCampaigns();
  const { data: allAds = [] } = useMetaAds();

  const [clientId, setClientId] = useState<number | "all">("all");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const [openCampaigns, setOpenCampaigns] = useState<Record<string, boolean>>({});
  const [openAdSets, setOpenAdSets] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"active" | "inactive" | "archived">("active");
  const showArchived = view === "archived";
  const hideZero = view === "active";

  // Archived items
  const archivedSet = useArchivedSet();
  const archiveMut = useArchiveEntities();
  const unarchiveMut = useUnarchiveEntities();
  const isArchived = (entity: "campaign" | "adset" | "ad", id: string) =>
    archivedSet.has(`${entity}:${id}`);

  // Bulk selection — keyed by `${entity}:${id}` -> {entity, id, clientId}
  type EntityType = "campaign" | "adset" | "ad" | "client";
  type SelKey = string;
  type SelVal = { entity: EntityType; id: string; clientId: string };
  const [selected, setSelected] = useState<Record<SelKey, SelVal>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const keyOf = (entity: EntityType, id: string) => `${entity}:${id}`;
  const isSelected = (entity: EntityType, id: string) => !!selected[keyOf(entity, id)];
  const toggleSel = (entity: EntityType, id: string, clientId: string) => {
    setSelected((s) => {
      const k = keyOf(entity, id);
      const next = { ...s };
      if (next[k]) delete next[k];
      else next[k] = { entity, id, clientId: String(clientId) };
      return next;
    });
  };
  const clearSel = () => setSelected({});
  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  const isAllClients = clientId === "all";
  const focusedClient = useMemo(
    () => (isAllClients ? null : clients.find((c) => c.id === clientId) ?? null),
    [clients, clientId, isAllClients]
  );

  // Auto-expand when a single client is selected
  const effectiveOpenClients = isAllClients
    ? openClients
    : (focusedClient ? { [String(focusedClient.id)]: true } : {});

  // Filter campaigns
  const campaigns = useMemo(() => {
    let list = allCampaigns as any[];
    if (!isAllClients) list = list.filter((c) => String(c.clientId) === String(clientId));
    if (statusFilter === "Active") list = list.filter((c) => c.status === "active");
    if (statusFilter === "Paused") list = list.filter((c) => c.status === "paused");
    if (statusFilter === "Issues") list = list.filter((c) => c.doubleCount || c.issuesStatus);
    if (!showArchived) list = list.filter((c) => !archivedSet.has(`campaign:${c.id}`));
    if (hideZero) list = list.filter((c) => {
      const impr = (c.impressions || 0) > 0 ? (c.impressions || 0) : deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0);
      return (c.spend || 0) > 0 && impr > 0;
    });
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(s) ||
        clients.find((cl) => String(cl.id) === String(c.clientId))?.name.toLowerCase().includes(s)
      );
    }
    return list;
  }, [allCampaigns, isAllClients, clientId, statusFilter, search, clients, showArchived, archivedSet, hideZero]);

  // Group campaigns by client
  const campaignsByClient = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of campaigns) {
      const k = String(c.clientId);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }, [campaigns]);

  // Group ads by campaign_id → adset_id (filter out archived ads + ads whose adset is archived)
  const adsByCampaign = useMemo(() => {
    const byCamp = new Map<string, MetaAd[]>();
    for (const ad of allAds) {
      if (!ad.campaign_id) continue;
      if (!showArchived) {
        if (archivedSet.has(`ad:${ad.id}`)) continue;
        if (ad.adset_id && archivedSet.has(`adset:${ad.adset_id}`)) continue;
      }
      if (hideZero && !(ad.impressions || 0) && !(ad.spend || 0) && !(ad.clicks || 0) && !(ad.leads || 0)) continue;
      if (!byCamp.has(ad.campaign_id)) byCamp.set(ad.campaign_id, []);
      byCamp.get(ad.campaign_id)!.push(ad);
    }
    return byCamp;
  }, [allAds, showArchived, archivedSet, hideZero]);

  // Compute which clients have ANY non-zero campaign activity (regardless of archive state)
  const clientsWithActivity = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCampaigns as any[]) {
      const impr = (c.impressions || 0) > 0 ? (c.impressions || 0) : deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0);
      if ((c.spend || 0) > 0 && impr > 0) s.add(String(c.clientId));
    }
    return s;
  }, [allCampaigns]);

  const visibleClients = useMemo(() => {
    const base = isAllClients ? clients : (focusedClient ? [focusedClient] : []);
    return base.filter((c) => {
      const archived = archivedSet.has(`client:${c.id}`);
      const hasActivity = clientsWithActivity.has(String(c.id));
      if (view === "archived") return archived;
      if (archived) return false;
      if (view === "inactive") return !hasActivity;
      // active
      return hasActivity;
    });
  }, [isAllClients, focusedClient, clients, archivedSet, clientsWithActivity, view]);

  const handleQuickSync = async () => {
    if (!focusedClient) {
      toast.error("Select a specific client to sync");
      return;
    }
    setSyncing(true);
    try {
      await api.syncMetaAds(String(focusedClient.id));
      toast.success(`Synced ${focusedClient.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const collapseAll = () => {
    setOpenClients({});
    setOpenCampaigns({});
    setOpenAdSets({});
  };

  const expandAll = () => {
    const nextClients: Record<string, boolean> = {};
    const nextCamps: Record<string, boolean> = {};
    const nextAdsets: Record<string, boolean> = {};
    for (const client of visibleClients) {
      nextClients[String(client.id)] = true;
    }
    for (const camp of campaigns) {
      nextCamps[camp.id] = true;
      const campAds = adsByCampaign.get(camp.id) ?? [];
      for (const ad of campAds) {
        const k = ad.adset_id ?? "_unassigned";
        nextAdsets[k] = true;
      }
    }
    setOpenClients(nextClients);
    setOpenCampaigns(nextCamps);
    setOpenAdSets(nextAdsets);
  };



  const handleToggleCampaign = async (camp: any, next: boolean) => {
    if (next === (camp.status === "active")) return;
    setPending((p) => ({ ...p, [camp.id]: true }));
    try {
      if (!next) {
        await api.pauseCampaigns(String(camp.clientId), [camp.id]);
        toast.success(`Paused "${camp.name}"`);
      } else {
        toast.info("Resume not yet wired — sync from Meta to refresh");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setPending((p) => ({ ...p, [camp.id]: false }));
    }
  };

  const runBulk = async (action: "pause" | "activate" | "delete") => {
    if (selectedCount === 0) return;
    setBulkRunning(true);
    try {
      // Group by entity + clientId (skip "client" entities — pause/activate/delete don't apply)
      const groups = new Map<string, { entity: "campaign" | "adset" | "ad"; clientId: string; ids: string[] }>();
      for (const s of selectedList) {
        if (s.entity === "client") continue;
        const k = `${s.entity}:${s.clientId}`;
        if (!groups.has(k)) groups.set(k, { entity: s.entity, clientId: s.clientId, ids: [] });
        groups.get(k)!.ids.push(s.id);
      }
      const results = await Promise.allSettled(
        Array.from(groups.values()).map((g) =>
          action === "pause" && g.entity === "campaign"
            ? api.pauseCampaigns(g.clientId, g.ids)
            : api.bulkAction(action, g.entity, g.clientId, g.ids),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const verb = action === "pause" ? "Paused" : action === "activate" ? "Activated" : "Deleted";
      if (failed === 0) toast.success(`${verb} ${selectedCount} item${selectedCount === 1 ? "" : "s"}`);
      else toast.error(`${verb} ${selectedCount - failed}/${selectedCount} — ${failed} failed`);
      clearSel();
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk action failed");
    } finally {
      setBulkRunning(false);
      setConfirmDelete(false);
    }
  };

  const runArchive = async (unarchive = false) => {
    if (selectedCount === 0) return;
    try {
      const items = selectedList.map((s) => ({ entity: s.entity, id: s.id }));
      if (unarchive) {
        await unarchiveMut.mutateAsync(items);
        toast.success(`Unarchived ${selectedCount} item${selectedCount === 1 ? "" : "s"}`);
      } else {
        await archiveMut.mutateAsync(items);
        toast.success(`Archived ${selectedCount} item${selectedCount === 1 ? "" : "s"}`);
      }
      clearSel();
    } catch (e: any) {
      toast.error(e?.message ?? "Archive failed");
    }
  };

  const showCompanyCol = isAllClients;

  const filters: StatusFilter[] = ["All", "Active", "Paused", "Issues"];
  const isLoading = clientsLoading || campLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">All Clients</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
            {visibleClients.length}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Client picker */}
          <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 min-w-[200px] justify-between gap-1.5 text-xs">
                <span className="truncate">{focusedClient ? `${focusedClient.name} · ${focusedClient.brand}` : "All Clients"}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search client..." className="text-xs" />
                <CommandList>
                  <CommandEmpty>No clients found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={() => { setClientId("all"); setClientPickerOpen(false); }} className="text-xs">
                      <Check className={cn("mr-2 h-3.5 w-3.5", isAllClients ? "opacity-100" : "opacity-0")} />
                      All Clients
                    </CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Clients">
                    {clients.map((c) => (
                      <CommandItem key={c.id} onSelect={() => { setClientId(c.id); setClientPickerOpen(false); }} className="text-xs">
                        <Check className={cn("mr-2 h-3.5 w-3.5", clientId === c.id ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground">{c.brand}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {focusedClient && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/client/${focusedClient.id}`)}>
              <ExternalLink className="h-3.5 w-3.5" /> Open Profile
            </Button>
          )}

          {/* Expand / Collapse all */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={collapseAll}>
              <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
            </Button>
          </div>

          {/* View tabs: Active / Inactive / Archived */}
          <div className="flex items-center gap-1 rounded-lg bg-accent p-0.5">
            {([
              { k: "active", label: "Active" },
              { k: "inactive", label: "Inactive" },
              { k: "archived", label: "Archived" },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  view === t.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >{t.label}</button>
            ))}
          </div>


          {/* Status filter pills */}
          <div className="flex items-center gap-1 rounded-lg bg-accent p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >{f}</button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-48 pl-8 text-xs" />
          </div>

          {/* Sync */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Actions <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleQuickSync} disabled={!focusedClient || syncing}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Sync Meta campaigns
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Sparkles className="mr-2 h-3.5 w-3.5" /> AI optimize (soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="w-8 px-2 py-2.5"></th>
                <th className="w-16 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                {showCompanyCol && (
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
                )}
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {showCompanyCol ? "Campaign / Ad set / Ad" : "Campaign / Ad set / Ad"}
                </th>
                <th className="w-28 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Impressions</th>
                <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Clicks</th>
                <th className="w-16 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CTR</th>
                <th className="w-24 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                <th className="w-16 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Leads</th>
                <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CPL</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={showCompanyCol ? 11 : 10} className="py-10 text-center text-muted-foreground text-sm">Loading…</td></tr>
              )}

              {!isLoading && visibleClients.length === 0 && (
                <tr><td colSpan={showCompanyCol ? 11 : 10} className="py-10 text-center text-muted-foreground text-sm">No clients match your filters.</td></tr>
              )}

              {!isLoading && visibleClients.map((client) => {
                const clientCampaigns = campaignsByClient.get(String(client.id)) ?? [];
                const isOpen = !!effectiveOpenClients[String(client.id)];

                // Company-level rollup
                const totSpend = clientCampaigns.reduce((s, c) => s + (c.spend || 0), 0);
                const totLeads = clientCampaigns.reduce((s, c) => s + (c.leads || 0), 0);
                const totImpr = clientCampaigns.reduce((s, c) => s + deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0), 0);
                const avgCpl = totLeads > 0 ? totSpend / totLeads : 0;

                return (
                  <>
                    {/* COMPANY row (only if All-Clients) */}
                    {showCompanyCol && (
                      <tr
                        key={`client-${client.id}`}
                        className="border-b border-border bg-primary/[0.03] hover:bg-primary/[0.06] cursor-pointer"
                        onClick={() =>
                          setOpenClients((s) => ({ ...s, [String(client.id)]: !s[String(client.id)] }))
                        }
                      >
                        <td className="px-2 py-2.5">
                          {clientCampaigns.length > 0 ? (
                            isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected("client", String(client.id))}
                            onCheckedChange={() => toggleSel("client", String(client.id), String(client.id))}
                            aria-label="Select client"
                          />
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge status={client.status as any} /></td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/client/${client.id}`); }}
                                className="font-semibold text-foreground hover:text-primary truncate"
                              >
                                {client.name}
                              </button>
                              <p className="text-[10px] text-muted-foreground truncate">{client.brand}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground">
                          {clientCampaigns.length} campaign{clientCampaigns.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtInt(totImpr)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtMoney(totSpend)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{totLeads}</td>
                        <td className={cn("px-2 py-2.5 text-right tabular-nums font-semibold", cplColor(avgCpl))}>
                          {avgCpl > 0 ? `$${avgCpl.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    )}

                    {/* Campaign rows */}
                    {isOpen && clientCampaigns.length === 0 && (
                      <tr className="border-b border-border">
                        <td colSpan={showCompanyCol ? 11 : 10} className="px-12 py-6 text-xs text-muted-foreground">
                          No campaigns for this client.
                          <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
                            onClick={() => { setClientId(client.id); setTimeout(handleQuickSync, 0); }}>
                            Sync from Meta?
                          </Button>
                        </td>
                      </tr>
                    )}

                    {isOpen && clientCampaigns.map((camp) => {
                      const campAds = adsByCampaign.get(camp.id) ?? [];
                      const campOpen = !!openCampaigns[camp.id];

                      // Group ads under this campaign by adset
                      const adsByAdset = new Map<string, MetaAd[]>();
                      for (const ad of campAds) {
                        const k = ad.adset_id ?? "_unassigned";
                        if (!adsByAdset.has(k)) adsByAdset.set(k, []);
                        adsByAdset.get(k)!.push(ad);
                      }

                      const campImpr = campAds.length > 0
                        ? campAds.reduce((s, a) => s + (a.impressions || 0), 0)
                        : deriveImpressionsFromCpm(camp.spend || 0, camp.cpm || 0);
                      const campClicks = campAds.reduce((s, a) => s + (a.clicks || 0), 0);
                      const campCtr = campImpr > 0 ? (campClicks / campImpr) * 100 : 0;

                      return (
                        <>
                          <tr key={`camp-${camp.id}`} className="border-b border-border hover:bg-accent/30">
                            <td className={cn("px-2 py-2", showCompanyCol && "pl-8")}>
                              <button
                                onClick={() => setOpenCampaigns((s) => ({ ...s, [camp.id]: !s[camp.id] }))}
                                className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent transition-colors"
                                aria-label={campOpen ? "Collapse campaign" : "Expand campaign"}
                              >
                                {campOpen
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            </td>
                            <td className="px-2 py-2">
                              <Checkbox
                                checked={isSelected("campaign", camp.id)}
                                onCheckedChange={() => toggleSel("campaign", camp.id, String(camp.clientId))}
                                aria-label="Select campaign"
                              />
                            </td>
                            <td className="px-2 py-2">
                              {pending[camp.id]
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                : <Switch checked={camp.status === "active"} onCheckedChange={(v) => handleToggleCampaign(camp, v)} className="scale-75 origin-left" />}
                            </td>
                            {showCompanyCol && <td className="px-2 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{client.name}</td>}
                            <td className="px-2 py-2">
                              <button
                                onClick={() => setOpenCampaigns((s) => ({ ...s, [camp.id]: !s[camp.id] }))}
                                className="flex items-center gap-2 text-left w-full"
                              >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-success/10 text-success">
                                  <FolderKanban className="h-3 w-3" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground hover:text-primary truncate max-w-[360px]">{camp.name}</p>
                                  {(camp.issuesStatus || camp.doubleCount) && (
                                    <p className="text-[10px] text-destructive flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      {camp.issuesStatus || "double-counting"}
                                    </p>
                                  )}
                                </div>
                              </button>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(campImpr)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-foreground">{campClicks || "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-foreground">{campCtr > 0 ? `${campCtr.toFixed(2)}%` : "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(camp.spend || 0)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-foreground">{camp.leads ?? 0}</td>
                            <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(camp.cpl || 0))}>
                              {camp.cpl > 0 ? `$${camp.cpl.toFixed(2)}` : "—"}
                            </td>
                          </tr>

                          {/* Ad sets */}
                          {campOpen && Array.from(adsByAdset.entries()).map(([adsetId, ads]) => {
                            const adsetName = ads[0]?.adset_name ?? "Unnamed ad set";
                            const asOpen = !!openAdSets[adsetId];
                            const spend = ads.reduce((s, a) => s + (a.spend || 0), 0);
                            const impr = ads.reduce((s, a) => s + (a.impressions || 0), 0);
                            const clicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
                            const leads = ads.reduce((s, a) => s + (a.leads || 0), 0);
                            const ctr = impr > 0 ? (clicks / impr) * 100 : 0;
                            const cpl = leads > 0 ? spend / leads : 0;

                            return (
                              <>
                                <tr key={`as-${adsetId}`} className="border-b border-border bg-muted/20 hover:bg-muted/30">
                                  <td className={cn("px-2 py-2", showCompanyCol ? "pl-14" : "pl-8")}>
                                    <button
                                      onClick={() => setOpenAdSets((s) => ({ ...s, [adsetId]: !s[adsetId] }))}
                                      className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent transition-colors"
                                      aria-label={asOpen ? "Collapse ad set" : "Expand ad set"}
                                    >
                                      {asOpen
                                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                    </button>
                                  </td>
                                  <td className="px-2 py-2">
                                    <Checkbox
                                      checked={isSelected("adset", adsetId)}
                                      onCheckedChange={() => toggleSel("adset", adsetId, String(camp.clientId))}
                                      aria-label="Select ad set"
                                    />
                                  </td>
                                  <td className="px-2 py-2"></td>
                                  {showCompanyCol && <td className="px-2 py-2"></td>}
                                  <td className="px-2 py-2">
                                    <button
                                      onClick={() => setOpenAdSets((s) => ({ ...s, [adsetId]: !s[adsetId] }))}
                                      className="flex items-center gap-2 text-left w-full"
                                    >
                                      <div className="flex h-6 w-6 items-center justify-center rounded bg-warning/10 text-warning">
                                        <Layers className="h-3 w-3" />
                                      </div>
                                      <p className="text-sm text-foreground hover:text-primary truncate max-w-[340px]">{adsetName}</p>
                                      <span className="text-[10px] text-muted-foreground">· {ads.length} ad{ads.length === 1 ? "" : "s"}</span>
                                    </button>
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(impr)}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{clicks || "—"}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{ctr > 0 ? `${ctr.toFixed(2)}%` : "—"}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(spend)}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{leads}</td>
                                  <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(cpl))}>
                                    {cpl > 0 ? `$${cpl.toFixed(2)}` : "—"}
                                  </td>
                                </tr>

                                {/* Ads */}
                                {asOpen && ads.map((ad) => {
                                  const adCtr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
                                  return (
                                    <tr key={`ad-${ad.id}`} className="border-b border-border/50 hover:bg-accent/20">
                                      <td className={cn("px-2 py-2", showCompanyCol ? "pl-20" : "pl-14")}></td>
                                      <td className="px-2 py-2">
                                        <Checkbox
                                          checked={isSelected("ad", ad.id)}
                                          onCheckedChange={() => toggleSel("ad", ad.id, String(camp.clientId))}
                                          aria-label="Select ad"
                                        />
                                      </td>
                                      <td className="px-2 py-2"></td>
                                      {showCompanyCol && <td className="px-2 py-2"></td>}
                                      <td className="px-2 py-2">
                                        <div className="flex items-center gap-2">
                                          {ad.thumbnail_url ? (
                                            <img src={ad.thumbnail_url} alt="" className="h-6 w-6 rounded object-cover" />
                                          ) : (
                                            <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-muted-foreground">
                                              <ImageIcon className="h-3 w-3" />
                                            </div>
                                          )}
                                          <p className="text-xs text-foreground truncate max-w-[320px]">{ad.name ?? "Untitled"}</p>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(ad.impressions)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{ad.clicks || "—"}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{adCtr > 0 ? `${adCtr.toFixed(2)}%` : "—"}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(ad.spend)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{ad.leads}</td>
                                      <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(ad.cpl))}>
                                        {ad.cpl > 0 ? `$${ad.cpl.toFixed(2)}` : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </>
                            );
                          })}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating bulk action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
            <span className="text-xs font-semibold text-foreground">
              {selectedCount} selected
            </span>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
              disabled={bulkRunning} onClick={() => runBulk("activate")}>
              {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Activate
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
              disabled={bulkRunning} onClick={() => runBulk("pause")}>
              {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseIcon className="h-3.5 w-3.5" />}
              Pause
            </Button>
            {showArchived ? (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                disabled={unarchiveMut.isPending} onClick={() => runArchive(true)}>
                {unarchiveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                Unarchive
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                disabled={archiveMut.isPending} onClick={() => runArchive(false)}>
                {archiveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Archive
              </Button>
            )}
            <Button size="sm" variant="outline"
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
              disabled={bulkRunning} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"
              onClick={clearSel} disabled={bulkRunning}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} item{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected campaigns, ad sets, and ads from Meta. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); runBulk("delete"); }}
              disabled={bulkRunning}
            >
              {bulkRunning ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
