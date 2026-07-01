import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { ClientKpiTile } from "@/components/client/ClientKpiTile";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { PortalTasksCard } from "@/components/portal/PortalTasksCard";
import { RequestCampaignDialog } from "@/components/portal/RequestCampaignDialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Sparkles, FileText, Plug, Calendar, Bot, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function cplTone(cpl: number) {
  if (cpl < 30) return "text-success";
  if (cpl <= 60) return "text-warning";
  return "text-destructive";
}
function statusOf(v: number, good: number, watch: number, higherBetter = false): "Good" | "Watch" | "Fix" {
  if (higherBetter) return v >= good ? "Good" : v >= watch ? "Watch" : "Fix";
  return v <= good ? "Good" : v <= watch ? "Watch" : "Fix";
}

export default function PortalDashboard() {
  const { clientId, client } = usePortalClient();

  const monthLeads = useQuery({
    queryKey: ["portal-month-leads", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const since = new Date(); since.setDate(1);
      const { count } = await supabase.from("meta_leads").select("id", { count: "exact", head: true })
        .eq("client_id", clientId!).gte("created_time", since.toISOString());
      return count ?? 0;
    },
  });

  if (!client) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const cpl = client.true_cpl ?? client.cpl ?? 0;
  const cpm = client.cpm ?? 0;
  const spend = client.spend ?? 0;
  const leads = monthLeads.data ?? client.leads ?? 0;
  const freq = client.frequency ?? 0;
  const cvr = (client.form_cvr ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header card — mirrors ClientProfile */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground truncate">{client.name}</h1>
              <StatusBadge status={client.status as any} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {client.brand}
              {(client as any).website ? <> · <a href={(client as any).website} target="_blank" rel="noreferrer" className="hover:underline">{(client as any).website}</a></> : null}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${spend.toLocaleString()} spend · MTD
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ClientKpiTile label="CPL" value={`$${cpl.toFixed(2)}`} benchmark="< $30" status={statusOf(cpl, 30, 60)} tone={cplTone(cpl)} />
          <ClientKpiTile label="Leads MTD" value={String(leads)} benchmark="50+" status={statusOf(leads, 50, 20, true)} />
          <ClientKpiTile label="Spend" value={`$${spend.toLocaleString()}`} />
          <ClientKpiTile label="CPM" value={`$${cpm.toFixed(2)}`} benchmark="< $120" status={statusOf(cpm, 120, 200)} />
          <ClientKpiTile label="Form CVR" value={`${(cvr * 100).toFixed(1)}%`} benchmark="> 15%" status={statusOf(cvr * 100, 15, 8, true)} />
          <ClientKpiTile label="Frequency" value={freq.toFixed(2)} benchmark="< 3.0" status={statusOf(freq, 3, 4)} />
        </div>
      </section>

      {/* Two-column: main + right rail (matches ClientProfile) */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">This month</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2"><dt className="text-muted-foreground">Reported leads</dt><dd className="tabular-nums font-medium">{client.reported_leads ?? 0}</dd></div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2"><dt className="text-muted-foreground">True leads</dt><dd className="tabular-nums font-medium">{client.true_leads ?? 0}</dd></div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2"><dt className="text-muted-foreground">Spend</dt><dd className="tabular-nums font-medium">${spend.toLocaleString()}</dd></div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2"><dt className="text-muted-foreground">Cost / lead</dt><dd className={cn("tabular-nums font-medium", cplTone(cpl))}>${cpl.toFixed(2)}</dd></div>
            </dl>
          </section>

          <PortalTasksCard clientId={clientId} />
        </div>

        {/* Right rail: Quick Actions + External Links (mirrors ClientProfile) */}
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <RequestCampaignDialog clientId={clientId} />
              <Button variant="outline" className="w-full" asChild>
                <Link to="/portal/reports"><FileText className="h-4 w-4 mr-2" /> Request a Report</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/portal/integrations"><Plug className="h-4 w-4 mr-2" /> Manage Integrations</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/portal/support"><Calendar className="h-4 w-4 mr-2" /> Book a Call</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-primary" /> External Links
            </h3>
            <div className="space-y-2 text-sm">
              <a className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent" href="https://agents.gfunnel.com" target="_blank" rel="noreferrer">
                <span className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI Assistant</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <Link className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent" to="/portal/documents">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
