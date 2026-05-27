import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, Calendar, Bot, Activity, DollarSign, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { ClientGuaranteesPanel } from "@/components/guarantees/ClientGuaranteesPanel";

const TONE = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  pink: "bg-destructive/10 text-destructive",
} as const;

function KpiCard({
  label, value, sublabel, Icon, tone,
}: { label: string; value: string; sublabel?: string; Icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  const map = {
    GREEN: { cls: "bg-success/10 border-success/30 text-success", msg: "Your account is performing well." },
    YELLOW: { cls: "bg-warning/10 border-warning/30 text-warning", msg: "Optimization in progress. Your account manager is on it." },
    RED: { cls: "bg-destructive/10 border-destructive/30 text-destructive", msg: "Your account needs attention. We're working on it." },
    BLOCKED: { cls: "bg-muted border-border text-muted-foreground", msg: "Account paused." },
  } as const;
  const cfg = map[status as keyof typeof map] ?? map.GREEN;
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", cfg.cls)}>
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

  const actions = [
    { to: "/portal/creative", label: "Upload creative", Icon: Upload },
    { to: "/portal/approvals", label: "Review approvals", Icon: CheckCircle2 },
    { to: "/portal/support", label: "Book a call", Icon: Calendar },
    { to: "https://agents.gfunnel.com", label: "Ask AI Assistant", Icon: Bot, external: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {client ? `Welcome back, ${client.name.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening with your account today.</p>
        </div>
        <DateRangePicker />
      </div>

      <StatusBanner status={client?.status} />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Spend (MTD)" value={`$${(client?.spend ?? 0).toLocaleString()}`} sublabel="this month" Icon={DollarSign} tone="blue" />
        <KpiCard label="Leads (MTD)" value={`${monthLeads.data ?? client?.leads ?? 0}`} sublabel="from Meta" Icon={Activity} tone="green" />
        <KpiCard label="Cost / Lead" value={`$${(client?.true_cpl ?? client?.cpl ?? 0).toFixed(2)}`} sublabel="true CPL" Icon={Target} tone="amber" />
        <KpiCard label="Bookings" value="—" sublabel="connect GHL" Icon={Users} tone="pink" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ to, label, Icon, external }) => (
            <Button
              key={label}
              asChild
              variant="outline"
              className="h-auto justify-start py-3 px-4 border-border hover:border-primary/40 hover:bg-accent"
            >
              {external ? (
                <a href={to} target="_blank" rel="noreferrer">
                  <Icon className="mr-2 h-4 w-4 text-primary" /> {label}
                </a>
              ) : (
                <Link to={to}>
                  <Icon className="mr-2 h-4 w-4 text-primary" /> {label}
                </Link>
              )}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">This week</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">CPM</dt><dd className="tabular-nums">${(client?.cpm ?? 0).toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Frequency</dt><dd className="tabular-nums">{(client?.frequency ?? 0).toFixed(2)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Form CVR</dt><dd className="tabular-nums">{((client?.form_cvr ?? 0) * 100).toFixed(1)}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Reported leads</dt><dd className="tabular-nums">{client?.reported_leads ?? 0}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-2">Pending items</h3>
          <p className="text-sm text-muted-foreground">You're all caught up. We'll notify you when something needs your review.</p>
        </div>
      </div>

      {clientId && (
        <ClientGuaranteesPanel
          clientId={clientId}
          client={{ leads: client?.leads, spend: client?.spend }}
          readOnly
        />
      )}
    </div>
  );
}
