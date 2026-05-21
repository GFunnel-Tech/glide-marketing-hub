import { useMemo, useState } from "react";
import { useMetaAds, type MetaAd } from "@/hooks/useMetaAds";
import { useClients } from "@/hooks/useDatabase";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { ConnectMetaPrompt } from "@/components/dashboard/ConnectMetaPrompt";
import { AdActionsMenu } from "@/components/ads/AdActionsMenu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { CHANNEL_LABELS, type AdChannel } from "@/lib/adChannels";
import { cn } from "@/lib/utils";
import { ObjectivePickerModal } from "@/components/ads/builder/ObjectivePickerModal";
import { DateRangePicker } from "@/components/common/DateRangePicker";



export default function Ads() {
  const [channel, setChannel] = useState<AdChannel>("meta");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { hasConnection, isLoading: connLoading } = useHasActiveMetaConnection();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ads</h1>
          <p className="text-sm text-muted-foreground">Manage live ads across channels — duplicate winners, scale budgets, edit copy.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker />
          <Button onClick={() => setPickerOpen(true)} disabled={!hasConnection}>
            <Plus className="h-4 w-4 mr-1.5" /> New ad
          </Button>
        </div>
        <ObjectivePickerModal open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>


      <Tabs value={channel} onValueChange={(v) => setChannel(v as AdChannel)}>
        <TabsList>
          {(Object.keys(CHANNEL_LABELS) as AdChannel[]).map((c) => (
            <TabsTrigger key={c} value={c}>{CHANNEL_LABELS[c]}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="meta" className="mt-4">
          {connLoading ? null : !hasConnection ? <ConnectMetaPrompt /> : <MetaAdsTable />}
        </TabsContent>
        {(["google", "tiktok", "linkedin"] as AdChannel[]).map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <ComingSoon channel={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ComingSoon({ channel }: { channel: AdChannel }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <h3 className="text-base font-semibold text-foreground">{CHANNEL_LABELS[channel]} Ads coming soon</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Connect your {CHANNEL_LABELS[channel]} Ads account from Settings to enable sync and management here.
      </p>
    </div>
  );
}

function MetaAdsTable() {
  const { data: ads = [], isLoading } = useMetaAds();
  const { data: clients = [] } = useClients();
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<"all" | "active" | "paused">("all");
  const [clientF, setClientF] = useState("all");

  const rows = useMemo(() => {
    return ads.filter((a) => {
      if (clientF !== "all" && String(a.client_id) !== clientF) return false;
      if (statusF === "active" && a.effective_status !== "ACTIVE") return false;
      if (statusF === "paused" && a.effective_status !== "PAUSED") return false;
      if (q && !`${a.name ?? ""} ${a.campaign_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [ads, q, statusF, clientF]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ad or campaign…" className="h-8 pl-7 w-64" />
        </div>
        <select value={clientF} onChange={(e) => setClientF(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
          <option value="all">All clients</option>
          {clients.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        {(["all","active","paused"] as const).map((s) => (
          <button key={s} onClick={() => setStatusF(s)}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              statusF === s ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground")}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} of {ads.length}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Ad</th>
              <th className="text-left px-3 py-2 font-medium">Campaign / Ad set</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Spend</th>
              <th className="text-right px-3 py-2 font-medium">Leads</th>
              <th className="text-right px-3 py-2 font-medium">CPL</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No ads match.</td></tr>
            ) : rows.map((ad) => <Row key={ad.id} ad={ad} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ ad }: { ad: MetaAd }) {
  const status = ad.effective_status ?? "UNKNOWN";
  const tone =
    status === "ACTIVE" ? "bg-success/15 text-success" :
    status === "PAUSED" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning";
  return (
    <tr className="border-t border-border hover:bg-accent/30">
      <td className="px-3 py-2">
        <div className="font-medium text-foreground line-clamp-1">{ad.name ?? "(unnamed)"}</div>
        {ad.title && <div className="text-xs text-muted-foreground line-clamp-1">{ad.title}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        <div className="line-clamp-1">{ad.campaign_name ?? "—"}</div>
        <div className="line-clamp-1">{ad.adset_name ?? "—"}</div>
      </td>
      <td className="px-3 py-2"><span className={cn("inline-block rounded-md px-2 py-0.5 text-[11px] font-medium", tone)}>{status}</span></td>
      <td className="px-3 py-2 text-right tabular-nums">${Number(ad.spend).toFixed(0)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{ad.leads}</td>
      <td className="px-3 py-2 text-right tabular-nums">{ad.cpl > 0 ? `$${Number(ad.cpl).toFixed(2)}` : "—"}</td>
      <td className="px-1 py-2"><AdActionsMenu ad={ad} channel="meta" /></td>
    </tr>
  );
}
