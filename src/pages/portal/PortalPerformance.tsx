import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

export default function PortalPerformance() {
  const { clientId, client } = usePortalClient();

  const insights = useQuery({
    queryKey: ["portal-insights", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("meta_ad_accounts")
        .select("id")
        .eq("client_id", clientId!);
      const ids = (accounts ?? []).map((a) => a.id);
      if (!ids.length) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("meta_insights_daily")
        .select("date,spend,leads,cpl,impressions,clicks")
        .in("ad_account_id", ids)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      return data ?? [];
    },
  });

  const campaigns = useQuery({
    queryKey: ["portal-campaigns", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id,name,status,spend,leads,cpl,frequency")
        .eq("client_id", clientId!)
        .order("spend", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const reports = useQuery({
    queryKey: ["portal-reports", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_reports")
        .select("id,period_start,period_end,pdf_url,status,generated_at")
        .eq("client_id", clientId!)
        .order("period_end", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  const series = (insights.data ?? []).map((d: any) => ({
    date: d.date?.slice(5),
    spend: Number(d.spend ?? 0),
    leads: Number(d.leads ?? 0),
    cpl: Number(d.cpl ?? 0),
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Live reporting across all of your campaigns.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(() => {
          const totals = (insights.data ?? []).reduce(
            (acc: any, d: any) => {
              acc.imp += Number(d.impressions ?? 0);
              acc.clk += Number(d.clicks ?? 0);
              acc.spend += Number(d.spend ?? 0);
              acc.leads += Number(d.leads ?? 0);
              return acc;
            },
            { imp: 0, clk: 0, spend: 0, leads: 0 }
          );
          const ctr = totals.imp > 0 ? (totals.clk / totals.imp) * 100 : 0;
          return [
            { label: "Spend (30d)", value: `$${totals.spend.toLocaleString()}` },
            { label: "Impressions", value: totals.imp.toLocaleString() },
            { label: "CTR", value: totals.imp ? `${ctr.toFixed(2)}%` : "—" },
            { label: "True CPL", value: `$${(client?.true_cpl ?? 0).toFixed(2)}` },
            { label: "Leads (30d)", value: `${totals.leads}` },
          ];
        })().map((m) => (
          <Card key={m.label} className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{m.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Spend & leads — last 30 days</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="leads" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">CPL trend</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip />
              <ReferenceLine y={35} stroke="hsl(var(--success))" strokeDasharray="4 4" label={{ value: "Target $35", position: "right", fontSize: 10 }} />
              <Line type="monotone" dataKey="cpl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Active campaigns</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Campaign</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Spend</th>
                <th className="py-2 pr-4 text-right">Leads</th>
                <th className="py-2 pr-4 text-right">CPL</th>
                <th className="py-2 text-right">Freq</th>
              </tr>
            </thead>
            <tbody>
              {(campaigns.data ?? []).map((c: any) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-medium">{c.name}</td>
                  <td className="py-2 pr-4 text-xs"><span className="rounded-full bg-muted px-2 py-0.5">{c.status}</span></td>
                  <td className="py-2 pr-4 text-right tabular-nums">${Number(c.spend ?? 0).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.leads ?? 0}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">${Number(c.cpl ?? 0).toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums">{Number(c.frequency ?? 0).toFixed(2)}</td>
                </tr>
              ))}
              {!campaigns.data?.length && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No campaigns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Reports archive</h3>
        <ul className="divide-y divide-border">
          {(reports.data ?? []).map((r: any) => (
            <li key={r.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{r.period_start} → {r.period_end}</p>
                <p className="text-xs text-muted-foreground">{r.status}</p>
              </div>
              {r.pdf_url ? (
                <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-sm text-[hsl(var(--accent))] hover:underline">
                  Download PDF
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Not ready</span>
              )}
            </li>
          ))}
          {!reports.data?.length && (
            <li className="py-6 text-center text-sm text-muted-foreground">No reports yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
