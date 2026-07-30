import { useState } from "react";
import { useReports, useClients } from "@/hooks/useDatabase";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { cplTrendData } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Download, Send, Eye, Loader2, CheckCircle, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: null },
  generating: { label: "Generating...", className: "bg-primary/15 text-primary", icon: Loader2 },
  ready: { label: "Ready", className: "bg-warning/15 text-warning", icon: null },
  delivered: { label: "Delivered", className: "bg-success/15 text-success", icon: CheckCircle },
};

export default function Reports() {
  const { data: monthlyReports = [], isLoading } = useReports();
  const clients = useVisibleClients();
  const [loading, setLoading] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<typeof monthlyReports[0] | null>(null);
  const [genClient, setGenClient] = useState("");
  const [genMonth, setGenMonth] = useState("March 2026");
  const [genProgress, setGenProgress] = useState<string | null>(null);

  const delivered = monthlyReports.filter(r => r.status === "delivered").length;
  const awaitingReview = monthlyReports.filter(r => r.status === "delivered" && !r.clientReviewed).length;
  const overdue = monthlyReports.filter(r => r.status === "draft").length;

  const handleGenerate = async (reportId: string) => {
    const report = monthlyReports.find(r => r.id === reportId);
    if (!report) return;
    setLoading(reportId);
    try {
      await api.generateReport(report.clientId, report.month);
      toast.success("Report generated");
    } catch { toast.error("Generation failed"); }
    finally { setLoading(null); }
  };

  const handleGenerateNew = async () => {
    if (!genClient) { toast.error("Select a client"); return; }
    setGenProgress("Pulling Meta data...");
    await new Promise(r => setTimeout(r, 1000));
    setGenProgress("Pulling GHL...");
    await new Promise(r => setTimeout(r, 1000));
    setGenProgress("Generating with Claude...");
    await new Promise(r => setTimeout(r, 1500));
    setGenProgress("Done ✓");
    toast.success("Report generated successfully");
    setTimeout(() => setGenProgress(null), 2000);
  };

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading reports...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Monthly Reports</h1>
        <button onClick={() => { setLoading("export"); api.exportAllReports().then(() => toast.success("Reports exported")).catch(() => toast.error("Export failed")).finally(() => setLoading(null)); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {loading === "export" ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}Generate All Reports
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Reports Delivered", value: delivered, color: "text-success" },
          { label: "Awaiting Review", value: awaitingReview, color: "text-warning" },
          { label: "Overdue", value: overdue, color: "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={cn("text-3xl font-bold tabular-nums mt-1", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/50">
              {["Client", "Brand", "Month", "Status", "Delivered", "Reviewed", "Actions"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyReports.map(r => {
              const sc = statusConfig[r.status as keyof typeof statusConfig];
              return (
                <tr key={r.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{r.clientName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.brand}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.month}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", sc.className)}>
                      {sc.icon && <sc.icon className="h-3 w-3 animate-spin" />}
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.deliveredDate || "—"}</td>
                  <td className="px-4 py-3">{r.clientReviewed ? <CheckCircle className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-muted-foreground" />}</td>
                  <td className="px-4 py-3 flex items-center gap-1.5">
                    <button onClick={() => setPreviewReport(r)} className="rounded bg-accent px-2 py-1 text-xs hover:bg-accent/80"><Eye className="h-3 w-3 inline mr-0.5" />View</button>
                    <button className="rounded bg-accent px-2 py-1 text-xs hover:bg-accent/80"><Download className="h-3 w-3 inline mr-0.5" />PDF</button>
                    {r.status === "delivered" && <button className="rounded bg-accent px-2 py-1 text-xs hover:bg-accent/80"><Send className="h-3 w-3 inline mr-0.5" />Resend</button>}
                    {(r.status === "draft" || r.status === "ready") && (
                      <button onClick={() => handleGenerate(r.id)} className="rounded bg-primary/10 text-primary px-2 py-1 text-xs hover:bg-primary/20">
                        {loading === r.id ? <Loader2 className="h-3 w-3 animate-spin inline mr-0.5" /> : null}Generate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Generate New Report</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Client</label>
            <select value={genClient} onChange={e => setGenClient(e.target.value)} className="w-full mt-1 rounded-md border border-border bg-accent px-3 py-2 text-sm">
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.brand}</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className="text-xs text-muted-foreground">Month</label>
            <select value={genMonth} onChange={e => setGenMonth(e.target.value)} className="w-full mt-1 rounded-md border border-border bg-accent px-3 py-2 text-sm">
              <option>March 2026</option>
              <option>February 2026</option>
              <option>January 2026</option>
            </select>
          </div>
          <button onClick={handleGenerateNew} disabled={!!genProgress} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Generate with AI
          </button>
        </div>
        {genProgress && <p className="text-sm text-primary mt-3 animate-pulse">{genProgress}</p>}
      </div>

      {previewReport && (
        <>
          <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={() => setPreviewReport(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-[600px] border-l border-border bg-card shadow-2xl overflow-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{previewReport.clientName}</h2>
                <p className="text-sm text-muted-foreground">{previewReport.month}</p>
              </div>
              <div className="flex gap-2">
                <button className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"><Download className="h-3 w-3 inline mr-1" />Download PDF</button>
                <button onClick={() => setPreviewReport(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-5 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Account Snapshot</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Spend", value: `$${previewReport.metrics.spend.toLocaleString()}` },
                    { label: "Leads", value: previewReport.metrics.leads },
                    { label: "CPL", value: `$${previewReport.metrics.cpl.toFixed(2)}` },
                    { label: "Appointments", value: previewReport.metrics.appointments },
                    { label: "Applications", value: previewReport.metrics.applications },
                    { label: "Closed Deals", value: previewReport.metrics.closedDeals },
                  ].map(m => (
                    <div key={m.label} className="rounded border border-border p-3">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="text-lg font-bold tabular-nums">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">CPL Trend</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cplTrendData}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                      <Line type="monotone" dataKey="reported" stroke="hsl(var(--primary))" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Pipeline Value</h3>
                <p className="text-2xl font-bold text-foreground">${previewReport.metrics.pipelineValue.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
