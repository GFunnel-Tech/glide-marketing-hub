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

  return (
    <div className="min-h-screen bg-background py-10 px-4 print:py-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{p.client?.brand || p.client?.name} — Performance report</h1>
              <p className="text-sm text-muted-foreground">{p.period?.start} → {p.period?.end}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
            <Download className="h-4 w-4 mr-1.5" /> Download PDF
          </Button>
        </div>

        {report.commentary && (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-foreground">
            {report.commentary}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{k.value}</p>
            </div>
          ))}
        </div>

        {Array.isArray(p.daily) && p.daily.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Daily performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th className="py-2 text-right">Spend</th>
                    <th className="py-2 text-right">Leads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {p.daily.map((d: any) => (
                    <tr key={d.date}>
                      <td className="py-2">{d.date}</td>
                      <td className="py-2 text-right">{fmt(d.spend)}</td>
                      <td className="py-2 text-right">{d.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">Generated {new Date(report.generated_at).toLocaleString()}</p>
      </div>
    </div>
  );
}
