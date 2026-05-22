import { X, ExternalLink } from "lucide-react";
import { Client, campaigns, notes } from "@/data/mockData";
import { useLeads } from "@/hooks/useDatabase";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const tabs = ["Overview", "Campaigns", "Leads", "Actions"] as const;

export function ClientDrawer({ client, onClose }: { client: Client; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>("Overview");
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [pauseInput, setPauseInput] = useState("");

  const { data: allLeads = [] } = useLeads();
  const clientLeads = allLeads.filter(l => l.client_id === client.id);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{client.name}</h2>
            <p className="text-sm text-muted-foreground">{client.brand}</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={client.status} />
              {client.doubleCount && (
                <Tooltip>
                  <TooltipTrigger>
                    <span className="rounded bg-destructive/15 text-destructive px-1.5 py-0.5 text-[10px] font-bold">DC</span>
                  </TooltipTrigger>
                  <TooltipContent>Double-counting detected</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 text-xs text-muted-foreground">
              <span className="bg-accent rounded px-1.5 py-0.5">${client.cpl} CPL</span>
              <span className="bg-accent rounded px-1.5 py-0.5">{client.leads} leads</span>
              <span className="bg-accent rounded px-1.5 py-0.5">{client.formCvr.toFixed(2)}% CVR</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last audited: {client.lastAudit}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {activeTab === "Overview" && (
            <div className="space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Metric</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Benchmark</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {[
                    ["CPL", `$${client.cpl}`, "< $30"],
                    ...(client.doubleCount ? [["True CPL", `$${client.trueCpl}`, "< $30"]] : []),
                    ["CPM", `$${client.cpm}`, "< $120"],
                    ["Leads (MTD)", client.leads, "50+"],
                    ["Form CVR", `${client.formCvr.toFixed(2)}%`, "> 15%"],
                    ["Frequency", client.frequency, "< 3.0"],
                  ].map(([m, v, b]) => (
                    <tr key={String(m)} className="border-b border-border">
                      <td className="py-2 text-muted-foreground">{m}</td>
                      <td className="py-2 font-semibold tabular-nums">{v}</td>
                      <td className="py-2 text-muted-foreground">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {client.status !== "GREEN" && (
                <div className="rounded-lg bg-success/10 border border-success/20 p-4">
                  <p className="text-sm italic text-success">
                    Path to green: Improve form CVR above 15% and reduce CPL below $30 by optimizing creative and narrowing audience targeting.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "Campaigns" && (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${c.spend} spend · {c.leads} leads · ${c.cpl.toFixed(2)} CPL
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-medium rounded-full px-2 py-0.5",
                    c.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  )}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "Leads" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Recent leads for {client.name}</p>
                <a href="#" className="text-xs text-primary hover:underline flex items-center gap-1">View all in GHL <ExternalLink className="h-3 w-3" /></a>
              </div>
              {clientLeads.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 text-xs font-medium">Name</th>
                      <th className="pb-2 text-xs font-medium">Date</th>
                      <th className="pb-2 text-xs font-medium">Stage</th>
                      <th className="pb-2 text-xs font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientLeads.map(l => (
                      <tr key={l.id} className="border-b border-border">
                        <td className="py-2 text-foreground font-medium">{l.name}</td>
                        <td className="py-2 text-muted-foreground">{l.date}</td>
                        <td className="py-2 text-muted-foreground">{l.stage}</td>
                        <td className="py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                            l.status === "closed" ? "bg-success/15 text-success" :
                            l.status === "new" ? "bg-primary/15 text-primary" :
                            "bg-accent text-muted-foreground"
                          )}>{l.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground italic">No leads found for this client</p>
              )}
            </div>
          )}

          {activeTab === "Actions" && (
            <div className="space-y-3">
              <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Swap Lead Form
              </button>
              <button className="w-full rounded-lg bg-purple px-4 py-2.5 text-sm font-medium text-purple-foreground hover:bg-purple/90 transition-colors">
                Run Manus Audit
              </button>
              <button
                onClick={() => setShowPauseDialog(true)}
                className="w-full rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Pause All Campaigns
              </button>
              <button
                onClick={() => setShowScaleDialog(true)}
                className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90 transition-colors"
              >
                Scale Budget 20%
              </button>
              <button className="w-full rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
                Add Note
              </button>

              <Link to={`/client/${client.id}`} className="w-full rounded-lg border border-primary text-primary px-4 py-2.5 text-sm font-medium hover:bg-primary/10 transition-colors flex items-center justify-center gap-2" onClick={onClose}>
                Open Full Profile <ExternalLink className="h-3.5 w-3.5" />
              </Link>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</h4>
                  <Link to={`/client/${client.id}`} className="text-xs text-primary hover:underline" onClick={onClose}>View Full Activity Log →</Link>
                </div>
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{n.timestamp}</span>
                      <span>·</span>
                      <span className="font-medium text-foreground">{n.author}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pause confirmation */}
      <AlertDialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Pause All Campaigns</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause all active campaigns for {client.name}. Type <strong>PAUSE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={pauseInput} onChange={(e) => setPauseInput(e.target.value)} placeholder="Type PAUSE" />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPauseInput("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pauseInput !== "PAUSE"} onClick={() => setPauseInput("")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scale confirmation */}
      <AlertDialog open={showScaleDialog} onOpenChange={setShowScaleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scale Budget 20%</AlertDialogTitle>
            <AlertDialogDescription>
              This will increase {client.name}'s ad budget by 20%. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-success text-success-foreground hover:bg-success/90">
              Confirm Scale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
