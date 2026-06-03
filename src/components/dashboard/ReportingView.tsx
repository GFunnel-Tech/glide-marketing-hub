import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useCampaigns } from "@/hooks/useDatabase";
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
  DollarSign, Eye, Layers, Play, Pause as PauseIcon,
  Search, ChevronDown, ChevronRight, ChevronUp, Check,
  Sparkles, SlidersHorizontal, Download, RefreshCw, Loader2,
  Filter, AlertTriangle, ExternalLink, Columns3, Settings2,
} from "lucide-react";

// ---------- Platform tabs ----------
type Platform = "meta" | "google" | "tiktok" | "linkedin" | "spotify" | "bing" | "snapchat" | "directmail" | "groups";
const PLATFORMS: { id: Platform; label: string; soon?: boolean }[] = [
  { id: "meta", label: "Meta" },
  { id: "google", label: "Google", soon: true },
  { id: "tiktok", label: "TikTok", soon: true },
  { id: "linkedin", label: "LinkedIn", soon: true },
  { id: "spotify", label: "Spotify", soon: true },
  { id: "bing", label: "Bing", soon: true },
  { id: "snapchat", label: "Snapchat", soon: true },
  { id: "directmail", label: "Direct Mail", soon: true },
  { id: "groups", label: "Groups", soon: true },
];

// ---------- KPI tile ----------
const TONE = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  pink: "bg-destructive/10 text-destructive",
  slate: "bg-muted text-muted-foreground",
} as const;

function KpiTile({
  label, value, Icon, tone,
}: { label: string; value: string; Icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-foreground leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Row helpers ----------
function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function fmtInt(n: number) { return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"; }

type Campaign = ReturnType<typeof useCampaigns>["data"] extends (infer T)[] | undefined ? T : never;

function deriveImpressions(spend: number, cpm: number) {
  if (!cpm || cpm <= 0) return 0;
  return (spend / cpm) * 1000;
}

// ---------- Main ----------
export function ReportingView() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: allCampaigns = [], isLoading } = useCampaigns();

  const [platform, setPlatform] = useState<Platform>("meta");
  const [clientId, setClientId] = useState<number | "all">("all");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Paused" | "Issues">("All");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ drafts: true, active: true, errors: true });
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const focusedClient = useMemo(
    () => (clientId === "all" ? null : clients.find((c) => c.id === clientId) ?? null),
    [clients, clientId]
  );

  // Filter by client + status + search
  const campaigns = useMemo(() => {
    let list = allCampaigns as any[];
    if (clientId !== "all") list = list.filter((c) => String(c.clientId) === String(clientId));
    if (statusFilter === "Active") list = list.filter((c) => c.status === "active");
    if (statusFilter === "Paused") list = list.filter((c) => c.status === "paused");
    if (statusFilter === "Issues") list = list.filter((c) => c.doubleCount || c.issuesStatus);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(s));
    }
    return list;
  }, [allCampaigns, clientId, statusFilter, search]);

  // Group
  const groups = useMemo(() => {
    const active = campaigns.filter((c) => c.status === "active" && !c.issuesStatus);
    const drafts = campaigns.filter((c) => c.status !== "active" && !c.issuesStatus);
    const errors = campaigns.filter((c) => !!c.issuesStatus);
    return { active, drafts, errors };
  }, [campaigns]);

  // Performance overview (across filtered campaigns)
  const overview = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const impressions = campaigns.reduce((s, c) => s + deriveImpressions(c.spend || 0, c.cpm || 0), 0);
    const total = campaigns.length;
    const enabled = campaigns.filter((c) => c.status === "active").length;
    const paused = campaigns.filter((c) => c.status !== "active").length;
    return { spend, impressions, total, enabled, paused };
  }, [campaigns]);

  const handleQuickSync = async () => {
    if (clientId === "all" || !focusedClient) {
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

  const handleToggle = async (camp: any, next: boolean) => {
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

  const filters: typeof statusFilter[] = ["All", "Active", "Paused", "Issues"];

  return (
    <div className="space-y-5">
      {/* Platform tabs */}
      <div className="rounded-xl border border-border bg-card p-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => !p.soon && setPlatform(p.id)}
              disabled={p.soon}
              className={cn(
                "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                platform === p.id
                  ? "bg-primary/10 text-primary"
                  : p.soon
                    ? "text-muted-foreground/60 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {p.label}
              {p.soon && <span className="text-[9px] uppercase tracking-wider opacity-70">soon</span>}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 pr-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Client:</span>
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
                      <CommandItem
                        onSelect={() => { setClientId("all"); setClientPickerOpen(false); }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", clientId === "all" ? "opacity-100" : "opacity-0")} />
                        All Clients
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Clients">
                      {clients.map((c) => (
                        <CommandItem
                          key={c.id}
                          onSelect={() => { setClientId(c.id); setClientPickerOpen(false); }}
                          className="text-xs"
                        >
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
          </div>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Performance Overview</h2>
          {focusedClient && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/client/${focusedClient.id}`)}
              className="h-7 text-xs gap-1"
            >
              Open profile <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <KpiTile label="Spend" value={fmtMoney(overview.spend)} Icon={DollarSign} tone="blue" />
          <KpiTile label="Impressions" value={fmtInt(overview.impressions)} Icon={Eye} tone="green" />
          <KpiTile label="Total Campaigns" value={String(overview.total)} Icon={Layers} tone="amber" />
          <KpiTile label="Enabled Campaigns" value={String(overview.enabled)} Icon={Play} tone="green" />
          <KpiTile label="Paused Campaigns" value={String(overview.paused)} Icon={PauseIcon} tone="slate" />
        </div>
      </div>

      {/* Toolbar + Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                Actions <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleQuickSync} disabled={syncing || clientId === "all"}>
                {syncing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                Sync Meta campaigns
              </DropdownMenuItem>
              <DropdownMenuItem disabled={Object.values(selected).filter(Boolean).length === 0} onClick={() => {
                const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
                const first = campaigns.find((c) => ids.includes(c.id));
                if (!first) return;
                api.pauseCampaigns(String(first.clientId), ids).then(() => toast.success(`Paused ${ids.length}`)).catch(() => toast.error("Failed"));
              }}>
                <PauseIcon className="mr-2 h-3.5 w-3.5" /> Pause selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Sparkles className="mr-2 h-3.5 w-3.5" /> Optimize selected (soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled>
            <Columns3 className="h-3.5 w-3.5" /> Columns
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Export" disabled>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40">
                <th className="w-8 px-2 py-2.5"></th>
                <th className="w-20 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaigns</th>
                <th className="w-28 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Optimize</th>
                <th className="w-32 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Budget</th>
                <th className="w-24 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Impr.</th>
                <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Leads</th>
                <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CPL</th>
                <th className="w-24 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                <th className="w-20 px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Results</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="py-10 text-center text-muted-foreground text-sm">Loading campaigns…</td></tr>
              )}

              {!isLoading && groups.drafts.length > 0 && (
                <GroupHeader
                  label="Drafts & paused"
                  count={groups.drafts.length}
                  tone="amber"
                  open={expanded.drafts}
                  onToggle={() => setExpanded((e) => ({ ...e, drafts: !e.drafts }))}
                />
              )}
              {!isLoading && expanded.drafts && groups.drafts.map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  pending={!!pending[c.id]}
                  selected={!!selected[c.id]}
                  onSelect={(v) => setSelected((s) => ({ ...s, [c.id]: v }))}
                  onToggle={(v) => handleToggle(c, v)}
                  onOpenClient={() => navigate(`/client/${c.clientId}`)}
                />
              ))}

              {!isLoading && groups.active.length > 0 && (
                <GroupHeader
                  label="Active campaigns"
                  count={groups.active.length}
                  tone="green"
                  open={expanded.active}
                  onToggle={() => setExpanded((e) => ({ ...e, active: !e.active }))}
                />
              )}
              {!isLoading && expanded.active && groups.active.map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  pending={!!pending[c.id]}
                  selected={!!selected[c.id]}
                  onSelect={(v) => setSelected((s) => ({ ...s, [c.id]: v }))}
                  onToggle={(v) => handleToggle(c, v)}
                  onOpenClient={() => navigate(`/client/${c.clientId}`)}
                />
              ))}

              {!isLoading && (
                <GroupHeader
                  label={`Campaigns with error${groups.errors.length === 0 ? " (none)" : ""}`}
                  count={groups.errors.length}
                  tone="pink"
                  open={expanded.errors}
                  onToggle={() => setExpanded((e) => ({ ...e, errors: !e.errors }))}
                />
              )}
              {!isLoading && expanded.errors && groups.errors.map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  pending={!!pending[c.id]}
                  selected={!!selected[c.id]}
                  onSelect={(v) => setSelected((s) => ({ ...s, [c.id]: v }))}
                  onToggle={(v) => handleToggle(c, v)}
                  onOpenClient={() => navigate(`/client/${c.clientId}`)}
                />
              ))}

              {!isLoading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    No campaigns match your filters.
                    {clientId !== "all" && (
                      <Button variant="link" size="sm" onClick={handleQuickSync} className="ml-1 text-xs h-auto p-0">
                        Sync from Meta?
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-rows ----------
function GroupHeader({
  label, count, tone, open, onToggle,
}: { label: string; count: number; tone: keyof typeof TONE; open: boolean; onToggle: () => void }) {
  const toneBg = {
    blue: "bg-primary/5",
    green: "bg-success/5",
    amber: "bg-warning/5",
    pink: "bg-destructive/5",
    slate: "bg-muted/40",
  }[tone];
  return (
    <tr className={cn("border-b border-border", toneBg)}>
      <td colSpan={10} className="px-3 py-2">
        <button onClick={onToggle} className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>{label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums", TONE[tone])}>{count}</span>
        </button>
      </td>
    </tr>
  );
}

function CampaignRow({
  c, pending, selected, onSelect, onToggle, onOpenClient,
}: {
  c: any;
  pending: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onToggle: (v: boolean) => void;
  onOpenClient: () => void;
}) {
  const isActive = c.status === "active";
  const impressions = deriveImpressions(c.spend || 0, c.cpm || 0);
  return (
    <tr className="border-b border-border hover:bg-accent/30 transition-colors group">
      <td className="px-2 py-2.5">
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} />
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1.5">
          {pending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : <Switch checked={isActive} onCheckedChange={onToggle} className="scale-75 origin-left" />}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <button onClick={onOpenClient} className="text-left">
          <p className="text-sm font-medium text-foreground group-hover:text-primary truncate max-w-[420px]">{c.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {c.adSets} ad set{c.adSets === 1 ? "" : "s"} · {c.ads} ad{c.ads === 1 ? "" : "s"}
            {c.issuesStatus && <span className="ml-2 inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />{c.issuesStatus}</span>}
            {c.doubleCount && <span className="ml-2 text-warning">⚠ double-counting</span>}
          </p>
        </button>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1 text-muted-foreground">
          <button className="p-1 rounded hover:bg-primary/10 hover:text-primary" title="AI suggestions"><Sparkles className="h-3.5 w-3.5" /></button>
          <button className="p-1 rounded hover:bg-primary/10 hover:text-primary" title="Budget"><DollarSign className="h-3.5 w-3.5" /></button>
          <button className="p-1 rounded hover:bg-primary/10 hover:text-primary" title="Settings"><Settings2 className="h-3.5 w-3.5" /></button>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <span className="text-xs text-muted-foreground">using ad set budget</span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtInt(impressions)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{c.leads ?? 0}</td>
      <td className="px-2 py-2.5 text-right tabular-nums">
        <span className={cn(
          "font-semibold",
          c.cpl < 30 ? "text-success" : c.cpl <= 60 ? "text-warning" : "text-destructive",
        )}>${(c.cpl ?? 0).toFixed(2)}</span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtMoney(c.spend ?? 0)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{c.trueLeads ?? 0}</td>
    </tr>
  );
}
