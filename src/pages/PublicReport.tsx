import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_report_by_token", { _token: token });
      if (error) setErr(error.message);
      else setReport(Array.isArray(data) ? data[0] : data);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (err || !report) return <div className="min-h-screen grid place-items-center text-muted-foreground">Report not found.</div>;

  const p = report.payload ?? {};
  const t = p.totals ?? {};
  const currency = p.client?.currency ?? "USD";
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
  const dateFmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const leadStats = p.leadStats;
  const leads: any[] = p.leads ?? [];
  const campaigns: any[] = p.campaigns ?? [];
  const notes: any[] = p.notes ?? [];
  const appointments: any[] = p.appointments ?? [];
  const activity: any[] = p.activity ?? [];

  const Section = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 border-l-2 border-primary pl-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );

  return (
    <div className="min-h-screen bg-background py-10 px-4 print:py-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-xl bg-primary p-8 text-primary-foreground">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Performance report</p>
              <h1 className="mt-2 text-3xl font-semibold">{p.client?.brand || p.client?.name}</h1>
              <p className="mt-1 text-sm opacity-90">{dateFmt(p.period?.start)} — {dateFmt(p.period?.end)}</p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              {report.pdf_url && (
                <Button size="sm" variant="secondary" asChild>
                  <a href={report.pdf_url} target="_blank" rel="noreferrer">
                    <Download className="mr-1.5 h-4 w-4" /> PDF
                  </a>
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <FileText className="mr-1.5 h-4 w-4" /> Print
              </Button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { label: "Ad spend", value: fmt(t.spend) },
              { label: "Leads", value: (t.leads ?? 0).toLocaleString() },
              { label: "Cost per lead", value: t.leads > 0 ? fmt(t.cpl) : "—" },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{k.label}</p>
                <p className="text-xl font-semibold">{k.value}</p>
              </div>
            ))}
          </div>
        </header>

        {report.commentary && (
          <Section title="Executive summary">
            <p className="text-sm leading-relaxed text-foreground">{report.commentary}</p>
          </Section>
        )}

        <Section title="Delivery & efficiency">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Spend", value: fmt(t.spend) },
              { label: "Leads", value: (t.leads ?? 0).toLocaleString() },
              { label: "Cost per lead", value: t.leads > 0 ? fmt(t.cpl) : "—" },
              { label: "CPM", value: t.impressions > 0 ? fmt(t.cpm) : "—" },
              { label: "Clicks", value: (t.clicks ?? 0).toLocaleString() },
              { label: "Impressions", value: (t.impressions ?? 0).toLocaleString() },
              { label: "CTR", value: t.impressions > 0 ? `${t.ctr.toFixed(2)}%` : "—" },
              { label: "Form CVR", value: t.clicks > 0 && t.cvr <= 100 ? `${t.cvr.toFixed(2)}%` : "—" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-base font-semibold text-foreground">{k.value}</p>
              </div>
            ))}
          </div>
        </Section>

        {campaigns.length > 0 && (
          <Section title="Campaign performance" sub="Ranked by spend">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Campaign</th>
                  <th className="py-2 text-right">Spend</th>
                  <th className="py-2 text-right">Leads</th>
                  <th className="py-2 text-right">CPL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c: any) => (
                  <tr key={c.name}>
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-right">{fmt(c.spend)}</td>
                    <td className="py-2 text-right">{c.leads}</td>
                    <td className="py-2 text-right">{c.leads ? fmt(c.spend / c.leads) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {leadStats?.total > 0 && (
          <Section title="Lead breakdown" sub={`${leadStats.total} leads captured this period`}>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "Top states", rows: leadStats.byState },
                { label: "Top campaigns", rows: leadStats.byCampaign },
                { label: "Top forms", rows: leadStats.byForm },
                { label: leadStats.byQualifier?.question ?? "", rows: leadStats.byQualifier?.rows ?? [] },
              ]
                .filter((g) => g.label && (g.rows ?? []).length)

                .map((g) => (
                  <div key={g.label} className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                    <ul className="space-y-1 text-sm">
                      {g.rows.map((r: any) => (
                        <li key={r.label} className="flex justify-between gap-2">
                          <span className="truncate text-foreground">{r.label}</span>
                          <span className="font-medium text-foreground">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </Section>
        )}

        {leads.length > 0 && (
          <Section title="Lead detail" sub={leads.length >= 60 ? "Most recent 60 leads" : undefined}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th className="py-2">Name</th>
                    <th className="py-2">Contact</th>
                    <th className="py-2">State</th>
                    <th className="py-2">Campaign</th>
                    <th className="py-2">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leads.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2 whitespace-nowrap">{dateFmt(l.date)}</td>
                      <td className="py-2">{l.name}</td>
                      <td className="py-2 text-muted-foreground">{l.email || l.phone || "—"}</td>
                      <td className="py-2">{l.state || "—"}</td>
                      <td className="py-2 truncate max-w-[180px]">{l.campaign || l.form || "—"}</td>
                      <td className="py-2">{l.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {appointments.length > 0 && (
          <Section title="Appointments booked">
            <ul className="divide-y divide-border text-sm">
              {appointments.map((a: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-foreground">{a.contact} — {a.title}</span>
                  <span className="text-muted-foreground">{dateFmt(a.date)} · {a.status || "—"}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {notes.length > 0 && (
          <Section title="CRM activity notes" sub="Latest follow-up notes logged against this account">
            <ul className="space-y-3">
              {notes.map((n: any, i: number) => (
                <li key={i} className="rounded-lg border-l-2 border-emerald-500 bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{n.contact}</span>
                    <span className="text-xs text-muted-foreground">{dateFmt(n.date)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {activity.length > 0 && (
          <Section title="Optimization log" sub="Changes made to this account during the period">
            <ul className="divide-y divide-border text-sm">
              {activity.map((a: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="capitalize text-foreground">{a.action} — <span className="text-muted-foreground">{a.detail}</span></span>
                  <span className="whitespace-nowrap text-muted-foreground">{dateFmt(a.date)} · {a.status}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {Array.isArray(p.daily) && p.daily.length > 0 && (
          <Section title="Daily breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th className="py-2 text-right">Spend</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">CPL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {p.daily.map((d: any) => (
                    <tr key={d.date}>
                      <td className="py-2">{dateFmt(d.date)}</td>
                      <td className="py-2 text-right">{fmt(d.spend)}</td>
                      <td className="py-2 text-right">{d.leads}</td>
                      <td className="py-2 text-right">{d.leads ? fmt(d.spend / d.leads) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Generated {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
