import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, Inbox, Search } from "lucide-react";
import { useChannelLeads, useUpdateLead, type LeadChannel, type LeadStage, type ChannelLead } from "@/hooks/useChannelLeads";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { ManualLeadImport } from "./ManualLeadImport";

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

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function exportCSV(leads: ChannelLead[], channel: LeadChannel) {
  const headers = ["created_time","name","email","phone","stage","campaign","form","note"];
  const rows = leads.map((l) => [
    l.created_time ?? "",
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
  const update = useUpdateLead(channel);
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ChannelLead | null>(null);

  const counts = useMemo(() => {
    const c = { intake: 0, in_progress: 0, converted: 0 };
    for (const l of leads) c[l.stage]++;
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (!s) return true;
      return [l.full_name, l.email, l.phone, l.campaign_name, l.form_name]
        .some((v) => v?.toLowerCase().includes(s));
    });
  }, [leads, stage, search]);

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
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => exportCSV(filtered, channel)} disabled={!filtered.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export
        </Button>
        {channel === "manual" && <ManualLeadImport />}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Inbox className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {channel === "meta"
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
                  <th className="text-left font-medium px-3 py-2">Date</th>
                  <th className="text-left font-medium px-3 py-2">Name</th>
                  <th className="text-left font-medium px-3 py-2">Contact</th>
                  <th className="text-left font-medium px-3 py-2">Campaign</th>
                  <th className="text-left font-medium px-3 py-2">Stage</th>
                  <th className="text-right font-medium px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-accent/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(l.created_time)}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{l.full_name || "—"}</td>
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
                ))}
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
