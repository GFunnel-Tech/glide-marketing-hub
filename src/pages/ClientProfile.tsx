import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient, useClients, useCampaigns, useActivityLog, useLeads, useClientsWithMetaAccount, useSetAgencyAccount } from "@/hooks/useDatabase";
import { useClientPath } from "@/lib/clientPath";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgentChat } from "@/components/ai/AgentChat";
import { AiInsightsFeed } from "@/components/ai/AiInsightsFeed";
import { PendingActionsPanel } from "@/components/ai/PendingActionsPanel";
import { AiRulesPanel } from "@/components/ai/AiRulesPanel";
import { ClientContextPanel } from "@/components/ai/ClientContextPanel";
import { KnowledgeBasePanel } from "@/components/ai/KnowledgeBasePanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useClientCampaignsRange, type RangeCampaignRow } from "@/hooks/useClientCampaignsRange";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Pencil,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Activity as ActivityIcon,
  Users,
  Target,
  Shield,
  Plug,
  Link2,
  BarChart3,
  Inbox,
  Sparkles,
  CheckSquare,
} from "lucide-react";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LeadsByClient } from "@/components/leads/LeadsByClient";
import { ClientSyncStatus } from "@/components/dashboard/ClientSyncStatus";
import { GhlLocationLink } from "@/components/integrations/GhlLocationLink";
import { MetaAccountsForClient } from "@/components/integrations/MetaAccountsForClient";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ClientInvitesPanel } from "@/components/clients/ClientInvitesPanel";
import { ClientTasksTab } from "@/components/clients/ClientTasksTab";
import { ClientGuaranteesPanel } from "@/components/guarantees/ClientGuaranteesPanel";
import { TrackingPanel } from "@/components/tracking/TrackingPanel";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type KpiStatus = "Good" | "Watch" | "Fix";

// Coerce possibly-null/undefined metric values to a finite number before
// formatting. Range/snapshot rows are loosely typed (`as any`) and a single
// null here would throw `.toFixed of null` and crash the whole page.
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fixed = (v: unknown, d = 2) => num(v).toFixed(d);

function cplTone(cpl: number) {
  if (cpl < 30) return "text-success";
  if (cpl <= 60) return "text-warning";
  return "text-destructive";
}

function StatusDot({ value }: { value: KpiStatus }) {
  const tone =
    value === "Good"
      ? "bg-success"
      : value === "Watch"
      ? "bg-warning"
      : "bg-destructive";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", tone)} />;
}

function KpiTile({
  label,
  value,
  benchmark,
  status,
  tone,
}: {
  label: string;
  value: string;
  benchmark?: string;
  status?: KpiStatus;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </p>
        {status && <StatusDot value={status} />}
      </div>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums text-foreground", tone)}>
        {value}
      </p>
      {benchmark && (
        <p className="text-[11px] text-muted-foreground mt-0.5">Target {benchmark}</p>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon?: typeof Users;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {Icon && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export default function ClientProfile() {
  return (
    <ErrorBoundary label="ClientProfile">
      <ClientProfileInner />
    </ErrorBoundary>
  );
}

function ClientProfileInner() {
  const { id } = useParams();
  const { data: client, isLoading } = useClient(Number(id));
  const { data: allCampaigns = [] } = useCampaigns();
  const { data: rangeCampaignsData = [] } = useClientCampaignsRange(Number(id));
  const { data: allActivity = [] } = useActivityLog();
  const { data: allLeads = [] } = useLeads();
  const { data: metaMappedSet } = useClientsWithMetaAccount();
  const { data: allClients = [] } = useClients();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const navigate = useNavigate();
  const clientPath = useClientPath();

  const [loading, setLoading] = useState<string | null>(null);
  const [showPause, setShowPause] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedAdset, setExpandedAdset] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [actFilter, setActFilter] = useState("All");
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editBmId, setEditBmId] = useState("");
  const [editBmAccountName, setEditBmAccountName] = useState("");
  const [editClickup, setEditClickup] = useState("");
  const [editIsAgency, setEditIsAgency] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const setAgencyAccount = useSetAgencyAccount();
  const qc = useQueryClient();
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setTab(t);
  }, [searchParams]);

  if (isLoading)
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!client)
    return <div className="p-10 text-center text-muted-foreground">Client not found</div>;

  const baseCampaigns = allCampaigns.filter((c) => c.clientId === String(client.id));
  // Range-driven: per-campaign metrics come ONLY from meta_insights_granular_daily for
  // the selected date range. Snapshot rows with no range activity render as zeroed for
  // time-bound metrics but remain visible so the user can still see them in the list.
  const rangeMap = new Map<string, RangeCampaignRow>();
  rangeCampaignsData.forEach((rc) => rangeMap.set(rc.id, rc));
  const baseIds = new Set(baseCampaigns.map((b) => b.id));
  const clientCampaigns = [
    ...baseCampaigns.map((b) => {
      const r = rangeMap.get(b.id);
      if (!r) {
        // No activity in selected range → zero out time-bound metrics, keep identity/status.
        return {
          ...b,
          spend: 0,
          leads: 0,
          trueLeads: 0,
          cpl: 0,
          trueCpl: 0,
          cpm: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          frequency: 0,
          adSets: 0,
          ads: 0,
          adSetsDetail: [] as RangeCampaignRow["adSets"],
        };
      }
      return {
        ...b,
        spend: r.spend,
        leads: r.leads,
        trueLeads: r.leads,
        cpl: r.cpl,
        trueCpl: r.cpl,
        cpm: r.cpm,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
        frequency: r.frequency || 0,
        adSets: r.adSets.length,
        ads: r.adSets.reduce((n, s) => n + s.ads.length, 0),
        adSetsDetail: r.adSets,
      };
    }),
    // Campaigns surfaced only by range data (e.g. new campaigns not yet in the snapshot table)
    ...rangeCampaignsData
      .filter((r) => !baseIds.has(r.id))
      .map((r) => ({
        id: r.id,
        clientId: String(client.id),
        name: r.name,
        status: "active" as const,
        spend: r.spend,
        leads: r.leads,
        trueLeads: r.leads,
        cpl: r.cpl,
        trueCpl: r.cpl,
        cpm: r.cpm,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
        frequency: r.frequency,
        adSets: r.adSets.length,
        ads: r.adSets.reduce((n, s) => n + s.ads.length, 0),
        doubleCount: false,
        issuesStatus: null,
        adSetsDetail: r.adSets,
      })),
  ];
  const activeCampaigns = clientCampaigns.filter((c) => c.status === "active");
  const clientActivity = allActivity.filter((a) => a.client_id === client.id);
  const clientLeads = allLeads.filter((l) => l.client_id === client.id);
  const filteredActivity =
    actFilter === "All"
      ? clientActivity
      : clientActivity.filter((a) => a.type === actFilter.toLowerCase());

  // Live aggregates from range data (Meta insights), ACTIVE campaigns only.
  // Paused/ended campaigns still appear in the list below but don't dilute averages.
  const agg = activeCampaigns.reduce(
    (a, c: any) => {
      a.spend += Number(c.spend) || 0;
      a.leads += Number(c.trueLeads ?? c.leads) || 0;
      a.impressions += Number(c.impressions) || 0;
      a.clicks += Number(c.clicks) || 0;
      a.freqSum += (Number(c.frequency) || 0) * (Number(c.spend) || 0);
      a.cpmSum += (Number(c.cpm) || 0) * (Number(c.spend) || 0);
      return a;
    },
    { spend: 0, leads: 0, impressions: 0, clicks: 0, freqSum: 0, cpmSum: 0 },
  );
  const hasLiveData = agg.spend > 0 || agg.leads > 0 || agg.impressions > 0;
  const liveSpend = hasLiveData ? agg.spend : client.spend;
  const liveLeads = hasLiveData ? agg.leads : client.leads;
  const liveCpl = liveLeads > 0 ? liveSpend / liveLeads : client.cpl;
  const liveCpm = hasLiveData && agg.spend > 0 ? agg.cpmSum / agg.spend : client.cpm;
  const liveFreq = hasLiveData && agg.spend > 0 ? agg.freqSum / agg.spend : client.frequency;
  const liveCvr = client.formCvr; // form CVR still snapshot-sourced


  const isMetaMapped = !!(metaMappedSet?.has(client.id) || client.bmId);
  const isGhlMapped = !!client.ghlLocationId;
  const isSyncing = (isMetaMapped || isGhlMapped) && !hasLiveData;

  const kpis: { label: string; value: string; benchmark?: string; status: KpiStatus; tone?: string }[] = [
    {
      label: "CPL",
      value: `$${liveCpl.toFixed(2)}`,
      benchmark: "< $30",
      status: liveCpl < 30 ? "Good" : liveCpl <= 60 ? "Watch" : "Fix",
      tone: cplTone(liveCpl),
    },
    ...(client.doubleCount
      ? [
          {
            label: "True CPL",
            value: `$${client.trueCpl.toFixed(2)}`,
            benchmark: "< $30",
            status: (client.trueCpl < 30 ? "Good" : client.trueCpl <= 60 ? "Watch" : "Fix") as KpiStatus,
            tone: cplTone(client.trueCpl),
          },
        ]
      : []),
    {
      label: "Leads MTD",
      value: String(liveLeads),
      benchmark: "50+",
      status: liveLeads >= 50 ? "Good" : liveLeads >= 20 ? "Watch" : "Fix",
    },
    {
      label: "Spend",
      value: `$${Math.round(liveSpend).toLocaleString()}`,
      status: "Good",
    },
    {
      label: "CPM",
      value: `$${liveCpm.toFixed(2)}`,
      benchmark: "< $120",
      status: liveCpm < 120 ? "Good" : "Watch",
    },
    {
      label: "Form CVR",
      value: `${liveCvr.toFixed(2)}%`,
      benchmark: "> 15%",
      status: liveCvr > 15 ? "Good" : liveCvr >= 10 ? "Watch" : "Fix",
    },
    {
      label: "Frequency",
      value: liveFreq.toFixed(2),
      benchmark: "< 3.0",
      status: liveFreq < 3 ? "Good" : liveFreq <= 4 ? "Watch" : "Fix",
    },
  ];

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setLoading(key);
    try {
      await fn();
      toast.success(key === "Sync" ? "Sync started" : `${key} completed`);
      if (key === "Sync") {
        // Refresh client/campaign data once the background sync has had a moment.
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["clients"] });
          qc.invalidateQueries({ queryKey: ["client"] });
          qc.invalidateQueries({ queryKey: ["campaigns"] });
          qc.invalidateQueries({ queryKey: ["client-campaigns-range"] });
        }, 3000);
      }
    } catch (e: any) {
      toast.error(`${key} failed: ${e?.message || "unknown error"}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Dashboard
        </Link>
        <span>/</span>
        <Link to="/clients" className="hover:text-foreground">
          Clients
        </Link>
        <span>/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              to="/clients"
              className="mt-1 text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Back to clients"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {client.bmId ? (
                  <a
                    href={`https://business.facebook.com/home/accounts?business_id=${client.bmId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                    title="Open in Meta Business Manager"
                  >
                    <h1 className="text-2xl font-semibold text-foreground group-hover:text-primary truncate">
                      {client.name}
                    </h1>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <h1 className="text-2xl font-semibold text-foreground truncate">
                    {client.name}
                  </h1>
                )}
                <StatusBadge status={client.status} />
                {isSyncing && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 text-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    title={`Mapped to ${[isMetaMapped && "Meta", isGhlMapped && "GHL"].filter(Boolean).join(" + ")} but no data in this date range yet.`}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" /> Syncing
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {client.bmAccountName || client.brand}
                {client.bmType ? ` · ${client.bmType}` : ""}
                {client.plaiConnected ? " · Plai connected" : ""}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                ${Math.round(liveSpend).toLocaleString()} spend · Last synced just now
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker />
            <button
              onClick={() => {
                setEditName(client.name || "");
                setEditBrand(client.brand || "");
                setEditBmId(client.bmId || "");
                setEditBmAccountName(client.bmAccountName || "");
                setEditClickup((client as any).clickupListId || "");
                setEditIsAgency(!!(client as any).isAgencyAccount);
                setEditOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => handleAction("Audit", () => api.runAudit(String(client.id)))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-2 text-sm text-purple-foreground hover:bg-purple/90 transition-colors disabled:opacity-50"
              disabled={loading === "Audit"}
            >
              {loading === "Audit" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Run Audit
            </button>
            <button
              onClick={() => handleAction("Sync", () => api.syncMetaAds(String(client.id)))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={loading === "Sync"}
            >
              {loading === "Sync" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} />
          ))}
        </div>

        {/* CRM sync health */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ClientSyncStatus clientId={client.id} />
          <GhlLocationLink clientId={client.id} currentLocationId={client.ghlLocationId} variant="panel" />
        </div>

        {client.doubleCount && (
          <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">
              <strong>Double-counting detected:</strong> Reported {client.reportedLeads} vs true{" "}
              {client.trueLeads} leads (+
              {fixed(((num(client.reportedLeads) - num(client.trueLeads)) / Math.max(num(client.trueLeads), 1)) * 100, 0)}
              % inflation). Fix: remove Lead pixel from post-form redirect.
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto p-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5">
            <Target className="h-3.5 w-3.5" /> Campaigns
            <span className="ml-1 text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">
              {activeCampaigns.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> Leads
          </TabsTrigger>
          <TabsTrigger value="tracking" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Tracking
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <Plug className="h-3.5 w-3.5" /> Integrations
          </TabsTrigger>
          <TabsTrigger value="guarantees" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Guarantees
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Access
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" /> Tasks & Notes
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ActivityIcon className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Agent
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <SectionCard
                title="Active Campaigns"
                icon={Target}
                right={
                  <button
                    onClick={() => setTab("campaigns")}
                    className="text-xs text-primary hover:underline"
                  >
                    View all
                  </button>
                }
              >
                {activeCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active campaigns.</p>
                ) : (
                  <div className="space-y-2">
                    {activeCampaigns.slice(0, 4).map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-border px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${num(c.spend)} spend · {num((c as any).clicks)} clicks · {fixed((c as any).ctr)}% CTR · {c.trueLeads} leads ·{" "}
                            <span className={cplTone(num(c.trueCpl))}>
                              ${fixed(c.trueCpl)} CPL
                            </span>
                          </p>
                        </div>
                        {c.doubleCount && (
                          <span className="text-[10px] font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                            DC
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Recent Leads" icon={Inbox}>
                {clientLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {clientLeads.slice(0, 6).map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between text-sm py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{l.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.date} · {l.stage}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            l.status === "closed"
                              ? "bg-success/15 text-success"
                              : l.status === "new"
                              ? "bg-primary/15 text-primary"
                              : "bg-accent text-muted-foreground"
                          )}
                        >
                          {l.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Actions rail */}
            <aside className="space-y-5">
              <SectionCard title="Quick Actions">
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      handleAction("Form Swap", () => api.swapForm(String(client.id)))
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    disabled={loading === "Form Swap"}
                  >
                    {loading === "Form Swap" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Swap Lead Form
                  </button>
                  <button
                    onClick={() =>
                      handleAction(
                        "Scale",
                        () =>
                          api.scaleBudget(
                            String(client.id),
                            clientCampaigns.map((c) => c.id)
                          )
                      )
                    }
                    className="w-full rounded-lg bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50"
                    disabled={loading === "Scale"}
                  >
                    Scale Budget 20%
                  </button>
                  <button
                    onClick={() => setShowPause(true)}
                    className="w-full rounded-lg border border-destructive text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10"
                  >
                    Pause All Campaigns
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note…"
                    className="min-h-[60px] text-sm"
                  />
                  {noteText && (
                    <button
                      onClick={() => {
                        toast.success("Note saved");
                        setNoteText("");
                      }}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
                    >
                      Save Note
                    </button>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="External Links" icon={Link2}>
                <div className="space-y-1">
                  {[
                    {
                      label: "Open in Meta Ads",
                      url: client.bmId
                        ? `https://business.facebook.com/adsmanager/manage/campaigns?business_id=${client.bmId}`
                        : null,
                      hint: "Link a Business Manager first",
                    },
                    {
                      label: "View in GHL",
                      url: client.ghlLocationId
                        ? `https://app.gohighlevel.com/v2/location/${client.ghlLocationId}/dashboard`
                        : null,
                      hint: "Link a GHL sub-account first",
                    },
                    {
                      label: "View in Plai",
                      url: client.plaiConnected ? "https://app.plai.io" : null,
                      hint: "Not connected to Plai",
                    },
                  ].map((l) =>
                    l.url ? (
                      <a
                        key={l.label}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between text-sm text-muted-foreground hover:text-foreground py-1.5"
                      >
                        <span>{l.label}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <div
                        key={l.label}
                        title={l.hint}
                        className="flex items-center justify-between text-sm text-muted-foreground/50 py-1.5 cursor-not-allowed"
                      >
                        <span>{l.label}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </div>
                    ),
                  )}
                </div>
              </SectionCard>
            </aside>
          </div>
        </TabsContent>

        {/* CAMPAIGNS */}
        <TabsContent value="campaigns" className="mt-5">
          <SectionCard
            title="Campaigns"
            icon={Target}
            right={
              <span className="text-xs text-muted-foreground">
                {activeCampaigns.length} active · {clientCampaigns.length} total
              </span>
            }
          >
            {clientCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns for this client.</p>
            ) : (
              <div className="space-y-2">
                {clientCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedCampaign(expandedCampaign === c.id ? null : c.id)
                      }
                      className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ${num(c.spend)} spend · {num((c as any).clicks)} clicks · {fixed((c as any).ctr)}% CTR · {c.trueLeads} leads ·{" "}
                          <span className={cplTone(num(c.trueCpl))}>
                            ${fixed(c.trueCpl)} CPL
                          </span>{" "}
                          · {c.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.doubleCount && (
                          <span className="text-[10px] font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                            DC
                          </span>
                        )}
                        {expandedCampaign === c.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {expandedCampaign === c.id && (
                      <div className="border-t border-border p-3 space-y-3 bg-muted/30">
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground">Clicks</span>
                            <p className="font-semibold tabular-nums">{num((c as any).clicks).toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CTR</span>
                            <p className="font-semibold tabular-nums">{fixed((c as any).ctr)}%</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CPM</span>
                            <p className="font-semibold tabular-nums">${fixed(c.cpm)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Frequency</span>
                            <p className="font-semibold tabular-nums">{fixed(c.frequency)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Ad Sets</span>
                            <p className="font-semibold tabular-nums">{c.adSets}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Ads</span>
                            <p className="font-semibold tabular-nums">{c.ads}</p>
                          </div>
                        </div>
                        {c.doubleCount && (
                          <p className="text-xs text-destructive">
                            ⚠ True CPL: ${fixed(c.trueCpl)} (reported inflated)
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() =>
                              handleAction("Pause", () =>
                                api.pauseCampaigns(String(client.id), [c.id]),
                              )
                            }
                            disabled={loading === "Pause"}
                            className="rounded bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/20 disabled:opacity-50"
                          >
                            {loading === "Pause" ? "Pausing…" : "Pause"}
                          </button>
                          <button
                            onClick={() =>
                              handleAction("Scale", () =>
                                api.scaleBudget(String(client.id), [c.id]),
                              )
                            }
                            disabled={loading === "Scale"}
                            className="rounded bg-success/10 text-success px-2.5 py-1 text-xs font-medium hover:bg-success/20 disabled:opacity-50"
                          >
                            {loading === "Scale" ? "Scaling…" : "Scale 20%"}
                          </button>
                          {client.bmId ? (
                            <a
                              href={`https://business.facebook.com/adsmanager/manage/campaigns?business_id=${client.bmId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded bg-accent text-muted-foreground px-2.5 py-1 text-xs font-medium hover:text-foreground inline-flex items-center gap-1"
                            >
                              View in Meta <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <button
                              disabled
                              title="Link a Business Manager to open this in Meta"
                              className="rounded bg-accent text-muted-foreground px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1 opacity-50 cursor-not-allowed"
                            >
                              View in Meta <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Ad sets + ads breakdown (range-aware) */}
                        {(c as any).adSetsDetail && (c as any).adSetsDetail.length > 0 ? (
                          <div className="space-y-2 pt-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Ad sets ({(c as any).adSetsDetail.length})
                            </p>
                            {(c as any).adSetsDetail.map((as: any) => (
                              <div key={as.id} className="rounded border border-border bg-card">
                                <button
                                  onClick={() => setExpandedAdset(expandedAdset === as.id ? null : as.id)}
                                  className="w-full flex items-center justify-between p-2.5 text-left hover:bg-accent/40"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{as.name}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      ${fixed(as.spend, 0)} · {num(as.clicks)} clicks · {num(as.impressions) > 0 ? fixed((num(as.clicks) / num(as.impressions)) * 100) : "0.00"}% CTR · {as.leads} leads ·{" "}
                                      <span className={cplTone(num(as.cpl))}>${fixed(as.cpl)} CPL</span> · {(as.ads || []).length} ads
                                    </p>
                                  </div>
                                  {expandedAdset === as.id ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </button>
                                {expandedAdset === as.id && (
                                  <div className="border-t border-border p-2 space-y-1.5 bg-muted/20">
                                    {(as.ads || []).length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground">No ads in range.</p>
                                    ) : (
                                      (as.ads || []).map((ad: any) => (
                                        <div key={ad.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-accent/40">
                                          <p className="text-[11px] font-medium text-foreground truncate min-w-0">{ad.name}</p>
                                          <p className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                                            ${fixed(ad.spend, 0)} · {num(ad.clicks)} clicks · {fixed(ad.ctr)}% CTR · {ad.leads}L ·{" "}
                                            <span className={cplTone(num(ad.cpl))}>${fixed(ad.cpl)}</span>
                                          </p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground pt-2">
                            No ad set / ad breakdown for the selected range.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* LEADS */}
        <TabsContent value="leads" className="mt-5">
          <LeadsByClient clientId={client.id} />
        </TabsContent>

        {/* TRACKING */}
        <TabsContent value="tracking" className="mt-5">
          <TrackingPanel clientId={client.id} title={`Tracking · ${client.name}`} />
        </TabsContent>

        {/* INTEGRATIONS */}
        <TabsContent value="integrations" className="mt-5 space-y-4">
          <ErrorBoundary label="Integrations tab">
          {(() => {
            const sorted = [...allClients].sort((a, b) =>
              (a.brand || a.name).localeCompare(b.brand || b.name)
            );
            const idx = sorted.findIndex((c) => String(c.id) === String(client.id));
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
            return (
              <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Plug className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0">Integrations for</span>
                  <select
                    value={String(client.id)}
                    onChange={(e) => navigate(clientPath(e.target.value, "?tab=integrations"))}
                    className="text-sm font-semibold bg-background border border-border rounded-md px-2 py-1 max-w-[260px] truncate"
                    aria-label="Switch client"
                  >
                    {sorted.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.brand || c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!prev}
                    onClick={() => prev && navigate(clientPath(prev.id, "?tab=integrations"))}
                    className="h-8 text-xs"
                  >
                    ← Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!next}
                    onClick={() => next && navigate(clientPath(next.id, "?tab=integrations"))}
                    className="h-8 text-xs"
                  >
                    Next →
                  </Button>
                </div>
              </div>
            );
          })()}

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold">Meta Ads</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sync ad accounts, campaigns, and insights from Meta Business Manager.
                </p>
              </div>
              <button
                onClick={() => handleAction("Sync", () => api.syncMetaAds(String(client.id)))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={loading === "Sync"}
              >
                {loading === "Sync" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync now
              </button>
            </div>
            <MetaAccountsForClient clientId={client.id} />
            {client.bmId && (
              <p className="text-xs text-muted-foreground mt-3">
                Business Manager:{" "}
                <a
                  href={`https://business.facebook.com/home/accounts?business_id=${client.bmId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {client.bmAccountName || client.bmId}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3">
              <h3 className="text-base font-semibold">GoHighLevel (CRM)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Link this client to a GHL sub-account so appointments and pipeline data flow in.
              </p>
            </div>
            <GhlLocationLink
              clientId={client.id}
              currentLocationId={client.ghlLocationId}
              variant="panel"
            />
            <div className="mt-4">
              <ClientSyncStatus clientId={client.id} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2">
              <h3 className="text-base font-semibold">Advanced mapping</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage all client ↔ ad account ↔ CRM links across the workspace.
              </p>
            </div>
            <Link
              to="/settings?tab=mapping"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              Open Integration Mapper
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          </ErrorBoundary>
        </TabsContent>


        {/* GUARANTEES */}
        <TabsContent value="guarantees" className="mt-5">
          <ClientGuaranteesPanel
            clientId={client.id}
            client={{ leads: client.leads, spend: client.spend }}
          />
        </TabsContent>

        {/* ACCESS */}
        <TabsContent value="access" className="mt-5">
          <ClientInvitesPanel
            clientId={client.id}
            workspaceId={(client as any).workspace_id ?? null}
            clientName={client.name}
          />
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="tasks" className="mt-5">
          <ClientTasksTab clientId={client.id} />
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <SectionCard
            title="Activity Log"
            icon={ActivityIcon}
            right={
              <div className="flex gap-1 flex-wrap">
                {["All", "Audit", "Budget", "Campaign", "Tracking"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setActFilter(f)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs",
                      actFilter === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            }
          >
            {filteredActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No activity logged yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {filteredActivity.map((a) => (
                  <li key={a.id} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{a.timestamp}</span>
                      <span>·</span>
                      <span className="font-medium text-foreground">{a.author}</span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5">{a.action}</p>
                    {a.result && (
                      <p className="text-xs text-muted-foreground mt-0.5">{a.result}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        {/* AI AGENT */}
        <TabsContent value="ai" className="mt-5">
          {workspaceId ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <AgentChat
                  key={`${workspaceId}-${client.id}`}
                  workspaceId={workspaceId}
                  clientId={client.id}
                  contextLabel={client.name}
                  suggestions={[
                    `Audit ${client.name}'s ad performance`,
                    "Pause the worst-performing ads to lower CPM",
                    "Which ad sets should I scale up?",
                    "Generate this month's report",
                    "Compare these creatives against my other clients",
                    "What's killing the CPL right now?",
                  ]}
                  className="h-[calc(100vh-18rem)]"
                />
              </div>
              <div className="space-y-4">
                <AiInsightsFeed workspaceId={workspaceId} clientId={client.id} showScan={false} limit={20} />
                <PendingActionsPanel workspaceId={workspaceId} clientId={client.id} />
                <ClientContextPanel clientId={client.id} />
                <AiRulesPanel clientId={client.id} workspaceId={workspaceId} />
                <KnowledgeBasePanel workspaceId={workspaceId} clientId={client.id} clientName={client.name} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Workspace not loaded.</p>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showPause} onOpenChange={setShowPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Pause All Campaigns
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will pause all active campaigns for {client.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                handleAction("Pause", () =>
                  api.pauseCampaigns(
                    String(client.id),
                    clientCampaigns.map((c) => c.id)
                  )
                )
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand">Brand</Label>
              <Input id="edit-brand" value={editBrand} onChange={(e) => setEditBrand(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-bmid">Business Manager ID</Label>
              <Input id="edit-bmid" value={editBmId} onChange={(e) => setEditBmId(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-bmname">BM Account Name</Label>
              <Input id="edit-bmname" value={editBmAccountName} onChange={(e) => setEditBmAccountName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-clickup">ClickUp List ID</Label>
              <Input id="edit-clickup" value={editClickup} onChange={(e) => setEditClickup(e.target.value)} placeholder="Optional" />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editIsAgency}
                onChange={(e) => setEditIsAgency(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-sm">
                This is our agency's own account
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Pins it to the top of the dashboard and keeps it visible even with no campaign activity. Only one client per workspace can be the agency account.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!editName.trim() || !editBrand.trim()) {
                  toast.error("Name and brand are required");
                  return;
                }
                setSavingEdit(true);
                const { error } = await supabase
                  .from("clients")
                  .update({
                    name: editName.trim(),
                    brand: editBrand.trim(),
                    bm_id: editBmId.trim() || null,
                    bm_account_name: editBmAccountName.trim() || null,
                    clickup_list_id: editClickup.trim() || null,
                  })
                  .eq("id", client.id);
                if (!error && editIsAgency !== !!(client as any).isAgencyAccount) {
                  try {
                    await setAgencyAccount.mutateAsync({ clientId: client.id, value: editIsAgency });
                  } catch (e: any) {
                    setSavingEdit(false);
                    toast.error(`Failed to update agency account: ${e?.message || "unknown error"}`);
                    return;
                  }
                }
                setSavingEdit(false);
                if (error) {
                  toast.error(`Failed to save: ${error.message}`);
                  return;
                }
                toast.success("Client updated");
                setEditOpen(false);
                qc.invalidateQueries({ queryKey: ["clients"] });
                qc.invalidateQueries({ queryKey: ["client"] });
              }}
              disabled={savingEdit}
            >
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
