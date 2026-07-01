import { useState, useMemo, useEffect } from "react";
import { useClients, useCampaigns } from "@/hooks/useDatabase";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { useCustomKpis, useLatestKpiEvaluations } from "@/hooks/useCustomKpis";
import { StatusBadge } from "./StatusBadge";
import { ClientDrawer } from "./ClientDrawer";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Building2, User, Search, SlidersHorizontal, Plus, ExternalLink, Download, ChevronDown, Loader2, Check, RefreshCw, Sparkles, MoveRight, FileDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { KpiLabel } from "@/components/kpi/KpiLabel";
import { AdAccountSelector } from "./AdAccountSelector";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClientPath } from "@/lib/clientPath";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Client } from "@/data/mockData";

type StatusFilter = "ALL" | "NEW" | "GREEN" | "YELLOW" | "RED" | "BLOCKED";
type Channel = "all" | "meta" | "google" | "tiktok" | "linkedin";
type SortDir = "asc" | "desc";

const statusOrder: Record<string, number> = { NEW: -1, RED: 0, YELLOW: 1, GREEN: 2, BLOCKED: 3 };

const BULK_STATUSES: { key: string; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "GREEN", label: "Green" },
  { key: "YELLOW", label: "Yellow" },
  { key: "RED", label: "Red" },
  { key: "LEARNING", label: "Learning" },
  { key: "LAUNCHING", label: "Launching" },
  { key: "RELAUNCH", label: "Re-Launch" },
  { key: "PAUSED", label: "Paused" },
  { key: "PENDING_APPROVAL", label: "Pending Approval" },
  { key: "PENDING_CANCELLATION", label: "Pending Cancellation" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "BLOCKED", label: "Blocked" },
];

// --- Column registry ---------------------------------------------------------
type ColRender = (c: any) => React.ReactNode;
interface ColDef {
  key: string;
  label: string;
  kpiKey?: string;
  width?: string;
  channel: Channel; // "all" = always shown regardless of channel
  always?: boolean;  // can't be hidden
  sortKey?: string;
  render: ColRender;
}

function getCPLColor(v: number) {
  if (v <= 0) return "text-muted-foreground";
  if (v < 30) return "text-success";
  if (v <= 60) return "text-warning";
  return "text-destructive";
}
function getCVRColor(v: number) {
  if (v > 15) return "text-success";
  if (v >= 10) return "text-warning";
  return "text-destructive";
}
function getFreqColor(v: number) {
  if (v > 4) return "text-destructive";
  if (v > 3) return "text-warning";
  return "text-foreground";
}

const CHANNEL_LABELS: Record<Channel, string> = {
  all: "All Channels",
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

const BUILTIN_COLUMNS: ColDef[] = [
  {
    key: "rank", label: "#", channel: "all", always: true, width: "w-10",
    render: (c) => <span className="text-muted-foreground tabular-nums">{c._rank}</span>,
  },
  {
    key: "name", label: "Client", channel: "all", always: true, sortKey: "name", width: "w-48",
    render: (c) => (
      <div>
        <p className="font-medium text-foreground">{c.name}</p>
        <p className="text-xs text-muted-foreground">{c.brand}</p>
      </div>
    ),
  },
  {
    key: "status", label: "Status", channel: "all", sortKey: "status", width: "w-24",
    render: (c) => <StatusBadge status={c.status} />,
  },
  {
    key: "bmType", label: "BM Type", channel: "meta", sortKey: "bmType", width: "w-28",
    render: (c) => (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {c.bmType === "Own BM" ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
        {c.bmType}
      </span>
    ),
  },
  {
    key: "cpl", label: "CPL", kpiKey: "cpl", channel: "all", sortKey: "cpl", width: "w-20",
    render: (c) => <span className={cn("font-semibold tabular-nums", getCPLColor(c.cpl))}>${c.cpl.toFixed(2)}</span>,
  },
  {
    key: "cpm", label: "CPM", kpiKey: "cpm", channel: "meta", sortKey: "cpm", width: "w-20",
    render: (c) => <span className={cn("font-semibold tabular-nums", getCPLColor(c.cpm > 120 ? 61 : c.cpm > 80 ? 31 : 0))}>${c.cpm.toFixed(2)}</span>,
  },
  {
    key: "leads", label: "Leads", kpiKey: "leads", channel: "all", sortKey: "leads", width: "w-20",
    render: (c) => <span className="tabular-nums text-foreground">{c.leads}</span>,
  },
  {
    key: "spend", label: "Spend", kpiKey: "spend", channel: "all", sortKey: "spend", width: "w-24",
    render: (c) => <span className="tabular-nums text-foreground">${c.spend.toLocaleString()}</span>,
  },
  {
    key: "formCvr", label: "Form CVR", kpiKey: "formcvr", channel: "all", sortKey: "formCvr", width: "w-24",
    render: (c) => <span className={cn("font-semibold tabular-nums", getCVRColor(c.formCvr))}>{c.formCvr.toFixed(2)}%</span>,
  },
  {
    key: "frequency", label: "Freq", kpiKey: "frequency", channel: "meta", sortKey: "frequency", width: "w-16",
    render: (c) => <span className={cn("tabular-nums", getFreqColor(c.frequency))}>{Number(c.frequency).toFixed(2)}</span>,
  },
];

const STORAGE_KEY = "clientTable.visibleColumns.v2";
const CHANNEL_KEY = "clientTable.channel.v1";

function loadVisible(defaultIds: string[]): string[] {
  if (typeof window === "undefined") return defaultIds;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultIds;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : defaultIds;
  } catch { return defaultIds; }
}

export function ClientTable() {
  const { data: baseClients = [], isLoading } = useClients();
  const { data: rangeMetrics = {}, isFetching: rangeLoading } = useClientsRangeMetrics();
  const { label: rangeLabel, from: rangeFrom, to: rangeTo } = useDateRange();
  const { data: customKpis = [] } = useCustomKpis();
  const activeKpis = useMemo(() => customKpis.filter((k) => k.enabled), [customKpis]);
  const { data: evaluations = [] } = useLatestKpiEvaluations(activeKpis.map((k) => k.id));

  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [channel, setChannel] = useState<Channel>(() => {
    if (typeof window === "undefined") return "all";
    return (localStorage.getItem(CHANNEL_KEY) as Channel) ?? "all";
  });
  const navigate = useNavigate();
  const [selectedClientId, setSelectedClientId] = useState<number | "all">("all");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [autoClassifying, setAutoClassifying] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const clientPath = useClientPath();
  const qc = useQueryClient();

  const focusedClient = useMemo(
    () => (selectedClientId === "all" ? null : baseClients.find((c) => c.id === selectedClientId) ?? null),
    [baseClients, selectedClientId]
  );

  const handleQuickSync = async () => {
    if (!currentWorkspace) {
      toast.error("No workspace selected");
      return;
    }
    setSyncing(true);
    const target = focusedClient ? focusedClient.name : "all clients in this workspace";
    const toastId = toast.loading(`Syncing Meta campaigns for ${target}…`);
    try {
      const { data, error } = await supabase.functions.invoke("meta-sync", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      toast.success(
        `Sync started for ${target}. Refreshing data in ~30s — you can keep working.`,
        { id: toastId, duration: 6000 },
      );
      // Refetch a few times so freshly-imported insights appear without a manual reload.
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["clients-range-metrics"] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      }, 15000);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["clients-range-metrics"] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      }, 45000);
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed", { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const handleAutoClassify = async () => {
    if (!currentWorkspace) return;
    setAutoClassifying(true);
    try {
      const { data, error } = await (supabase as any).rpc("auto_classify_new_clients", {
        _workspace_id: currentWorkspace.id,
      });
      if (error) throw error;
      const moved = data?.moved ?? 0;
      const skipped = data?.skipped ?? 0;
      toast.success(`Auto-classified ${moved} client${moved === 1 ? "" : "s"}${skipped ? ` · ${skipped} kept in New (no data)` : ""}`);
      qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Auto-classify failed");
    } finally {
      setAutoClassifying(false);
    }
  };

  const handleBulkMove = async (status: string) => {
    if (!currentWorkspace || selectedIds.size === 0) return;
    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds).map((v) => Number(v));
      const { data, error } = await (supabase as any).rpc("bulk_update_client_status", {
        _workspace_id: currentWorkspace.id,
        _client_ids: ids,
        _status: status,
      });
      if (error) throw error;
      toast.success(`Moved ${data ?? ids.length} client${ids.length === 1 ? "" : "s"} to ${status}`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk update failed");
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleExportCSV = () => {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const cols = visibleColumns.filter((c) => c.key !== "rank");
    const headers = ["#", ...cols.map((c) => c.label)];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rowValue = (c: any, key: string): any => {
      switch (key) {
        case "name": return `${c.name}${c.brand ? ` (${c.brand})` : ""}`;
        case "status": return c.status;
        case "bmType": return c.bmType ?? "";
        case "cpl": return Number(c.cpl ?? 0).toFixed(2);
        case "cpm": return Number(c.cpm ?? 0).toFixed(2);
        case "leads": return c.leads ?? 0;
        case "spend": return Number(c.spend ?? 0).toFixed(2);
        case "formCvr": return Number(c.formCvr ?? 0).toFixed(2);
        case "frequency": return Number(c.frequency ?? 0).toFixed(2);
        default:
          if (key.startsWith("custom:")) {
            const id = key.slice("custom:".length);
            const v = c._custom?.[id];
            return v == null ? "" : String(v);
          }
          return (c as any)[key] ?? "";
      }
    };
    const lines = [headers.map(escape).join(",")];
    for (const c of filtered) {
      lines.push([c._rank, ...cols.map((col) => rowValue(c, col.key))].map(escape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients_${fmt(rangeFrom)}_to_${fmt(rangeTo)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} client${filtered.length === 1 ? "" : "s"}`);
  };

  // Lookup for custom KPI values: { kpiId: { clientId|"_global": value } }
  const evalMap = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>();
    for (const ev of evaluations) {
      if (!m.has(ev.custom_kpi_id)) m.set(ev.custom_kpi_id, new Map());
      m.get(ev.custom_kpi_id)!.set(String(ev.client_id ?? "_global"), ev.value);
    }
    return m;
  }, [evaluations]);

  // Merge per-range aggregates over the snapshot.
  const clients = useMemo(() => {
    return baseClients.map((c) => {
      const m = rangeMetrics[c.id];
      // When no per-range aggregate exists, show zeros instead of falling back
      // to the client snapshot fields — those are lifetime/last-sync totals
      // and would misrepresent the picker window (often by 5-10x).
      const base = !m
        ? {
            ...c,
            cpl: 0,
            cpm: 0,
            leads: 0,
            spend: 0,
            formCvr: 0,
            frequency: 0,
            doubleCount: false,
            trueCpl: 0,
            reportedLeads: 0,
            trueLeads: 0,
          }
        : { ...c, cpl: m.cpl, cpm: m.cpm, leads: m.reportedLeads, spend: m.spend, formCvr: m.formCvr, frequency: m.frequency, doubleCount: m.doubleCount, trueCpl: m.trueCpl, reportedLeads: m.reportedLeads, trueLeads: m.trueLeads };
      // Attach custom KPI values
      const custom: Record<string, number | null> = {};
      for (const kpi of activeKpis) {
        const perClient = evalMap.get(kpi.id);
        const val = perClient?.get(String(c.id)) ?? perClient?.get("_global") ?? null;
        custom[kpi.id] = val;
      }
      return { ...base, _custom: custom };
    });
  }, [baseClients, rangeMetrics, activeKpis, evalMap]);

  // Build custom KPI column defs
  const customCols: ColDef[] = useMemo(() =>
    activeKpis.map((k) => ({
      key: `custom:${k.id}`,
      label: k.name,
      channel: "all" as const,
      sortKey: `_custom.${k.id}`,
      width: "w-24",
      render: (c: any) => {
        const v = c._custom?.[k.id];
        if (v == null) return <span className="text-muted-foreground tabular-nums">—</span>;
        const decimals = k.format?.decimals ?? 2;
        const prefix = k.format?.prefix ?? (k.unit === "currency" ? "$" : "");
        const suffix = k.format?.suffix ?? (k.unit === "percent" ? "%" : "");
        return <span className="font-semibold tabular-nums text-foreground">{prefix}{Number(v).toFixed(decimals)}{suffix}</span>;
      },
    })),
  [activeKpis]);

  const allColumns = useMemo(() => [...BUILTIN_COLUMNS, ...customCols], [customCols]);

  const defaultVisible = useMemo(
    () => BUILTIN_COLUMNS.filter((c) => c.always || ["status","cpl","leads","spend","formCvr"].includes(c.key)).map((c) => c.key),
    []
  );
  const [visibleIds, setVisibleIds] = useState<string[]>(() => loadVisible(defaultVisible));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleIds)); } catch {}
  }, [visibleIds]);
  useEffect(() => {
    try { localStorage.setItem(CHANNEL_KEY, channel); } catch {}
  }, [channel]);

  const visibleColumns = useMemo(() => {
    return allColumns.filter((c) => {
      if (c.always) return true;
      if (!visibleIds.includes(c.key)) return false;
      if (channel !== "all" && c.channel !== "all" && c.channel !== channel) return false;
      return true;
    });
  }, [allColumns, visibleIds, channel]);

  const filtered = useMemo(() => {
    let list = clients;
    if (selectedClientId !== "all") list = list.filter((c) => c.id === selectedClientId);
    // Hide paused/cancelled clients from the main list unless explicitly filtered to them
    const hiddenStatuses = new Set(["PAUSED", "CANCELLED", "PENDING_CANCELLATION"]);
    if (filter === "ALL") {
      list = list.filter((c) => !hiddenStatuses.has(c.status as string));
    } else {
      list = list.filter((c) => c.status === filter);
    }
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.brand.toLowerCase().includes(search.toLowerCase()));
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "status") {
        const diff = statusOrder[a.status] - statusOrder[b.status];
        return sortDir === "asc" ? diff : -diff;
      }
      const get = (obj: any, path: string) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
      const aVal = get(a, sortKey);
      const bVal = get(b, sortKey);
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return sorted.map((c, i) => ({ ...c, _rank: i + 1 }));
  }, [clients, filter, search, sortKey, sortDir, selectedClientId]);

  const toggleSort = (key?: string) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric columns feel more natural sorted high → low on first click
      const numericKeys = new Set(["cpl", "cpm", "leads", "spend", "formCvr", "frequency"]);
      setSortDir(numericKeys.has(key) || key.startsWith("_custom.") ? "desc" : "asc");
    }
  };

  const toggleColumn = (key: string) => {
    setVisibleIds((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };

  const filters: StatusFilter[] = ["ALL", "NEW", "GREEN", "YELLOW", "RED", "BLOCKED"];
  const newCount = useMemo(() => clients.filter((c) => c.status === "NEW").length, [clients]);
  const allRowsSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (allRowsSelected) {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  };
  const toggleRow = (id: number | string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading clients...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">All Clients</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">{filtered.length}</span>
          <span className="text-xs text-muted-foreground">· {rangeLabel}{rangeLoading && " · updating…"}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Client picker */}
          <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 min-w-[180px] justify-between gap-1.5 text-xs">
                <span className="truncate">
                  {focusedClient ? focusedClient.name : "All Clients"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search client..." className="text-xs" />
                <CommandList>
                  <CommandEmpty>No clients found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => { setSelectedClientId("all"); setClientPickerOpen(false); }}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", selectedClientId === "all" ? "opacity-100" : "opacity-0")} />
                      All Clients
                    </CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Clients">
                    {baseClients.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => { setSelectedClientId(c.id); setClientPickerOpen(false); }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", selectedClientId === c.id ? "opacity-100" : "opacity-0")} />
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
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => navigate(clientPath(focusedClient.id))}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Profile
            </Button>
          )}

          {/* Import split-button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={syncing}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Import
                <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={handleQuickSync} disabled={syncing}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {focusedClient ? `Sync Meta · ${focusedClient.name}` : "Sync Meta · all clients"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setImportOpen(true)}
                disabled={!focusedClient}
                title={!focusedClient ? "Pick a client first" : undefined}
              >
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                Choose campaigns to import…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => focusedClient && navigate(clientPath(focusedClient.id, "?tab=campaigns"))}
                disabled={!focusedClient}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                View imported campaigns
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {newCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/5"
              onClick={handleAutoClassify}
              disabled={autoClassifying}
              title="Auto-move New clients into Green/Yellow/Red based on their KPI performance"
            >
              {autoClassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Auto-classify New ({newCount})
            </Button>
          )}

          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
              )}
            >{f}</button>
          ))}

          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {CHANNEL_LABELS[c]}
                  {c !== "all" && c !== "meta" && <span className="ml-2 text-[10px] text-muted-foreground">soon</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleExportCSV}
            title={`Export ${filtered.length} rows for ${rangeLabel}`}
          >
            <FileDown className="h-3.5 w-3.5" />
            Export
          </Button>

          <Popover>

            <PopoverTrigger asChild>

              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Standard Metrics</p>
                  <div className="space-y-1.5">
                    {BUILTIN_COLUMNS.filter((c) => !c.always).map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground">
                        <Checkbox
                          checked={visibleIds.includes(c.key)}
                          onCheckedChange={() => toggleColumn(c.key)}
                        />
                        <span className="flex-1">{c.label}</span>
                        {c.channel !== "all" && (
                          <span className="text-[10px] uppercase text-muted-foreground">{CHANNEL_LABELS[c.channel]}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom KPIs</p>
                    <Link to="/settings?tab=custom-kpis" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                      <Plus className="h-3 w-3" /> New
                    </Link>
                  </div>
                  {customCols.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No custom KPIs yet. <Link to="/settings?tab=custom-kpis" className="text-primary hover:underline">Create one</Link> to add it as a column.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {customCols.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground">
                          <Checkbox
                            checked={visibleIds.includes(c.key)}
                            onCheckedChange={() => toggleColumn(c.key)}
                          />
                          <span className="flex-1 truncate">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="relative ml-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-48 pl-8 text-xs" />
          </div>

          <AdAccountSelector />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{selectedIds.size}</span>
            <span className="text-muted-foreground">selected</span>
            <button
              className="ml-2 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setSelectedIds(new Set())}
            >Clear</button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={bulkUpdating}>
                {bulkUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoveRight className="h-3.5 w-3.5" />}
                Move to…
                <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Move selected to
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {BULK_STATUSES.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => handleBulkMove(s.key)} className="text-xs">
                  <StatusBadge status={s.key as any} />
                  <span className="ml-2">{s.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                <th className="w-8 px-3 py-2.5">
                  <Checkbox
                    checked={allRowsSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.sortKey)}
                    className={cn(
                      "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground select-none",
                      col.sortKey && "cursor-pointer hover:text-foreground",
                      col.width
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.kpiKey ? <KpiLabel label={col.label} kpiKey={col.kpiKey} showIcon={false} /> : col.label}
                      {col.sortKey && <ArrowUpDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedClient(c)}
                  className={cn(
                    "border-b border-border cursor-pointer transition-colors hover:bg-accent/50",
                    c.status === "BLOCKED" && "opacity-60",
                    c.status === "GREEN" && "border-l-2 border-l-success",
                    c.status === "RED" && "border-l-2 border-l-destructive",
                    c.frequency > 3.5 && "animate-pulse-amber",
                    selectedIds.has(c.id) && "bg-primary/5"
                  )}
                >
                  <td className="w-8 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleRow(c.id)}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-3 py-3">{col.render(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && <ClientDrawer client={selectedClient} onClose={() => setSelectedClient(null)} />}

      <CampaignImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        clientId={focusedClient?.id ?? null}
        clientName={focusedClient?.name ?? ""}
      />
    </div>
  );
}

function CampaignImportDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: number | null;
  clientName: string;
}) {
  const { data: allCampaigns = [], isLoading } = useCampaigns();
  const campaigns = useMemo(
    () => allCampaigns.filter((c: any) => c.clientId === clientId || c.client_id === clientId),
    [allCampaigns, clientId]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(campaigns.map((c: any) => String(c.id))));
  }, [open, campaigns]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleImport = async () => {
    if (!clientId) return;
    setImporting(true);
    try {
      await api.syncMetaAds(String(clientId));
      toast.success(`Imported ${selected.size} campaign${selected.size === 1 ? "" : "s"} for ${clientName}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import campaigns</DialogTitle>
          <DialogDescription>
            Select which campaigns to import for <span className="font-medium text-foreground">{clientName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No campaigns found for this client yet. Use “Sync Meta” to pull them from Meta.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {campaigns.map((c: any) => {
                const id = String(c.id);
                const checked = selected.has(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={() => toggle(id)} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status} · {c.leads ?? 0} leads · ${Number(c.spend ?? 0).toLocaleString()} spend
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={importing || selected.size === 0 || campaigns.length === 0}>
            {importing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Import {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

