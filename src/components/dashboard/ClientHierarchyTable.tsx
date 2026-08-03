import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useCampaigns, useClientsWithMetaAccount } from "@/hooks/useDatabase";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { EMPTY_CAMPAIGNS_RANGE_METRICS, useCampaignsRangeMetrics } from "@/hooks/useCampaignsRangeMetrics";
import { useMetaAds, type MetaAd } from "@/hooks/useMetaAds";
import {
  useArchivedSet, useArchiveEntities, useUnarchiveEntities,
} from "@/hooks/useArchivedEntities";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useClientPath } from "@/lib/clientPath";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/common/DateRangePicker";
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
  Trophy, TrendingDown, Hourglass, BarChart3,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "./StatusBadge";
import { ClientStatusPicker } from "./ClientStatusPicker";
import { NoteBubble } from "@/components/notes/NoteBubble";
import { GhlLocationLink } from "@/components/integrations/GhlLocationLink";
import { ColumnPicker, BuiltinColumnOption } from "@/components/common/ColumnPicker";
import { useTableView, evalFormula, formatColumnValue } from "@/hooks/useTableColumns";
import { useCampaignLeadBreakdown } from "@/hooks/useCampaignLeadBreakdown";
import { useCustomKpis, useLatestKpiEvaluations } from "@/hooks/useCustomKpis";
import { useChurnRisks } from "@/hooks/useChurnRisk";
import { ChurnRiskBadge } from "./ChurnRiskBadge";
import { EntityChartsDrawer, type EntityLevel } from "./EntityChartsDrawer";

const TABLE_KEY = "client_hierarchy";

const HIERARCHY_BUILTINS: BuiltinColumnOption[] = [
  { id: "impressions", label: "Impressions", token: "impressions" },
  { id: "clicks", label: "Clicks", token: "clicks" },
  { id: "ctr", label: "CTR", token: "ctr" },
  { id: "spend", label: "Spend", token: "spend" },
  { id: "leads", label: "Leads", token: "leads" },
  { id: "cpl", label: "CPL", token: "cpl" },
  { id: "cpm", label: "CPM", token: "cpm" },
  { id: "freq", label: "Frequency", token: "frequency" },
  { id: "above640", label: "Above 640 %", token: "above640" },
];
const HIERARCHY_ALWAYS = ["status", "name"];
const FORMULA_TOKENS = HIERARCHY_BUILTINS.map((b) => b.token!).filter(Boolean);

function above640Color(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 60) return "text-success font-semibold";
  if (pct >= 30) return "text-warning font-semibold";
  return "text-destructive font-semibold";
}

// ---------- helpers ----------
// Money formatter. When the row's account currency is known (and not MIXED),
// render the correct symbol (e.g. CA$ for CAD) so a Canadian client never shows
// a misleading "$". Falls back to plain "$" when currency is unknown/mixed.
function fmtMoney(n: number, currency?: string | null, minDecimals?: number) {
  const code = currency && currency !== "MIXED" ? currency : null;
  if (code) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: 2,
    }).format(n || 0);
  }
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: minDecimals, maximumFractionDigits: 2 })}`;
}
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

// ---------- Level identifier badge (Client / Campaign / Ad set / Ad) ----------
type LevelKind = "client" | "campaign" | "adset" | "ad";
const LEVEL_STYLES: Record<LevelKind, { label: string; classes: string }> = {
  client:   { label: "CLIENT", classes: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20" },
  campaign: { label: "CAMP",   classes: "bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20" },
  adset:    { label: "ADSET",  classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20" },
  ad:       { label: "AD",     classes: "bg-pink-500/10 text-pink-600 dark:text-pink-300 ring-pink-500/20" },
};
function LevelBadge({ level }: { level: LevelKind }) {
  const s = LEVEL_STYLES[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 shrink-0",
        s.classes,
      )}
    >
      {s.label}
    </span>
  );
}

// ---------- Ad performance rating within an ad set ----------
type AdRating = "best" | "ok" | "worst" | "learning";
function rateAdsInAdset(ads: MetaAd[]): Map<string, AdRating> {
  const out = new Map<string, AdRating>();
  // Mark "learning" when not enough signal
  const mature = ads.filter((a) => (a.spend ?? 0) >= 50 && (a.leads ?? 0) >= 3 && (a.cpl ?? 0) > 0);
  for (const a of ads) {
    const isMature = (a.spend ?? 0) >= 50 && (a.leads ?? 0) >= 3 && (a.cpl ?? 0) > 0;
    if (!isMature) { out.set(a.id, "learning"); continue; }
    out.set(a.id, "ok");
  }
  if (mature.length < 2) return out;
  const sorted = [...mature].sort((x, y) => (x.cpl ?? 0) - (y.cpl ?? 0));
  const min = sorted[0].cpl;
  const max = sorted[sorted.length - 1].cpl;
  // Best: within 10% of the lowest CPL
  for (const a of mature) {
    if (a.cpl <= min * 1.1) out.set(a.id, "best");
  }
  // Worst: >= 1.5x the lowest AND is the max (or within 5% of it)
  if (max >= min * 1.5) {
    for (const a of mature) {
      if (a.cpl >= max * 0.95 && a.cpl > min * 1.5) out.set(a.id, "worst");
    }
  }
  return out;
}

function AdRatingBadge({ rating }: { rating: AdRating }) {
  if (rating === "best") {
    return (
      <span title="Best CPL in this ad set" className="inline-flex h-5 items-center gap-1 rounded-full bg-success/10 px-1.5 text-[10px] font-semibold text-success">
        <Trophy className="h-3 w-3" /> Best
      </span>
    );
  }
  if (rating === "worst") {
    return (
      <span title="Worst CPL in this ad set — consider pausing" className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive/10 px-1.5 text-[10px] font-semibold text-destructive">
        <TrendingDown className="h-3 w-3" /> Worse
      </span>
    );
  }
  if (rating === "learning") {
    return (
      <span title="Not enough data yet (needs ≥ $50 spend & 3 leads)" className="inline-flex h-5 items-center gap-1 rounded-full bg-warning/10 px-1.5 text-[10px] font-semibold text-warning">
        <Hourglass className="h-3 w-3" /> Learning
      </span>
    );
  }
  return null;
}

type StatusFilter = "All" | "Active" | "Paused" | "Issues";

export function ClientHierarchyTable() {
  const navigate = useNavigate();
  const clientPath = useClientPath();
  const { isLoading: clientsLoading } = useClients();
  const clients = useVisibleClients();
  const { data: allCampaigns = [], isLoading: campLoading } = useCampaigns();
  const { data: allAds = [] } = useMetaAds();
  const { data: clientsWithMetaAcct = new Set<number>() } = useClientsWithMetaAccount();
  const { data: rangeMetrics = {}, isLoading: rangeLoading } = useClientsRangeMetrics();
  const { data: churnRisks = [] } = useChurnRisks();
  const churnByClient = useMemo(() => {
    const m = new Map<number, typeof churnRisks[number]>();
    for (const r of churnRisks) m.set(r.client_id, r);
    return m;
  }, [churnRisks]);
  const { data: campaignRangeMetrics = EMPTY_CAMPAIGNS_RANGE_METRICS, isLoading: campaignRangeLoading } = useCampaignsRangeMetrics();
  const { data: leadBreakdown = { byCampaign: {}, byAdset: {}, byAd: {} } } = useCampaignLeadBreakdown();
  const { view } = useTableView(TABLE_KEY);
  const { data: customKpis = [] } = useCustomKpis();
  const enabledKpiIds = useMemo(
    () => view.columns.filter((c: any) => c.kind === "custom_kpi").map((c: any) => c.kpi_id),
    [view]
  );
  const { data: kpiEvals = [] } = useLatestKpiEvaluations(enabledKpiIds);
  const kpiEvalMap = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>();
    for (const ev of kpiEvals) {
      if (!m.has(ev.custom_kpi_id)) m.set(ev.custom_kpi_id, new Map());
      m.get(ev.custom_kpi_id)!.set(String(ev.client_id ?? "_global"), ev.value);
    }
    return m;
  }, [kpiEvals]);

  const hidden = useMemo(
    () => new Set(view.columns.filter((c: any) => c.kind === "builtin" && c.hidden).map((c: any) => c.id)),
    [view]
  );
  const isVisible = (id: string) => !hidden.has(id);

  // Extra columns appended after built-ins
  const extraCols = useMemo(() => {
    const out: Array<
      | { kind: "kpi"; id: string; label: string; kpiId: string; unit: string; format?: any }
      | { kind: "formula"; id: string; label: string; expr: string; format: "number" | "currency" | "percent"; decimals?: number }
    > = [];
    for (const c of view.columns) {
      if (c.kind === "custom_kpi") {
        const kpi = customKpis.find((k) => k.id === (c as any).kpi_id);
        if (kpi) out.push({ kind: "kpi", id: c.id, label: kpi.name, kpiId: kpi.id, unit: kpi.unit, format: kpi.format });
      } else if (c.kind === "formula") {
        out.push({ kind: "formula", id: c.id, label: c.label, expr: c.expr, format: c.format, decimals: c.decimals });
      }
    }
    return out;
  }, [view, customKpis]);

  const density = view.density;
  const rowPad = density === "compact" ? "py-1" : "py-2";

  const [clientId, setClientId] = useState<number | "all">("all");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const [openCampaigns, setOpenCampaigns] = useState<Record<string, boolean>>({});
  const [openAdSets, setOpenAdSets] = useState<Record<string, boolean>>({});
  const [chartEntity, setChartEntity] = useState<{ level: EntityLevel; id: string; name: string } | null>(null);
  // Single unified view: hide manually-archived + non-fully-synced clients,
  // hide campaigns with no spend/impressions. The All/Active/Paused/Issues
  // filter is the only view toggle.
  const showArchived = false;
  const [hideZero, setHideZero] = useState(true);

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

  // Agency-owned clients are always shown with their full sub-tree, even when
  // the selected date range has no insights for them (e.g. sync hasn't caught
  // up yet). Without this the agency row collapses to "—" with no campaigns.
  const agencyClientIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients as any[]) if (c.isAgencyAccount) s.add(String(c.id));
    return s;
  }, [clients]);
  const campaignToClientId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCampaigns as any[]) m.set(String(c.id), String(c.clientId));
    return m;
  }, [allCampaigns]);
  const isAgencyCampaignId = (campaignId: string) => {
    const cid = campaignToClientId.get(String(campaignId));
    return cid ? agencyClientIds.has(cid) : false;
  };


  // Filter campaigns
  const campaigns = useMemo(() => {
    let list = (allCampaigns as any[]).map((campaign) => {
      const metric = campaignRangeMetrics.campaigns[campaign.id];
      if (!metric) {
        return {
          ...campaign,
          spend: 0,
          leads: 0,
          trueLeads: 0,
          cpl: 0,
          trueCpl: 0,
          cpm: 0,
          frequency: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
        };
      }
      return {
        ...campaign,
        spend: metric.spend,
        leads: metric.leads,
        trueLeads: metric.leads,
        cpl: metric.cpl,
        trueCpl: metric.cpl,
        cpm: metric.cpm,
        frequency: metric.frequency,
        impressions: metric.impressions,
        clicks: metric.clicks,
        ctr: metric.ctr,
      };
    });
    if (!isAllClients) list = list.filter((c) => String(c.clientId) === String(clientId));
    if (statusFilter === "Active") list = list.filter((c) => c.status === "active");
    if (statusFilter === "Paused") list = list.filter((c) => c.status === "paused");
    if (statusFilter === "Issues") list = list.filter((c) => c.doubleCount || c.issuesStatus);
    if (!showArchived) list = list.filter((c) => !archivedSet.has(`campaign:${c.id}`));
    if (hideZero) list = list.filter((c) => {
      // Always keep agency-owned campaigns so the agency row stays expandable.
      if (agencyClientIds.has(String(c.clientId))) return true;
      const impr = (c.impressions || 0) > 0 ? (c.impressions || 0) : deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0);
      return (c.spend || 0) > 0 && impr > 0;
    });

    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c) => {
        const cl = clients.find((cl) => String(cl.id) === String(c.clientId));
        return (
          c.name.toLowerCase().includes(s) ||
          (c.brand || "").toLowerCase().includes(s) ||
          (cl?.name || "").toLowerCase().includes(s) ||
          (cl?.brand || "").toLowerCase().includes(s)
        );
      });
    }
    return list;
  }, [allCampaigns, campaignRangeMetrics, isAllClients, clientId, statusFilter, search, clients, showArchived, archivedSet, hideZero, agencyClientIds]);

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
      const metric = campaignRangeMetrics.ads[ad.id];
      const rangedAd = {
        ...ad,
        spend: metric?.spend ?? 0,
        impressions: metric?.impressions ?? 0,
        clicks: metric?.clicks ?? 0,
        leads: metric?.leads ?? 0,
        ctr: metric?.ctr ?? 0,
        cpl: metric?.cpl ?? 0,
      };
      if (!showArchived) {
        if (archivedSet.has(`ad:${ad.id}`)) continue;
        if (ad.adset_id && archivedSet.has(`adset:${ad.adset_id}`)) continue;
      }
      // Match the campaign-level status filter so a filtered view never mixes
      // active and paused children under the same row.
      const adActive = (ad as any).effective_status === "ACTIVE";
      if (statusFilter === "Active" && !adActive) continue;
      if (statusFilter === "Paused" && adActive) continue;
      const keepForAgency = isAgencyCampaignId(ad.campaign_id);
      if (hideZero && !keepForAgency && !(rangedAd.impressions || 0) && !(rangedAd.spend || 0) && !(rangedAd.clicks || 0) && !(rangedAd.leads || 0)) continue;
      if (!byCamp.has(ad.campaign_id)) byCamp.set(ad.campaign_id, []);
      byCamp.get(ad.campaign_id)!.push(rangedAd);
    }
    return byCamp;
  }, [allAds, campaignRangeMetrics, showArchived, archivedSet, hideZero, campaignToClientId, agencyClientIds, statusFilter]);


  // Compute which clients have ANY non-zero campaign activity (regardless of archive state)
  const clientsWithActivity = useMemo(() => {
    const s = new Set<string>();
    for (const [cid, metric] of Object.entries(rangeMetrics as Record<string, any>)) {
      if ((metric?.spend || 0) > 0 && (metric?.impressions || 0) > 0) s.add(String(cid));
    }
    return s;
  }, [rangeMetrics]);

  // A client is considered "fully synced" when it is (1) linked to a GHL
  // sub-account and (2) has at least one Meta ad account mapped to it.
  // Clients that don't meet this bar are auto-archived from the main list.
  const isFullySynced = (c: any) =>
    !!c.ghlLocationId && clientsWithMetaAcct.has(Number(c.id));

  const visibleClients = useMemo(() => {
    const base = isAllClients ? clients : (focusedClient ? [focusedClient] : []);
    const q = search.trim().toLowerCase();
    const filtered = base.filter((c) => {
      const archived = archivedSet.has(`client:${c.id}`);
      if (archived) return false;
      if (q) {
        const hay = `${c.name ?? ""} ${c.brand ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Active / Paused / Issues are campaign-level filters: only clients that
      // still have at least one matching campaign belong in the list.
      if (statusFilter !== "All" && (campaignsByClient.get(String(c.id))?.length ?? 0) === 0) return false;
      if (c.isAgencyAccount) return true; // never hide the agency's own account
      const synced = isFullySynced(c);
      const hasActivity = clientsWithActivity.has(String(c.id));
      if (synced && hideZero && !hasActivity) return false;
      return true;
    });
    // Rank: the agency's own account is always pinned first, then active
    // (synced + activity), then synced-no-activity, then unconnected. Keeps the
    // KPI "Active Clients" rows above the long tail of clients awaiting setup.
    const rank = (c: any) => {
      if (c.isAgencyAccount) return -1;
      const synced = isFullySynced(c);
      const hasActivity = clientsWithActivity.has(String(c.id));
      if (synced && hasActivity) return 0;
      if (synced) return 1;
      return 2;
    };
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [isAllClients, focusedClient, clients, archivedSet, clientsWithActivity, clientsWithMetaAcct, hideZero, search, statusFilter, campaignsByClient]);

  const handleQuickSync = async () => {
    setSyncing(true);
    try {
      // Pass "all" when no client is focused so the edge function syncs every
      // account in the current workspace.
      await api.syncMetaAds(focusedClient ? String(focusedClient.id) : "all");
      toast.success(
        focusedClient
          ? `Synced ${focusedClient.name}`
          : "Meta sync started for all clients",
      );
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
  const isLoading = clientsLoading || campLoading || rangeLoading || campaignRangeLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">All Clients</h2>
          <span
            className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums"
            title="Clients in workflow — excludes archived clients and fully-synced clients with no campaign activity in range"
          >
            {visibleClients.length} in workflow
          </span>
          <NoteBubble variant="button" label="Notes" align="start" />
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
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate(clientPath(focusedClient.id))}>
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

          <DateRangePicker />







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

          {/* Show all / Hide empty toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setHideZero((v) => !v)}
            title={hideZero ? "Currently hiding clients with no spend/impressions in range" : "Showing all mapped clients, including those without data in range"}
          >
            {hideZero ? "Show all" : "Hide empty"}
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-48 pl-8 text-xs" />
          </div>
          {/* Column picker */}
          <ColumnPicker
            tableKey={TABLE_KEY}
            builtins={HIERARCHY_BUILTINS}
            alwaysIds={HIERARCHY_ALWAYS}
            formulaTokens={FORMULA_TOKENS}
          />


          {/* Sync */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Actions <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleQuickSync} disabled={syncing}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {focusedClient ? `Sync Meta · ${focusedClient.name}` : "Sync Meta · all clients"}
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
        <div className="overflow-auto max-h-[calc(100vh-10rem)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:bg-muted [&>th]:border-b [&>th]:border-border">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="w-8 px-2 py-2.5"></th>
                <th className="w-16 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="w-[280px] px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Company
                </th>
                {isVisible("impressions") && <th className="w-28 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Impressions</th>}
                {isVisible("clicks") && <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Clicks</th>}
                {isVisible("ctr") && <th className="w-16 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">CTR</th>}
                {isVisible("spend") && <th className="w-24 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Spend</th>}
                {isVisible("leads") && <th className="w-16 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Leads</th>}
                {isVisible("cpl") && <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">CPL</th>}
                {isVisible("cpm") && <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">CPM</th>}
                {isVisible("freq") && <th className="w-16 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Freq</th>}
                {isVisible("above640") && <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap" title="Percentage of leads in window self-reporting a credit score above 640">Above 640</th>}
                {extraCols.map((col) => (
                  <th key={col.id} className="w-24 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col.label}</th>
                ))}
                <th className="w-10 px-2 py-2.5 text-center">
                  <ColumnPicker
                    tableKey={TABLE_KEY}
                    builtins={HIERARCHY_BUILTINS}
                    alwaysIds={HIERARCHY_ALWAYS}
                    formulaTokens={FORMULA_TOKENS}
                    triggerMode="icon"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={99} className="py-10 text-center text-muted-foreground text-sm">Loading…</td></tr>
              )}

              {!isLoading && visibleClients.length === 0 && (
                <tr><td colSpan={99} className="py-10 text-center text-muted-foreground text-sm">No clients match your filters.</td></tr>
              )}

              {!isLoading && visibleClients.map((client) => {
                const clientCampaigns = campaignsByClient.get(String(client.id)) ?? [];
                const isOpen = !!effectiveOpenClients[String(client.id)];

                // Company-level rollup — sum ad-level clicks/impressions so
                // CTR is a true weighted average (sum clicks / sum impressions)
                // rather than an average of per-campaign rates.
                const campSpend = clientCampaigns.reduce((s, c) => s + (c.spend || 0), 0);
                const campLeads = clientCampaigns.reduce((s, c) => s + (c.leads || 0), 0);
                const allClientAds = clientCampaigns.flatMap((c) => adsByCampaign.get(c.id) ?? []);
                const campClicks = allClientAds.reduce((s, a) => s + (a.clicks || 0), 0);
                const campImprFromAds = allClientAds.reduce((s, a) => s + (a.impressions || 0), 0);
                const campImpr = campImprFromAds > 0
                  ? campImprFromAds
                  : clientCampaigns.reduce((s, c) => s + deriveImpressionsFromCpm(c.spend || 0, c.cpm || 0), 0);
                const rm = (rangeMetrics as any)[client.id];
                // Account currency for this client; sub-rows (campaigns/ads)
                // inherit it since they belong to the same account.
                const cur: string | undefined = rm?.currency;
                // Date-ranged metrics come exclusively from rangeMetrics
                // (sourced from meta_insights_granular_daily / _daily). The
                // static `campaigns.spend` snapshot is a lifetime/last-sync
                // total and would lie about the picker window — never display
                // it as the date-ranged number.
                // For the agency-owned client, `rangeMetrics` is often empty
                // because the agency's ad accounts may not be linked through
                // `meta_ad_accounts.client_id` in this workspace. Fall back to
                // summing the date-ranged campaign metrics so the company row
                // and its drilldown stay consistent.
                const isAgency = !!(client as any).isAgencyAccount;
                const totSpend = rm?.spend ?? (isAgency ? campSpend : 0);
                const totLeads = rm?.effectiveLeads ?? (isAgency ? campLeads : 0);
                const totClicks = rm?.clicks ?? (isAgency ? campClicks : 0);
                const totImpr = rm?.impressions ?? (isAgency ? campImpr : 0);
                const avgCtr = totImpr > 0 ? (totClicks / totImpr) * 100 : 0;
                const avgCpl = rm?.cpl ?? (totLeads > 0 ? totSpend / totLeads : 0);
                const cAvgCpm = rm?.cpm ?? (totImpr > 0 ? (totSpend / totImpr) * 1000 : 0);
                const cAvgFreq = rm?.frequency ?? 0;
                const cAbove640 = rm?.above640Pct ?? null;
                const cScored = rm?.scoredLeads ?? 0;


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
                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <ClientStatusPicker clientId={client.id} status={client.status as any} />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(clientPath(client.id)); }}
                                  className="font-semibold text-foreground hover:text-primary truncate"
                                >
                                  {client.brand || client.name}
                                </button>
                                {(client as any).isAgencyAccount && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                                    <Building2 className="h-2.5 w-2.5" /> Agency
                                  </span>
                                )}
                                {(() => {
                                  const risk = churnByClient.get(Number(client.id));
                                  if (!risk || risk.risk_level === "low") return null;
                                  return (
                                    <span onClick={(e) => e.stopPropagation()}>
                                      <ChurnRiskBadge level={risk.risk_level} score={risk.score} summary={risk.summary} compact />
                                    </span>
                                  );
                                })()}
                                <span onClick={(e) => e.stopPropagation()}>
                                  <NoteBubble clientId={client.id} variant="icon" align="start" />
                                </span>
                                {client.ghlLocationId && (
                                  <span onClick={(e) => e.stopPropagation()}>
                                    <GhlLocationLink clientId={client.id} currentLocationId={client.ghlLocationId} variant="chip" />
                                  </span>
                                )}
                                {(() => {
                                  const missingMeta = !clientsWithMetaAcct.has(Number(client.id));
                                  const missingGhl = !client.ghlLocationId;
                                  if (!missingMeta && !missingGhl) return null;
                                  const missing = [
                                    missingMeta && "Meta ad account",
                                    missingGhl && "GHL sub-account",
                                  ].filter(Boolean) as string[];
                                  return (
                                    <TooltipProvider delayDuration={150}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(clientPath(client.id, "?tab=integrations"));
                                            }}
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning/10 text-warning hover:bg-warning/20 cursor-pointer"
                                            aria-label="Open integrations — not fully synced"
                                          >
                                            <AlertTriangle className="h-3 w-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                          <div className="font-semibold mb-0.5">Not synced — click to fix</div>
                                          <ul className="space-y-0.5">
                                            {missing.map((m) => (
                                              <li key={m}>• {m} not linked</li>
                                            ))}
                                          </ul>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>

                                  );
                                })()}
                              </div>
                              {client.brand && client.name && (
                                <p className="text-[10px] text-muted-foreground truncate">{client.name}</p>
                              )}
                              {clientCampaigns.length > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  {clientCampaigns.length} campaign{clientCampaigns.length === 1 ? "" : "s"}
                                  {allClientAds.length > 0 && ` · ${allClientAds.length} ad${allClientAds.length === 1 ? "" : "s"}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        {isVisible("impressions") && <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtInt(totImpr)}</td>}
                        {isVisible("clicks") && <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{totClicks > 0 ? fmtInt(totClicks) : "—"}</td>}
                        {isVisible("ctr") && <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—"}</td>}
                        {isVisible("spend") && <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtMoney(totSpend, cur)}</td>}
                        {isVisible("leads") && (
                          <td className="px-2 py-2.5 text-right tabular-nums text-foreground">
                            {rm?.doubleCount ? (
                              <span
                                className="inline-flex items-center justify-end gap-1 cursor-help"
                                title={`Deduped count. Meta reported ${fmtInt(rm.reportedLeads)} (−${fmtInt(rm.reportedLeads - totLeads)} duplicate/over-reported). True CPL ${fmtMoney(rm.trueCpl, cur, 2)}.`}
                              >
                                {totLeads}
                                <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                              </span>
                            ) : (
                              totLeads
                            )}
                          </td>
                        )}
                        {isVisible("cpl") && (
                          <td className={cn("px-2 py-2.5 text-right tabular-nums font-semibold", cplColor(avgCpl))}>
                            {avgCpl > 0 ? fmtMoney(avgCpl, cur, 2) : "—"}
                          </td>
                        )}
                        {isVisible("cpm") && (
                          <td className="px-2 py-2.5 text-right tabular-nums text-foreground">
                            {cAvgCpm > 0 ? fmtMoney(cAvgCpm, cur, 2) : "—"}
                          </td>
                        )}
                        {isVisible("freq") && (
                          <td className={cn(
                            "px-2 py-2.5 text-right tabular-nums",
                            cAvgFreq >= 3.5 ? "text-destructive font-semibold" : "text-foreground"
                          )}>
                            {cAvgFreq > 0 ? cAvgFreq.toFixed(2) : "—"}
                          </td>
                        )}
                        {isVisible("above640") && (
                          <td
                            className={cn("px-2 py-2.5 text-right tabular-nums", above640Color(cAbove640))}
                            title={cAbove640 !== null ? `${cScored} scored lead${cScored === 1 ? "" : "s"} in range` : "No credit-score answers in range"}
                          >
                            {cAbove640 === null ? "—" : `${cAbove640.toFixed(0)}%`}
                          </td>
                        )}
                        {extraCols.map((col) => {
                          const scope: Record<string, number> = {
                            impressions: totImpr,
                            clicks: totClicks,
                            ctr: avgCtr,
                            spend: totSpend,
                            leads: totLeads,
                            cpl: avgCpl,
                            cpm: cAvgCpm,
                            frequency: cAvgFreq,
                            above640: cAbove640 ?? 0,
                          };
                          if (col.kind === "formula") {
                            const v = evalFormula(col.expr, scope);
                            return <td key={col.id} className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatColumnValue(v, col.format, col.decimals)}</td>;
                          }
                          // custom KPI: client-level value
                          const perClient = kpiEvalMap.get(col.kpiId);
                          const v = perClient?.get(String(client.id)) ?? perClient?.get("_global") ?? null;
                          const decimals = col.format?.decimals ?? 2;
                          const fmt = col.unit === "currency" ? "currency" : col.unit === "percent" ? "percent" : "number";
                          return <td key={col.id} className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatColumnValue(v == null ? null : Number(v), fmt as any, decimals)}</td>;
                        })}
                      </tr>

                    )}

                    {/* Campaign rows */}
                    {isOpen && clientCampaigns.length === 0 && (
                      <tr className="border-b border-border">
                        <td colSpan={99} className="px-12 py-6 text-xs text-muted-foreground">
                          No campaigns for this client.
                          <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
                            onClick={() => navigate(clientPath(client.id, "?tab=integrations"))}>
                            Open integrations →
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
                          <tr key={`camp-${camp.id}`} className="border-b border-border bg-muted/10 hover:bg-muted/30">
                            <td className="px-2 py-2">
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
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setOpenCampaigns((s) => ({ ...s, [camp.id]: !s[camp.id] }))}
                                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                                >
                                  <LevelBadge level="campaign" />
                                  <div className="flex h-6 w-6 items-center justify-center rounded bg-success/10 text-success">
                                    <FolderKanban className="h-3 w-3" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground hover:text-primary truncate max-w-[200px]">{camp.name}</p>
                                    {(camp.issuesStatus || camp.doubleCount) && (
                                      <p className="text-[10px] text-destructive flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        {camp.issuesStatus || "double-counting"}
                                      </p>
                                    )}
                                  </div>
                                </button>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setChartEntity({ level: "campaign", id: String(camp.id), name: camp.name }); }}
                                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                                      aria-label="View charts"
                                    >
                                      <BarChart3 className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>View charts</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                            {(() => {
                              // Re-resolve metrics directly from the date-ranged
                              // source so we NEVER fall back to the static
                              // `campaigns.spend` lifetime snapshot, even if the
                              // earlier rewrite is racing/missing for this row.
                              const rangedCamp = campaignRangeMetrics.campaigns[camp.id];
                              const rSpend = rangedCamp?.spend ?? 0;
                              const rLeads = rangedCamp?.leads ?? 0;
                              const rImpr = rangedCamp?.impressions ?? campImpr;
                              const rClicks = rangedCamp?.clicks ?? campClicks;
                              const rCtr = rImpr > 0 ? (rClicks / rImpr) * 100 : 0;
                              const campCpm = rangedCamp?.cpm ?? (rImpr > 0 ? (rSpend / rImpr) * 1000 : 0);
                              const campFreq = Number(rangedCamp?.frequency ?? 0);
                              const campAbove = leadBreakdown.byCampaign[camp.id] ?? null;
                              const cplVal = rLeads > 0 ? rSpend / rLeads : 0;
                              return (
                                <>
                                  {isVisible("impressions") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(rImpr)}</td>}
                                  {isVisible("clicks") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{rClicks || "—"}</td>}
                                  {isVisible("ctr") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{rCtr > 0 ? `${rCtr.toFixed(2)}%` : "—"}</td>}
                                  {isVisible("spend") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(rSpend, cur)}</td>}
                                  {isVisible("leads") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{rLeads}</td>}
                                  {isVisible("cpl") && (
                                    <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(cplVal))}>
                                      {cplVal > 0 ? fmtMoney(cplVal, cur, 2) : "—"}
                                    </td>
                                  )}
                                  {isVisible("cpm") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{campCpm > 0 ? fmtMoney(campCpm, cur, 2) : "—"}</td>}
                                  {isVisible("freq") && (
                                    <td className={cn("px-2 py-2 text-right tabular-nums", campFreq >= 3.5 ? "text-destructive font-semibold" : "text-foreground")}>
                                      {campFreq > 0 ? campFreq.toFixed(2) : "—"}
                                    </td>
                                  )}
                                  {isVisible("above640") && (
                                    <td
                                      className={cn("px-2 py-2 text-right tabular-nums", above640Color(campAbove?.pct ?? null))}
                                      title={campAbove?.pct != null ? `${campAbove.scored} scored lead${campAbove.scored === 1 ? "" : "s"}` : "No credit-score answers"}
                                    >
                                      {campAbove?.pct == null ? "—" : `${campAbove.pct.toFixed(0)}%`}
                                    </td>
                                  )}
                                  {extraCols.map((col) => {
                                    const scope: Record<string, number> = {
                                      impressions: rImpr, clicks: rClicks, ctr: rCtr,
                                      spend: rSpend, leads: rLeads, cpl: cplVal,
                                      cpm: campCpm, frequency: campFreq, above640: campAbove?.pct ?? 0,
                                    };
                                    if (col.kind === "formula") {
                                      const v = evalFormula(col.expr, scope);
                                      return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-foreground">{formatColumnValue(v, col.format, col.decimals)}</td>;
                                    }
                                    return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-muted-foreground">—</td>;
                                  })}
                                </>
                              );
                            })()}
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
                                <tr key={`as-${adsetId}`} className="border-b border-border bg-muted/30 hover:bg-muted/50">
                                  <td className="px-2 py-2">
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
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setOpenAdSets((s) => ({ ...s, [adsetId]: !s[adsetId] }))}
                                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                                      >
                                        <LevelBadge level="adset" />
                                        <div className="flex h-6 w-6 items-center justify-center rounded bg-warning/10 text-warning">
                                          <Layers className="h-3 w-3" />
                                        </div>
                                        <p className="text-sm text-foreground hover:text-primary truncate max-w-[180px]">{adsetName}</p>
                                        <span className="text-[10px] text-muted-foreground">· {ads.length} ad{ads.length === 1 ? "" : "s"}</span>
                                      </button>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setChartEntity({ level: "adset", id: adsetId, name: adsetName }); }}
                                            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                                            aria-label="View charts"
                                          >
                                            <BarChart3 className="h-3.5 w-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>View charts</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </td>
                                  {(() => {
                                    const asCpm = impr > 0 ? (spend / impr) * 1000 : 0;
                                    const asAbove = leadBreakdown.byAdset[adsetId] ?? null;
                                    return (
                                      <>
                                        {isVisible("impressions") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(impr)}</td>}
                                        {isVisible("clicks") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{clicks || "—"}</td>}
                                        {isVisible("ctr") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{ctr > 0 ? `${ctr.toFixed(2)}%` : "—"}</td>}
                                        {isVisible("spend") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(spend, cur)}</td>}
                                        {isVisible("leads") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{leads}</td>}
                                        {isVisible("cpl") && (
                                          <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(cpl))}>
                                            {cpl > 0 ? fmtMoney(cpl, cur, 2) : "—"}
                                          </td>
                                        )}
                                        {isVisible("cpm") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{asCpm > 0 ? fmtMoney(asCpm, cur, 2) : "—"}</td>}
                                        {isVisible("freq") && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">—</td>}
                                        {isVisible("above640") && (
                                          <td
                                            className={cn("px-2 py-2 text-right tabular-nums", above640Color(asAbove?.pct ?? null))}
                                            title={asAbove?.pct != null ? `${asAbove.scored} scored lead${asAbove.scored === 1 ? "" : "s"}` : "No credit-score answers"}
                                          >
                                            {asAbove?.pct == null ? "—" : `${asAbove.pct.toFixed(0)}%`}
                                          </td>
                                        )}
                                        {extraCols.map((col) => {
                                          const scope: Record<string, number> = {
                                            impressions: impr, clicks, ctr, spend, leads, cpl,
                                            cpm: asCpm, frequency: 0, above640: asAbove?.pct ?? 0,
                                          };
                                          if (col.kind === "formula") {
                                            const v = evalFormula(col.expr, scope);
                                            return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-foreground">{formatColumnValue(v, col.format, col.decimals)}</td>;
                                          }
                                          return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-muted-foreground">—</td>;
                                        })}
                                      </>
                                    );
                                  })()}
                                </tr>

                                {/* Ads */}
                                {asOpen && (() => {
                                  const ratings = rateAdsInAdset(ads);
                                  return ads.map((ad) => {
                                    const adCtr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
                                    const rating = ratings.get(ad.id) ?? "ok";
                                    return (
                                      <tr key={`ad-${ad.id}`} className="border-b border-border/50 bg-muted/50 hover:bg-muted/70">
                                        <td className="px-2 py-2"></td>
                                        <td className="px-2 py-2">
                                          <Checkbox
                                            checked={isSelected("ad", ad.id)}
                                            onCheckedChange={() => toggleSel("ad", ad.id, String(camp.clientId))}
                                            aria-label="Select ad"
                                          />
                                        </td>
                                        <td className="px-2 py-2"></td>
                                        <td className="px-2 py-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <LevelBadge level="ad" />
                                            {ad.thumbnail_url ? (
                                              <img src={ad.thumbnail_url} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
                                            ) : (
                                              <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-muted-foreground flex-shrink-0">
                                                <ImageIcon className="h-3 w-3" />
                                              </div>
                                            )}
                                            <p className="text-xs text-foreground truncate max-w-[160px]">{ad.name ?? "Untitled"}</p>
                                            <AdRatingBadge rating={rating} />
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); setChartEntity({ level: "ad", id: String(ad.id), name: ad.name ?? "Untitled" }); }}
                                                  className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                                                  aria-label="View charts"
                                                >
                                                  <BarChart3 className="h-3.5 w-3.5" />
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent>View charts</TooltipContent>
                                            </Tooltip>
                                          </div>
                                        </td>
                                      {(() => {
                                        const adCpm = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0;
                                        const adAbove = leadBreakdown.byAd[ad.id] ?? null;
                                        return (
                                          <>
                                            {isVisible("impressions") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtInt(ad.impressions)}</td>}
                                            {isVisible("clicks") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{ad.clicks || "—"}</td>}
                                            {isVisible("ctr") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{adCtr > 0 ? `${adCtr.toFixed(2)}%` : "—"}</td>}
                                            {isVisible("spend") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtMoney(ad.spend, cur)}</td>}
                                            {isVisible("leads") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{ad.leads}</td>}
                                            {isVisible("cpl") && (
                                              <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", cplColor(ad.cpl))}>
                                                {ad.cpl > 0 ? fmtMoney(ad.cpl, cur, 2) : "—"}
                                              </td>
                                            )}
                                            {isVisible("cpm") && <td className="px-2 py-2 text-right tabular-nums text-foreground">{adCpm > 0 ? fmtMoney(adCpm, cur, 2) : "—"}</td>}
                                            {isVisible("freq") && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">—</td>}
                                            {isVisible("above640") && (
                                              <td
                                                className={cn("px-2 py-2 text-right tabular-nums", above640Color(adAbove?.pct ?? null))}
                                                title={adAbove?.pct != null ? `${adAbove.scored} scored lead${adAbove.scored === 1 ? "" : "s"}` : "No credit-score answers"}
                                              >
                                                {adAbove?.pct == null ? "—" : `${adAbove.pct.toFixed(0)}%`}
                                              </td>
                                            )}
                                            {extraCols.map((col) => {
                                              const scope: Record<string, number> = {
                                                impressions: ad.impressions, clicks: ad.clicks, ctr: adCtr,
                                                spend: ad.spend, leads: ad.leads, cpl: ad.cpl,
                                                cpm: adCpm, frequency: 0, above640: adAbove?.pct ?? 0,
                                              };
                                              if (col.kind === "formula") {
                                                const v = evalFormula(col.expr, scope);
                                                return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-foreground">{formatColumnValue(v, col.format, col.decimals)}</td>;
                                              }
                                              return <td key={col.id} className="px-2 py-2 text-right tabular-nums text-muted-foreground">—</td>;
                                            })}
                                          </>
                                        );
                                      })()}
                                    </tr>
                                    );
                                  });
                                })()}
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
      <EntityChartsDrawer
        open={chartEntity !== null}
        onOpenChange={(v) => { if (!v) setChartEntity(null); }}
        level={chartEntity?.level ?? null}
        objectId={chartEntity?.id ?? null}
        name={chartEntity?.name ?? null}
      />
    </div>
  );
}
