import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientPortalData } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { TrendingUp, Filter, Calendar, FileText, DollarSign, LogOut, ChevronDown, MessageSquare, Pencil, Check, X, Bot, Play, LayoutDashboard, type LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useClientEmbeds } from "@/hooks/useClientEmbeds";
import { EmbedFrame } from "@/components/portal/EmbedFrame";

function DeltaBadge({ delta, type }: { delta: number; type: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", type === "positive" ? "text-success" : "text-destructive")}>
      <TrendingUp className="h-3 w-3" />+{delta}%
    </span>
  );
}

const kpiIcons = { newLeads: Filter, appointmentsSet: Calendar, applications: FileText, closedDeals: DollarSign };
const kpiLabels = { newLeads: "New Leads", appointmentsSet: "Appointments Set", applications: "Applications", closedDeals: "Closed Deals" };
const appointmentSources = ["Booked by AI", "Appointment Setter", "Direct From Ad"] as const;

const pipelineColors = ["#f97316", "#ea6f10", "#db5b00", "#c74f00", "#b34400"];

export default function ClientPortal() {
  const d = clientPortalData;
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingField, setEditingField] = useState<{ name: string; field: string } | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [leadOverrides, setLeadOverrides] = useState<Record<string, Record<string, string>>>({});

  const saveNote = (leadName: string) => {
    setLeadNotes(prev => ({ ...prev, [leadName]: noteDraft }));
    setEditingNote(null);
    setNoteDraft("");
  };

  const saveField = (leadName: string, field: string) => {
    setLeadOverrides(prev => ({ ...prev, [leadName]: { ...(prev[leadName] || {}), [field]: fieldDraft } }));
    setEditingField(null);
    setFieldDraft("");
  };

  const getFieldValue = (leadName: string, field: string, original: string) => leadOverrides[leadName]?.[field] || original;

  // Determine status
  const status = d.performance.cpl < d.performance.cplTarget ? "GREEN" : "YELLOW";
  const statusText = status === "GREEN" ? "performing well" : "needs attention";
  const statusColor = status === "GREEN" ? "text-success" : "text-warning";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">G</div>
            <span className="text-sm font-semibold text-foreground">{d.brand}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Powered by GFunnel</span>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-6 py-10 space-y-8">
        {/* Hero */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Good morning, {d.clientName.split(" ")[0]}! 👋</h1>
          <p className="mt-1">
            <span className="text-muted-foreground">Your campaigns are </span>
            <span className={cn("font-semibold", statusColor)}>{statusText}</span>
          </p>
          <p className="text-muted-foreground text-sm mt-0.5">{d.month}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {(Object.entries(d.kpis) as [keyof typeof d.kpis, typeof d.kpis.newLeads][]).map(([key, kpi]) => {
            const Icon = kpiIcons[key];
            const isAppointments = key === "appointmentsSet";
            return (
              <div key={key} className={cn("rounded-lg border border-border bg-card p-5", key === "closedDeals" && "bg-success/10 border-success/30")}>
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">{kpiLabels[key]}</span>
                </div>
                <p className="text-[40px] font-bold tabular-nums text-foreground leading-none">{kpi.value}</p>
                <div className="flex items-center gap-2 mt-2">
                  <DeltaBadge delta={kpi.delta} type={kpi.deltaType} />
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
                {isAppointments && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="mt-3 flex items-center gap-1.5 rounded-md border border-border bg-accent/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full">
                        <span className="truncate">{selectedSource || "Select source"}</span>
                        <ChevronDown className="h-3 w-3 ml-auto shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-1" align="start">
                      {appointmentSources.map(source => (
                        <button key={source} onClick={() => setSelectedSource(source)} className={cn("w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent", selectedSource === source && "bg-accent font-medium text-foreground")}>{source}</button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>

        {/* Pipeline Flow */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline</h3>
          <div className="flex items-stretch gap-1">
            {d.pipeline.map((stage, i) => {
              const nextStage = d.pipeline[i + 1];
              const convRate = nextStage ? ((nextStage.count / stage.count) * 100).toFixed(0) : null;
              return (
                <div key={stage.stage} className="flex-1 rounded-lg p-4 text-center transition-transform hover:scale-[1.02]" style={{ backgroundColor: pipelineColors[i] + "20", borderBottom: `3px solid ${pipelineColors[i]}` }}>
                  <p className="text-xs text-muted-foreground mb-1">{stage.stage}</p>
                  <p className="text-2xl font-bold tabular-nums text-foreground">{stage.count}</p>
                  {convRate && <p className="text-xs text-muted-foreground mt-1">{convRate}% →</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cost Per Lead</p>
            <p className={cn("text-2xl font-bold tabular-nums mt-1", d.performance.cpl < d.performance.cplTarget ? "text-success" : "text-destructive")}>${d.performance.cpl.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Target: below ${d.performance.cplTarget}</p>
            <div className="mt-2 h-2 w-full rounded-full bg-accent overflow-hidden">
              <div className={cn("h-full rounded-full", d.performance.cpl < d.performance.cplTarget ? "bg-success" : "bg-destructive")} style={{ width: `${Math.min((d.performance.cplTarget / d.performance.cpl) * 100, 100)}%` }} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ad Spend (MTD)</p>
            <p className="text-2xl font-bold tabular-nums text-foreground mt-1">${d.performance.adSpend.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Budget: ${d.performance.adBudget.toLocaleString()}/mo</p>
            <div className="mt-2 h-2 w-full rounded-full bg-accent overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(d.performance.adSpend / d.performance.adBudget) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Est. Pipeline Value</p>
            <p className="text-2xl font-bold tabular-nums text-foreground mt-1">${d.performance.estimatedPipelineValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{d.kpis.closedDeals.value} closed × $15k avg commission</p>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent Leads</h3>
            <a href="#" className="text-xs text-primary hover:underline">View all in GHL →</a>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                {["Name", "Date", "Stage", "Phone", "Status", "Notes"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.recentLeads.map(lead => {
                const isEditingThis = editingField?.name === lead.name;
                return (
                  <tr key={lead.name} className="border-b border-border group hover:bg-accent/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{lead.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {isEditingThis && editingField?.field === "date" ? (
                        <span className="flex items-center gap-1">
                          <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} className="h-7 w-24 text-xs" autoFocus onKeyDown={e => e.key === "Enter" && saveField(lead.name, "date")} />
                          <button onClick={() => saveField(lead.name, "date")} className="text-success hover:text-success/80"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 group/cell">
                          {getFieldValue(lead.name, "date", lead.date)}
                          <button onClick={() => { setEditingField({ name: lead.name, field: "date" }); setFieldDraft(getFieldValue(lead.name, "date", lead.date)); }} className="opacity-0 group-hover/cell:opacity-100 group-hover:opacity-60 hover:!opacity-100 transition-opacity"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditingThis && editingField?.field === "stage" ? (
                        <span className="flex items-center gap-1">
                          <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} className="h-7 w-32 text-xs" autoFocus onKeyDown={e => e.key === "Enter" && saveField(lead.name, "stage")} />
                          <button onClick={() => saveField(lead.name, "stage")} className="text-success hover:text-success/80"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1.5 group/cell",
                          lead.stage === "Closed" ? "bg-success/15 text-success" :
                          lead.stage === "New Lead" ? "bg-primary/15 text-primary" :
                          "bg-accent text-muted-foreground"
                        )}>
                          {getFieldValue(lead.name, "stage", lead.stage)}
                          <button onClick={() => { setEditingField({ name: lead.name, field: "stage" }); setFieldDraft(getFieldValue(lead.name, "stage", lead.stage)); }} className="opacity-0 group-hover/cell:opacity-100 group-hover:opacity-60 hover:!opacity-100 transition-opacity"><Pencil className="h-3 w-3" /></button>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {isEditingThis && editingField?.field === "phone" ? (
                        <span className="flex items-center gap-1">
                          <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} className="h-7 w-32 text-xs" autoFocus onKeyDown={e => e.key === "Enter" && saveField(lead.name, "phone")} />
                          <button onClick={() => saveField(lead.name, "phone")} className="text-success hover:text-success/80"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 group/cell">
                          {getFieldValue(lead.name, "phone", lead.phone)}
                          <button onClick={() => { setEditingField({ name: lead.name, field: "phone" }); setFieldDraft(getFieldValue(lead.name, "phone", lead.phone)); }} className="opacity-0 group-hover/cell:opacity-100 group-hover:opacity-60 hover:!opacity-100 transition-opacity"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                        lead.status === "Won" ? "bg-success/15 text-success" :
                        lead.status === "New" ? "bg-primary/15 text-primary" :
                        "bg-accent text-muted-foreground"
                      )}>{lead.status}</span>
                    </td>
                    <td className="px-5 py-3">
                      {editingNote === lead.name ? (
                        <div className="flex flex-col gap-1.5">
                          <Textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} className="min-h-[60px] text-xs resize-none" placeholder="Add a note..." autoFocus />
                          <div className="flex gap-1">
                            <button onClick={() => saveNote(lead.name)} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90">Save</button>
                            <button onClick={() => { setEditingNote(null); setNoteDraft(""); }} className="rounded bg-accent px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                          </div>
                        </div>
                      ) : leadNotes[lead.name] ? (
                        <button onClick={() => { setEditingNote(lead.name); setNoteDraft(leadNotes[lead.name]); }} className="text-xs text-muted-foreground hover:text-foreground text-left max-w-[150px] truncate" title={leadNotes[lead.name]}>{leadNotes[lead.name]}</button>
                      ) : (
                        <button onClick={() => { setEditingNote(lead.name); setNoteDraft(""); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><MessageSquare className="h-3 w-3" /> Add note</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Monthly Summary */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">{d.month} Summary</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            March has been a strong month for {d.brand}. Lead volume increased significantly with {d.kpis.newLeads.value} new leads generated at a cost per lead of ${d.performance.cpl.toFixed(2)}, well under the ${d.performance.cplTarget} target. {d.kpis.closedDeals.value} deals closed, contributing to an estimated pipeline value of ${d.performance.estimatedPipelineValue.toLocaleString()}.
          </p>
          <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Download Full Report PDF
          </button>
        </div>

        {/* AI Account Manager */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-10 w-10 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Your AI Account Manager</h3>
              <p className="text-xs text-muted-foreground mt-1">Ask questions about your campaigns, leads, or results</p>
              <button className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
                <Play className="h-4 w-4" /> Start a Call
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
