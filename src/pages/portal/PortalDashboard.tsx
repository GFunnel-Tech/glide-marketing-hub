import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, Calendar, Bot, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { ClientGuaranteesPanel } from "@/components/guarantees/ClientGuaranteesPanel";



function KpiCard({ label, value, delta, sublabel }: { label: string; value: string; delta?: number; sublabel?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span className={cn("inline-flex items-center gap-1 font-medium",
            delta >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta >= 0 ? "+" : ""}{delta}%
          </span>
        )}
        {sublabel && <span className="text-muted-foreground">{sublabel}</span>}
      </div>
    </Card>
  );
}

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  const map = {
    GREEN: { cls: "bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]",
             msg: "Your account is performing well." },
    YELLOW: { cls: "bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]",
              msg: "Optimization in progress. Your account manager is on it." },
    RED: { cls: "bg-destructive/10 border-destructive/30 text-destructive",
           msg: "Your account needs attention. We're working on it." },
    BLOCKED: { cls: "bg-muted border-border text-muted-foreground", msg: "Account paused." },
  } as const;
  const cfg = map[status as keyof typeof map] ?? map.GREEN;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm font-medium", cfg.cls)}>
      {cfg.msg}
    </div>
  );
}

export default function PortalDashboard() {
  const { clientId, client } = usePortalClient();

  const monthLeads = useQuery({
    queryKey: ["portal-month-leads", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const since = new Date();
      since.setDate(1);
      const { count } = await supabase
        .from("meta_leads")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId!)
        .gte("created_time", since.toISOString());
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            {client ? `Welcome back, ${client.name.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening with your account today.</p>
        </div>
        <DateRangePicker />
      </div>


      <StatusBanner status={client?.status} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Spend (MTD)" value={`$${(client?.spend ?? 0).toLocaleString()}`} sublabel="this month" />
        <KpiCard label="Leads (MTD)" value={`${monthLeads.data ?? client?.leads ?? 0}`} sublabel="from Meta" />
        <KpiCard label="Cost / Lead" value={`$${(client?.true_cpl ?? client?.cpl ?? 0).toFixed(2)}`} sublabel="true CPL" />
        <KpiCard label="Bookings" value="—" sublabel="connect GHL to track" />
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="outline" className="h-auto justify-start py-4">
            <Link to="/portal/creative"><Upload className="mr-2 h-4 w-4" /> Upload creative</Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start py-4">
            <Link to="/portal/approvals"><CheckCircle2 className="mr-2 h-4 w-4" /> Review approvals</Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start py-4">
            <Link to="/portal/support"><Calendar className="mr-2 h-4 w-4" /> Book a call</Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start py-4">
            <a href="https://agents.gfunnel.com" target="_blank" rel="noreferrer">
              <Bot className="mr-2 h-4 w-4" /> Ask AI Assistant
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">This week</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">CPM</dt><dd className="tabular-nums">${(client?.cpm ?? 0).toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Frequency</dt><dd className="tabular-nums">{(client?.frequency ?? 0).toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Form CVR</dt><dd className="tabular-nums">{((client?.form_cvr ?? 0) * 100).toFixed(1)}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Reported leads</dt><dd className="tabular-nums">{client?.reported_leads ?? 0}</dd></div>
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Pending items</h3>
          <p className="text-sm text-muted-foreground">You're all caught up. We'll notify you when something needs your review.</p>
        </Card>
      </div>
    </div>
  );
}
