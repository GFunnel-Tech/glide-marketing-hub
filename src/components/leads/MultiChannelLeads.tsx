import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, Inbox, Search, Copy, Users } from "lucide-react";
import { useChannelLeads, useUpdateLead, type LeadChannel, type LeadStage, type ChannelLead } from "@/hooks/useChannelLeads";
import { useClients } from "@/hooks/useDatabase";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { ManualLeadImport } from "./ManualLeadImport";
import { MetaLeadImport } from "./MetaLeadImport";

const CHANNELS: { value: LeadChannel; label: string }[] = [
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "manual", label: "Manual" },
];

const STAGES: { value: LeadStage | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "intake", label: "Intake" },
  { value: "in_progress", label: "In Progress" },
  { value: "converted", label: "Converted" },
];

const stageBadgeClass: Record<LeadStage, string> = {
  intake: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  converted: "bg-success/15 text-success border-success/30",
};

// Tinted chips so each client is visually distinct
const CLIENT_CHIPS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30",
];
const chipFor = (id: number | null) =>
  id == null ? "bg-muted text-muted-foreground border-border" : CLIENT_CHIPS[id % CLIENT_CHIPS.length];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const normEmail = (e: string | null) => (e ?? "").trim().toLowerCase();
const normPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
};

function exportCSV(leads: ChannelLead[], channel: LeadChannel, clientName: (id: number | null) => string) {
  const headers = ["created_time","client","name","email","phone","stage","campaign","form","note"];
  const rows = leads.map((l) => [
    l.created_time ?? "",
    clientName(l.client_id),
    l.full_name ?? "",
    l.email ?? "",
    l.phone ?? "",
    l.stage,
    l.campaign_name ?? "",
    l.form_name ?? "",
    (l.note ?? "").replace(/\n/g, " "),
  ]);
  const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [headers, ...rows].map((r) => r.map((c) => escape(String(c))).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${channel}-leads-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ChannelPanel({ channel, clientId }: { channel: LeadChannel; clientId?: number }) {
  const { data: leads = [], isLoading } = useChannelLeads(channel, clientId);
  const { data: clients = [] } = useClients();
  const update = useUpdateLead(channel);
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [dupsOnly, setDupsOnly] = useState(false);
  const [groupByClient, setGroupByClient] = useState(false);
  const [active, setActive] = useState<ChannelLead | null>(null);

  const clientMap = useMemo(() => {
    const m = new Map<number, { name: string; brand?: string }>();
    for (const c of clients) m.set(c.id as number, { name: c.name, brand: (c as any).brand });
    return m;
  }, [clients]);
  const clientLabel = (id: number | null) =>
    id == null ? "Unassigned" : clientMap.get(id)?.brand || clientMap.get(id)?.name || `Client #${id}`;

  // Duplicate detection — group by normalized email OR normalized phone
  const dupKeys = useMemo(() => {
    const byEmail = new Map<string, string[]>();
    const byPhone = new Map<string, string[]>();
    for (const l of leads) {
      const e = normEmail(l.email);
      const p = normPhone(l.phone);
      if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(l.id);
      if (p) (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(l.id);
    }
    const dupIds = new Set<string>();
    const groupCount = new Map<string, number>(); // leadId -> group size
    const groupKey = new Map<string, string>(); // leadId -> normalized key used
    for (const [k, ids] of byEmail) if (ids.length > 1) ids.forEach((id) => { dupIds.add(id); groupCount.set(id, Math.max(groupCount.get(id) ?? 0, ids.length)); groupKey.set(id, `e:${k}`); });
    for (const [k, ids] of byPhone) if (ids.length > 1) ids.forEach((id) => { dupIds.add(id); groupCount.set(id, Math.max(groupCount.get(id) ?? 0, ids.length)); if (!groupKey.has(id)) groupKey.set(id, `p:${k}`); });
    return { dupIds, groupCount, groupKey };
  }, [leads]);

  const counts = useMemo(() => {
    const c = { intake: 0, in_progress: 0, converted: 0 };
    for (const l of leads) c[l.stage]++;
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (clientFilter !== "all") {
        if (clientFilter === "unassigned" ? l.client_id != null : String(l.client_id) !== clientFilter) return false;
      }
      if (dupsOnly && !dupKeys.dupIds.has(l.id)) return false;
      if (!s) return true;
      return [l.full_name, l.email, l.phone, l.campaign_name, l.form_name, clientLabel(l.client_id)]
        .some((v) => v?.toLowerCase().includes(s));
    });
  }, [leads, stage, search, clientFilter, dupsOnly, dupKeys, clientMap]);

  // Sort: group by client when toggled, then by dup-group together, then date desc
  const ordered = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (groupByClient) {
        const ca = clientLabel(a.client_id).toLowerCase();
        const cb = clientLabel(b.client_id).toLowerCase();
        if (ca !== cb) return ca < cb ? -1 : 1;
      }
      const ka = dupKeys.groupKey.get(a.id) ?? "~";
      const kb = dupKeys.groupKey.get(b.id) ?? "~";
      if (ka !== kb) return ka < kb ? -1 : 1;
      const ta = a.created_time ? Date.parse(a.created_time) : 0;
      const tb = b.created_time ? Date.parse(b.created_time) : 0;
      return tb - ta;
    });
    return arr;
  }, [filtered, groupByClient, dupKeys, clientMap]);

  const totalDups = dupKeys.dupIds.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((s) => {
          const count = s.value === "all" ? leads.length : counts[s.value];
          return (
            <button
              key={s.value}
              onClick={() => setStage(s.value)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                stage === s.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label} <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <Users className="h-3.5 w-3.5 mr-1.5 opacity-60" />
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {clients.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.brand || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={() => setDupsOnly((v) => !v)}
          disabled={totalDups === 0}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            dupsOnly
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
          title={totalDups === 0 ? "No duplicates detected" : "Show only leads that share an email or phone"}
        >
          <Copy className="inline h-3 w-3 mr-1" />
          Duplicates <span className="ml-1 opacity-70">{totalDups}</span>
        </button>

        <button
          onClick={() => setGroupByClient((v) => !v)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            groupByClient
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          Group by client
        </button>

        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads, clients…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => exportCSV(ordered, channel, clientLabel)} disabled={!ordered.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export
        </Button>
        {channel === "manual" && <ManualLeadImport />}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : ordered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Inbox className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {dupsOnly
                ? "No duplicate leads in the current view."
                : channel === "meta"
                ? "No Meta leads yet — connect a page or run a sync."
                : channel === "manual"
                ? "No manual leads yet — import a CSV to get started."
                : `No ${channel} leads yet — channel sync coming soon.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Client</th>
                  <th className="text-left font-medium px-3 py-2">Date</th>
                  <th className="text-left font-medium px-3 py-2">Name</th>
                  <th className="text-left font-medium px-3 py-2">Contact</th>
                  <th className="text-left font-medium px-3 py-2">Campaign</th>
                  <th className="text-left font-medium px-3 py-2">Stage</th>
                  <th className="text-right font-medium px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordered.map((l, i) => {
                  const isDup = dupKeys.dupIds.has(l.id);
                  const dupSize = dupKeys.groupCount.get(l.id) ?? 0;
                  const prev = ordered[i - 1];
                  const newClientGroup =
                    groupByClient && (!prev || prev.client_id !== l.client_id);
                  return (
                    <tr
                      key={l.id}
                      className={`hover:bg-accent/30 ${isDup ? "bg-destructive/[0.04]" : ""} ${
                        newClientGroup ? "border-t-2 border-t-primary/30" : ""
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium max-w-[160px] truncate ${chipFor(
                            l.client_id,
                          )}`}
                          title={clientLabel(l.client_id)}
                        >
                          {clientLabel(l.client_id)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {fmtDate(l.created_time)}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{l.full_name || "—"}</span>
                          {isDup && (
                            <span
                              className="inline-flex items-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              title="Shares an email or phone with another lead in this view"
                            >
                              <Copy className="h-2.5 w-2.5 mr-0.5" />
                              dup ×{dupSize}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {l.email && <span>{l.email}</span>}
                          {l.phone && <span>{l.phone}</span>}
                          {!l.email && !l.phone && "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {l.campaign_name || "—"}
                        {l.form_name && <div className="opacity-70">{l.form_name}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={l.stage}
                          onValueChange={(v) => update.mutate({ id: l.id, patch: { stage: v as LeadStage } })}
                        >
                          <SelectTrigger className={`h-7 w-[120px] text-xs border ${stageBadgeClass[l.stage]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="intake">Intake</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setActive(l)}>
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                          {l.note && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">note</Badge>}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LeadDetailDrawer channel={channel} lead={active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

export function MultiChannelLeads({ clientId }: { clientId?: number }) {
  const [channel, setChannel] = useState<LeadChannel>("meta");
  return (
    <Tabs value={channel} onValueChange={(v) => setChannel(v as LeadChannel)} className="space-y-4">
      <TabsList>
        {CHANNELS.map((c) => (
          <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
        ))}
      </TabsList>
      {CHANNELS.map((c) => (
        <TabsContent key={c.value} value={c.value} className="mt-0">
          {channel === c.value && <ChannelPanel channel={c.value} clientId={clientId} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}
