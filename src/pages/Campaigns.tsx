import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useClients, useCampaigns } from "@/hooks/useDatabase";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StatusFilter = "All" | "Active" | "Paused" | "Issues Only";

function getCPLColor(cpl: number) {
  if (cpl < 30) return "text-success";
  if (cpl <= 60) return "text-warning";
  return "text-destructive";
}

export default function Campaigns() {
  const { data: clients = [] } = useClients();
  const { data: campaignData = [], isLoading } = useCampaigns();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [dcDismissed, setDcDismissed] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const getClient = (clientId: string) => clients.find(c => c.id === Number(clientId));

  const filtered = useMemo(() => {
    let list = campaignData;
    if (statusFilter === "Active") list = list.filter(c => c.status === "active");
    if (statusFilter === "Paused") list = list.filter(c => c.status !== "active");
    if (statusFilter === "Issues Only") list = list.filter(c => c.doubleCount || c.trueCpl > 60);
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || getClient(c.clientId)?.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [campaignData, clients, statusFilter, search]);

  const dcCampaigns = campaignData.filter(c => c.doubleCount);
  const flaggedForPause = campaignData.filter(c => c.trueCpl > 60 && c.status === "active");

  const handlePause = async (campaignId: string) => {
    const camp = campaignData.find(c => c.id === campaignId);
    if (!camp) return;
    setLoading(campaignId);
    try {
      await api.pauseCampaigns(camp.clientId, [campaignId]);
      toast.success("Campaign paused");
    } catch { toast.error("Failed to pause"); }
    finally { setLoading(null); setPauseTarget(null); }
  };

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading campaigns...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">{campaignData.filter(c => c.status === "active").length} active</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(["All", "Active", "Paused", "Issues Only"] as StatusFilter[]).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", statusFilter === f ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground")}>{f}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..." className="h-8 w-56 pl-8 text-xs" />
        </div>
      </div>

      {dcCampaigns.length > 0 && !dcDismissed && (
        <div className="flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="flex-1 text-sm text-destructive"><strong>Double-counting detected</strong> on {dcCampaigns.length} campaigns. True CPL is higher than reported.</p>
          <button onClick={() => setDcDismissed(true)}><X className="h-4 w-4 text-destructive/60 hover:text-destructive" /></button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p>No campaigns match your filters</p>
          <button onClick={() => { setStatusFilter("All"); setSearch(""); }} className="text-primary text-sm hover:underline mt-1">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map(c => {
            const cl = getClient(c.clientId);
            return (
              <Link key={c.id} to={`/client/${c.clientId}`} className="rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-colors block">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {cl && <span className="text-xs font-medium text-primary">{cl.name}</span>}
                    <p className="text-sm font-medium text-foreground mt-0.5">{c.name}</p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", c.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{c.status}</span>
                </div>
                <div className="grid grid-cols-5 gap-2 text-xs mt-3">
                  <div><span className="text-muted-foreground">Spend</span><p className="font-semibold text-foreground">${c.spend.toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground">Leads</span><p className="font-semibold text-foreground">{c.trueLeads}</p></div>
                  <div><span className="text-muted-foreground">True CPL</span><p className={cn("font-semibold", getCPLColor(c.trueCpl))}>${c.trueCpl.toFixed(2)}</p></div>
                  <div><span className="text-muted-foreground">CPM</span><p className="font-semibold text-foreground">${c.cpm.toFixed(2)}</p></div>
                  <div><span className="text-muted-foreground">Freq</span><p className="font-semibold text-foreground">{c.frequency}</p></div>
                </div>
                {c.doubleCount && <p className="text-xs text-destructive font-medium mt-2">⚠ True CPL: ${c.trueCpl.toFixed(2)}</p>}
              </Link>
            );
          })}
        </div>
      )}

      {flaggedForPause.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Flagged for Pause</h3>
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{flaggedForPause.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-accent/50">
              {["Campaign", "Client", "Spend", "True Leads", "True CPL", "Reason", "Action"].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody>
              {flaggedForPause.map(c => {
                const cl = getClient(c.clientId);
                return (
                  <tr key={c.id} className="border-b border-border">
                    <td className="px-4 py-2.5 text-foreground font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cl?.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">${c.spend}</td>
                    <td className="px-4 py-2.5 tabular-nums">{c.trueLeads}</td>
                    <td className={cn("px-4 py-2.5 font-semibold tabular-nums", getCPLColor(c.trueCpl))}>${c.trueCpl.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-xs text-destructive">CPL &gt; $60</td>
                    <td className="px-4 py-2.5">
                      <button onClick={e => { e.preventDefault(); setPauseTarget(c.id); }} className="rounded bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/20">
                        {loading === c.id ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}Confirm Pause ⏸
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!pauseTarget} onOpenChange={() => setPauseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="text-destructive">Pause Campaign</AlertDialogTitle><AlertDialogDescription>Are you sure you want to pause this campaign?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pauseTarget && handlePause(pauseTarget)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
