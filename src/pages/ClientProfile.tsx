import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useClient, useCampaigns, useActivityLog, useLeads } from "@/hooks/useDatabase";
import { cplTrendData, pipelineData, auditResults } from "@/data/mockData";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { cn } from "@/lib/utils";
import { ArrowLeft, ExternalLink, RefreshCw, Pencil, AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getCPLColor(cpl: number) {
  if (cpl < 30) return "text-success";
  if (cpl <= 60) return "text-warning";
  return "text-destructive";
}

function StatusPill({ value }: { value: "Good" | "Watch" | "Fix" }) {
  const colors = { Good: "bg-success/15 text-success", Watch: "bg-warning/15 text-warning", Fix: "bg-destructive/15 text-destructive" };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", colors[value])}>{value}</span>;
}

export default function ClientProfile() {
  const { id } = useParams();
  const { data: client, isLoading } = useClient(Number(id));
  const { data: allCampaigns = [] } = useCampaigns();
  const { data: allActivity = [] } = useActivityLog();
  const { data: allLeads = [] } = useLeads();
  const [loading, setLoading] = useState<string | null>(null);
  const [showPause, setShowPause] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [actFilter, setActFilter] = useState("All");

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading...</div>;
  if (!client) return <div className="p-10 text-center text-muted-foreground">Client not found</div>;

  const clientCampaigns = allCampaigns.filter(c => c.clientId === String(client.id));
  const activeCampaigns = clientCampaigns.filter(c => c.status === "active");
  const audit = auditResults.find(a => a.clientId === String(client.id));
  const clientPipeline = pipelineData.find(p => p.clientId === String(client.id));
  const clientActivity = allActivity.filter(a => a.client_id === client.id);
  const clientLeads = allLeads.filter(l => l.client_id === client.id);
  const filteredActivity = actFilter === "All" ? clientActivity : clientActivity.filter(a => a.type === actFilter.toLowerCase());

  const metrics = [
    { label: "CPL", value: `$${client.cpl.toFixed(2)}`, benchmark: "< $30", status: client.cpl < 30 ? "Good" : client.cpl <= 60 ? "Watch" : "Fix" },
    ...(client.doubleCount ? [{ label: "True CPL", value: `$${client.trueCpl.toFixed(2)}`, benchmark: "< $30", status: client.trueCpl < 30 ? "Good" : client.trueCpl <= 60 ? "Watch" : "Fix" }] : []),
    { label: "CPM", value: `$${client.cpm.toFixed(2)}`, benchmark: "< $120", status: client.cpm < 120 ? "Good" : "Watch" },
    { label: "Leads MTD", value: String(client.leads), benchmark: "50+", status: client.leads >= 50 ? "Good" : client.leads >= 20 ? "Watch" : "Fix" },
    { label: "Spend", value: `$${client.spend.toLocaleString()}`, benchmark: "—", status: "Good" },
    { label: "Form CVR", value: `${client.formCvr}%`, benchmark: "> 15%", status: client.formCvr > 15 ? "Good" : client.formCvr >= 10 ? "Watch" : "Fix" },
    { label: "Frequency", value: String(client.frequency), benchmark: "< 3.0", status: client.frequency < 3 ? "Good" : client.frequency <= 4 ? "Watch" : "Fix" },
    { label: "Double Count", value: client.doubleCount ? "Yes" : "No", benchmark: "No", status: client.doubleCount ? "Fix" : "Good" },
  ] as { label: string; value: string; benchmark: string; status: "Good" | "Watch" | "Fix" }[];

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setLoading(key);
    try { await fn(); toast.success(`${key} completed`); }
    catch { toast.error(`${key} failed`); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link to="/" className="hover:text-foreground">Dashboard</Link>
            <span>/</span>
            <Link to="/clients" className="hover:text-foreground">Clients</Link>
            <span>/</span>
            <span className="text-foreground">{client.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/clients" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
              <p className="text-sm text-muted-foreground">{client.brand}</p>
            </div>
            <StatusBadge status={client.status} />
            <span className="text-xs text-muted-foreground">{client.bmType}</span>
            {client.plaiConnected && <span className="h-2 w-2 rounded-full bg-success" title="Plai connected" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">${client.spend.toLocaleString()} spend · Last synced just now</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"><Pencil className="h-3.5 w-3.5 inline mr-1" />Edit</button>
          <button onClick={() => handleAction("Audit", () => api.runAudit(String(client.id)))} className="rounded-lg bg-purple px-3 py-2 text-sm text-purple-foreground hover:bg-purple/90 transition-colors">
            {loading === "Audit" ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}Run Audit
          </button>
          <button onClick={() => handleAction("Sync", () => api.syncMetaAds(String(client.id)))} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors">
            <RefreshCw className="h-3.5 w-3.5 inline mr-1" />Sync Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* LEFT COLUMN (3/5) */}
        <div className="col-span-3 space-y-6">
          {client.doubleCount && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                <strong>Double-counting:</strong> Reported {client.reportedLeads} leads vs true {client.trueLeads} leads (+{(((client.reportedLeads - client.trueLeads) / client.trueLeads) * 100).toFixed(0)}% inflation). Fix: remove Lead pixel from post-form redirect.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Performance Snapshot</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Metric</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Benchmark</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => (
                  <tr key={m.label} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{m.label}</td>
                    <td className={cn("py-2 font-semibold tabular-nums", m.label.includes("CPL") && getCPLColor(parseFloat(m.value.replace("$", ""))))}>{m.value}</td>
                    <td className="py-2 text-muted-foreground">{m.benchmark}</td>
                    <td className="py-2"><StatusPill value={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">30-Day CPL Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cplTrendData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  {client.doubleCount ? (
                    <>
                      <Line type="monotone" dataKey="reported" stroke="hsl(var(--primary))" strokeDasharray="5 5" dot={false} />
                      <Line type="monotone" dataKey="true" stroke="hsl(var(--destructive))" dot={false} />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="reported" stroke="hsl(var(--success))" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Active Campaigns</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{activeCampaigns.length}</span>
            </div>
            <div className="space-y-2">
              {activeCampaigns.map(c => (
                <div key={c.id} className="rounded-lg border border-border overflow-hidden">
                  <button onClick={() => setExpandedCampaign(expandedCampaign === c.id ? null : c.id)} className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors">
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${c.spend} spend · {c.trueLeads} leads · <span className={getCPLColor(c.trueCpl)}>${c.trueCpl.toFixed(2)} CPL</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.doubleCount && <span className="text-xs text-destructive font-medium">⚠ DC</span>}
                      {expandedCampaign === c.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {expandedCampaign === c.id && (
                    <div className="border-t border-border p-3 space-y-3">
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">CPM</span><p className="font-semibold">${c.cpm.toFixed(2)}</p></div>
                        <div><span className="text-muted-foreground">Frequency</span><p className="font-semibold">{c.frequency}</p></div>
                        <div><span className="text-muted-foreground">Ad Sets</span><p className="font-semibold">{c.adSets}</p></div>
                        <div><span className="text-muted-foreground">Ads</span><p className="font-semibold">{c.ads}</p></div>
                      </div>
                      {c.doubleCount && (
                        <p className="text-xs text-destructive">⚠ True CPL: ${c.trueCpl.toFixed(2)} (reported inflated)</p>
                      )}
                      <div className="flex gap-2">
                        <button className="rounded bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/20">Pause</button>
                        <button className="rounded bg-success/10 text-success px-2.5 py-1 text-xs font-medium hover:bg-success/20">Scale 20%</button>
                        <button className="rounded bg-accent text-muted-foreground px-2.5 py-1 text-xs font-medium hover:text-foreground flex items-center gap-1">View in Meta <ExternalLink className="h-3 w-3" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {clientPipeline && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Lead Pipeline</h3>
              <div className="flex items-center gap-2">
                {clientPipeline.stages.map((stage, i) => {
                  const next = clientPipeline.stages[i + 1];
                  const convRate = next ? ((next.count / stage.count) * 100).toFixed(0) : null;
                  return (
                    <div key={stage.name} className="flex items-center flex-1 gap-2">
                      <div className="flex-1 rounded-lg p-3 text-center transition-transform hover:scale-[1.02]" style={{ backgroundColor: stage.color + "20", borderLeft: `3px solid ${stage.color}` }}>
                        <p className="text-xs text-muted-foreground">{stage.name}</p>
                        <p className="text-xl font-bold tabular-nums text-foreground">{stage.count}</p>
                        {convRate && <p className="text-xs text-muted-foreground mt-1">{convRate}% →</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (2/5) */}
        <div className="col-span-2 space-y-6">
          {audit && (
            <div className={cn("rounded-lg border-2 p-5", audit.status === "RED" ? "border-destructive" : audit.status === "YELLOW" ? "border-warning" : "border-success")}>
              <h3 className="text-sm font-semibold text-foreground mb-3">Path to Green</h3>
              <p className="text-xs text-muted-foreground mb-3">{audit.pathToGreen}</p>
              <div className="space-y-2">
                {audit.priorityActions.map((a, i) => (
                  <label key={i} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 rounded border-border" defaultChecked={false} />
                    <div className="flex-1">
                      <p className="text-foreground">{a.text}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs bg-accent rounded px-1.5 py-0.5 text-muted-foreground">{a.owner}</span>
                        <span className={cn("text-xs rounded px-1.5 py-0.5",
                          a.status === "pending" ? "bg-warning/15 text-warning" :
                          a.status === "done" ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
                        )}>{a.status}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Timeline: {audit.estimatedTimeline}</p>
              <p className="text-xs text-muted-foreground">Last audit: {audit.date}</p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-5 space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <button onClick={() => handleAction("Form Swap", () => api.swapForm(String(client.id)))} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all">
              {loading === "Form Swap" ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}Swap Lead Form
            </button>
            <button onClick={() => handleAction("Audit", () => api.runAudit(String(client.id)))} className="w-full rounded-lg bg-purple px-3 py-2.5 text-sm font-medium text-purple-foreground hover:bg-purple/90 active:scale-[0.98] transition-all">
              {loading === "Audit" ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}Run Manus Audit
            </button>
            <button onClick={() => handleAction("Scale", () => api.scaleBudget(String(client.id), clientCampaigns.map(c => c.id)))} className="w-full rounded-lg bg-success px-3 py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90 active:scale-[0.98] transition-all">
              Scale Budget 20%
            </button>
            <button onClick={() => setShowPause(true)} className="w-full rounded-lg border border-destructive text-destructive px-3 py-2.5 text-sm font-medium hover:bg-destructive/10 active:scale-[0.98] transition-all">
              Pause All Campaigns
            </button>

            <div className="pt-2 border-t border-border mt-3 space-y-2">
              <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." className="min-h-[60px] text-sm" />
              {noteText && <button onClick={() => { toast.success("Note saved"); setNoteText(""); }} className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80">Save Note</button>}
            </div>

            <div className="pt-2 border-t border-border space-y-1">
              {[
                { label: "Open in Meta Ads", url: "#" },
                { label: "View in GHL", url: "#" },
                { label: "View in Plai", url: "#" },
              ].map(l => (
                <a key={l.label} href={l.url} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-1">
                  {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>

          {/* Leads */}
          {clientLeads.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Recent Leads</h3>
              <div className="space-y-2">
                {clientLeads.slice(0, 5).map(l => (
                  <div key={l.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <div>
                      <p className="font-medium text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.date} · {l.stage}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                      l.status === "closed" ? "bg-success/15 text-success" :
                      l.status === "new" ? "bg-primary/15 text-primary" :
                      "bg-accent text-muted-foreground"
                    )}>{l.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Activity Log</h3>
              <div className="flex gap-1">
                {["All", "Audit", "Budget", "Campaign", "Tracking"].map(f => (
                  <button key={f} onClick={() => setActFilter(f)} className={cn("px-2 py-0.5 rounded text-xs", actFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{f}</button>
                ))}
              </div>
            </div>
            {filteredActivity.length > 0 ? (
              <div className="space-y-3">
                {filteredActivity.map(a => (
                  <div key={a.id} className="border-b border-border pb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{a.timestamp}</span>
                      <span>·</span>
                      <span className="font-medium text-foreground">{a.author}</span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5">{a.action}</p>
                    {a.result && <p className="text-xs text-muted-foreground mt-0.5">{a.result}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No activity logged yet</p>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showPause} onOpenChange={setShowPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Pause All Campaigns</AlertDialogTitle>
            <AlertDialogDescription>This will pause all active campaigns for {client.name}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleAction("Pause", () => api.pauseCampaigns(String(client.id), clientCampaigns.map(c => c.id)))} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
