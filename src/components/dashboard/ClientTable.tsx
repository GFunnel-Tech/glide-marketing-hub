import { useState, useMemo, useEffect } from "react";
import { useClients, useCampaigns } from "@/hooks/useDatabase";
import { useClientsRangeMetrics } from "@/hooks/useClientsRangeMetrics";
import { useDateRange } from "@/hooks/useDateRange";
import { useCustomKpis, useLatestKpiEvaluations } from "@/hooks/useCustomKpis";
import { StatusBadge } from "./StatusBadge";
import { ClientDrawer } from "./ClientDrawer";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Building2, User, Search, SlidersHorizontal, Plus, ExternalLink, Download, ChevronDown, Loader2, Check, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { KpiLabel } from "@/components/kpi/KpiLabel";
import type { Client } from "@/data/mockData";

type StatusFilter = "ALL" | "GREEN" | "YELLOW" | "RED" | "BLOCKED";
type Channel = "all" | "meta" | "google" | "tiktok" | "linkedin";
type SortDir = "asc" | "desc";

const statusOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2, BLOCKED: 3 };

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
  const { label: rangeLabel } = useDateRange();
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
      const base = !m ? { ...c, cpl: 0, cpm: 0, leads: 0, spend: 0, formCvr: 0, frequency: 0, doubleCount: false, trueCpl: 0, reportedLeads: 0, trueLeads: 0 }
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
    if (filter !== "ALL") list = list.filter((c) => c.status === filter);
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
  }, [clients, filter, search, sortKey, sortDir]);

  const toggleSort = (key?: string) => {
    if (!key) return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleColumn = (key: string) => {
    setVisibleIds((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };

  const filters: StatusFilter[] = ["ALL", "GREEN", "YELLOW", "RED", "BLOCKED"];

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
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
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
                    c.frequency > 3.5 && "animate-pulse-amber"
                  )}
                >
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
    </div>
  );
}
