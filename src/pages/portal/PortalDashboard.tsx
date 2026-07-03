import { usePortalClient } from "@/hooks/usePortalClient";
import { ClientKpiTile } from "@/components/client/ClientKpiTile";
import { PortalTasksCard } from "@/components/portal/PortalTasksCard";
import { RequestCampaignDialog } from "@/components/portal/RequestCampaignDialog";
import { useClientKpiTargets } from "@/hooks/useClientKpiTargets";
import { formatMoney, formatMoneyInt } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  FileText, Plug, Calendar as CalendarIcon, Bot, ExternalLink,
  Share2, Pencil, Plus, Target, Megaphone, TrendingUp, Palette,
  Sparkles, Mail, Users, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

const departments = [
  { label: "Performance", sub: "KPIs, spend, leads", Icon: Target, tint: "bg-primary/10 text-primary", to: "/portal/performance" },
  { label: "Creative", sub: "Ads, assets, tests", Icon: Palette, tint: "bg-pink-500/10 text-pink-600 dark:text-pink-400", to: "/portal/creative" },
  { label: "Leads", sub: "Pipeline, quality", Icon: Users, tint: "bg-success/10 text-success", to: "/portal/leads" },
  { label: "Reports", sub: "Monthly, custom", Icon: TrendingUp, tint: "bg-warning/10 text-warning-foreground", to: "/portal/reports" },
  { label: "Requests", sub: "Campaigns, changes", Icon: Megaphone, tint: "bg-purple-500/10 text-purple-600 dark:text-purple-400", to: "/portal/requests" },
  { label: "Integrations", sub: "Meta, GHL, CRM", Icon: Plug, tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400", to: "/portal/integrations" },
];

export default function PortalDashboard() {
  const { clientId, client } = usePortalClient();
  const targetsQ = useClientKpiTargets(clientId);

  if (!client) return <div className="p-8 text-muted-foreground">Loading…</div>;

  // ---- Metric values ---------------------------------------------------
  // Unify the Leads tile with the same source that drives CPL and the
  // Activity snapshot. Previously the tile ran its own meta_leads count
  // that missed non-Meta and un-timestamped leads, producing 0 while CPL
  // was clearly computed against a non-zero denominator.
  const trueLeads = (client as any).true_leads ?? 0;
  const reportedLeads = (client as any).reported_leads ?? 0;
  const leads = trueLeads || reportedLeads || (client as any).leads || 0;
  const cpl = (client as any).true_cpl ?? (client as any).cpl ?? 0;
  const cpm = (client as any).cpm ?? 0;
  const spend = (client as any).spend ?? 0;
  const freq = (client as any).frequency ?? 0;

  // Form CVR is stored as a percent (e.g. 18.50 = 18.5%). The previous
  // multiplication by 100 produced impossible values like "1083.0%".
  const cvrRaw = (client as any).form_cvr ?? 0;
  const cvrValid = typeof cvrRaw === "number" && cvrRaw >= 0 && cvrRaw <= 100;

  // ---- Currency --------------------------------------------------------
  const currency: string | null = (client as any).currency_code ?? null;
  const spendFmt = formatMoneyInt(spend, currency);
  const cplFmt = formatMoney(cpl, currency);
  const cpmFmt = formatMoney(cpm, currency);
  const currencyNote = currency ? undefined : "Currency not configured for this account — value shown without symbol.";

  // ---- Targets (per-account config) -----------------------------------
  const t = targetsQ.data;
  const tgtCpl = t?.cpl != null ? `< ${formatMoney(t.cpl, currency).text}` : undefined;
  const tgtCpm = t?.cpm != null ? `< ${formatMoney(t.cpm, currency).text}` : undefined;
  const tgtLeads = t?.leads != null ? `${t.leads}+` : undefined;
  const tgtFreq = t?.frequency != null ? `< ${t.frequency.toFixed(1)}` : undefined;

  const initial = (client.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* LEFT — Profile card + tasks */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="relative h-28 bg-gradient-to-br from-primary/70 via-primary/50 to-primary/30">
              <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-xl bg-primary text-primary-foreground grid place-items-center text-2xl font-bold border-4 border-card shadow-sm">
                {initial}
              </div>
            </div>
            <div className="pt-10 px-4 pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground truncate">{client.name}</h1>
                {/* Internal status pill intentionally hidden from client role. */}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.brand || "Client workspace"}</p>

              <div className="mt-4 space-y-2">
                <RequestCampaignDialog clientId={clientId} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="w-full">
                    <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to="/portal/settings"><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" /> Your tasks
              </h3>
            </div>
            <PortalTasksCard clientId={clientId} />
          </section>
        </aside>

        {/* CENTER */}
        <main className="space-y-4 min-w-0">
          {/* Ask AI */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-sm text-foreground">Hey {client.name?.split(" ")[0] ?? "there"} — what do you want to get done today?</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Ask anything, or describe a task…
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { icon: Mail, label: "Draft a follow-up email" },
                { icon: Users, label: "Show last week's leads", to: "/portal/leads" },
                { icon: Megaphone, label: "Request a campaign" },
                { icon: ListChecks, label: "Summarize my month" },
              ].map((c) => (
                <button
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                >
                  <c.icon className="h-3.5 w-3.5 text-muted-foreground" /> {c.label}
                </button>
              ))}
            </div>
          </section>

          {/* KPI strip */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">This month</h3>
                <p className="text-xs text-muted-foreground">Live from your ad accounts</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/portal/performance">Open <ExternalLink className="h-3.5 w-3.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <ClientKpiTile label="Cost per lead" value={cplFmt.text} benchmark={tgtCpl} valueTitle={currencyNote} />
              <ClientKpiTile label="Leads this month" value={String(leads)} benchmark={tgtLeads} />
              <ClientKpiTile label="Spend" value={spendFmt.text} valueTitle={currencyNote} />
              <ClientKpiTile label="CPM" value={cpmFmt.text} benchmark={tgtCpm} valueTitle={currencyNote} />
              <ClientKpiTile
                label="Form conversion rate"
                value={cvrValid ? `${cvrRaw.toFixed(1)}%` : "—"}
                benchmark={cvrValid ? undefined : "not available"}
                valueTitle={cvrValid ? undefined : "Not enough view data to compute a real rate for this account."}
              />
              <ClientKpiTile label="Ad frequency" value={freq.toFixed(2)} benchmark={tgtFreq} />
            </div>
          </section>

          {/* Departments */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Workspaces</h3>
                <p className="text-xs text-muted-foreground">Jump into any part of your account</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {departments.map((d) => (
                <Link
                  key={d.label}
                  to={d.to}
                  className="group rounded-xl border border-border bg-background p-4 hover:border-primary/40 hover:shadow-sm transition"
                >
                  <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md", d.tint)}>
                    <d.Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-foreground">{d.label}</p>
                  <p className="text-[11px] text-muted-foreground">{d.sub}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* This month rollup */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Activity snapshot</h3>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-muted/30 px-3 py-2"><dt className="text-[11px] text-muted-foreground uppercase tracking-wide">Reported leads</dt><dd className="tabular-nums font-medium text-foreground mt-1">{reportedLeads}</dd></div>
              <div className="rounded-lg bg-muted/30 px-3 py-2"><dt className="text-[11px] text-muted-foreground uppercase tracking-wide">True leads</dt><dd className="tabular-nums font-medium text-foreground mt-1">{trueLeads}</dd></div>
              <div className="rounded-lg bg-muted/30 px-3 py-2"><dt className="text-[11px] text-muted-foreground uppercase tracking-wide">Spend</dt><dd className="tabular-nums font-medium text-foreground mt-1" title={currencyNote}>{spendFmt.text}</dd></div>
              <div className="rounded-lg bg-muted/30 px-3 py-2"><dt className="text-[11px] text-muted-foreground uppercase tracking-wide">Cost / lead</dt><dd className="tabular-nums font-medium mt-1 text-foreground" title={currencyNote}>{cplFmt.text}</dd></div>
            </dl>
          </section>
        </main>

        {/* RIGHT */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Calendar</h3>
                <p className="text-[11px] text-muted-foreground">Appointments & synced events</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/portal/support">Open</Link>
              </Button>
            </div>
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary mx-auto">
                <CalendarIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-foreground mt-2">Connect your calendar</p>
              <p className="text-[11px] text-muted-foreground mt-1">Google, GHL, Cal.com in one place.</p>
              <Button size="sm" className="w-full mt-3" asChild>
                <Link to="/portal/integrations">Connect calendar</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Quick Links</h3>
              <button className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link to="/portal/support" className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent">
                  <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> AI Assistant</span>
                </Link>
              </li>
              <li>
                <Link to="/portal/documents" className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Documents</span>
                </Link>
              </li>
              <li>
                <Link to="/portal/reports" className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent">
                  <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Reports</span>
                </Link>
              </li>
              <li>
                <Link to="/portal/billing" className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Billing</span>
                </Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
