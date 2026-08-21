import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, ExternalLink, Sparkles, AlertTriangle, Info, XCircle,
  Megaphone, LayoutGrid, ImageIcon, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { metaAdsManagerUrl } from "@/lib/metaAdsLink";
import { useEntityProfile, buildAudit, EntityLevel } from "@/hooks/useEntityProfile";
import { toast } from "sonner";

const LEVEL_LABEL: Record<EntityLevel, string> = { campaign: "Campaign", adset: "Ad Set", ad: "Ad" };
const LEVEL_ICON: Record<EntityLevel, typeof Megaphone> = { campaign: Megaphone, adset: LayoutGrid, ad: ImageIcon };

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;

function Delta({ current, prev, invert }: { current: number; prev: number; invert?: boolean }) {
  if (!prev) return null;
  const change = ((current - prev) / prev) * 100;
  if (!isFinite(change) || Math.abs(change) < 0.5) return null;
  const good = invert ? change < 0 : change > 0;
  return (
    <span className={good ? "text-emerald-600 text-xs font-medium" : "text-destructive text-xs font-medium"}>
      {change > 0 ? "+" : ""}{change.toFixed(0)}%
    </span>
  );
}

function Tile({ label, value, current, prev, invert }: {
  label: string; value: string; current?: number; prev?: number; invert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-semibold text-foreground">{value}</div>
        {current !== undefined && prev !== undefined && <Delta current={current} prev={prev} invert={invert} />}
      </div>
    </div>
  );
}

export default function EntityProfile() {
  const { level, id } = useParams<{ level: EntityLevel; id: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [range, setRange] = useState(30);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState<string | null>(null);

  const lvl = (level ?? "campaign") as EntityLevel;
  const { data, isLoading } = useEntityProfile(lvl, id, range);
  const audit = useMemo(() => (data ? buildAudit(data) : []), [data]);
  const Icon = LEVEL_ICON[lvl];

  const metaUrl = data
    ? metaAdsManagerUrl({
        adAccountId: data.adAccountId,
        campaignId: lvl === "campaign" ? data.id : data.parentCampaignId,
        adsetId: lvl === "adset" ? data.id : lvl === "ad" ? data.parentAdsetId : null,
        adId: lvl === "ad" ? data.id : null,
      })
    : null;

  const askAi = async () => {
    if (!currentWorkspace || !data) return;
    setAiLoading(true);
    setAiReply(null);
    try {
      const summary = [
        `${LEVEL_LABEL[lvl]} "${data.name}" (id ${data.id}) over the last ${range} days:`,
        `spend ${money(data.totals.spend)}, leads ${data.totals.leads}, CPL ${money(data.totals.cpl)}, CPM ${money(data.totals.cpm)}, CTR ${pct(data.totals.ctr)}.`,
        `Prior period: spend ${money(data.prevTotals.spend)}, leads ${data.prevTotals.leads}, CPL ${money(data.prevTotals.cpl)}.`,
        data.children.length
          ? `Children: ${data.children.slice(0, 8).map((c) => `${c.name} (${money(c.spend)}, ${c.leads} leads, CPL ${money(c.cpl)})`).join("; ")}.`
          : "",
        `Automated audit flags: ${audit.map((a) => a.title).join(", ")}.`,
        "Give 3-5 concrete, prioritized optimization actions for this specific entity. Be direct, no preamble.",
      ].filter(Boolean).join("\n");

      const { data: res, error } = await supabase.functions.invoke("ai-ops-chat", {
        body: { workspaceId: currentWorkspace.id, messages: [{ role: "user", content: summary }] },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setAiReply(res?.reply ?? "No recommendations returned.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI recommendations failed");
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <p>No insights found for this {LEVEL_LABEL[lvl].toLowerCase()}.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            {data.parentCampaignId && lvl !== "campaign" && (
              <>
                <Link className="hover:text-foreground" to={`/entity/campaign/${data.parentCampaignId}`}>Campaign</Link>
                <span>/</span>
              </>
            )}
            {data.parentAdsetId && lvl === "ad" && (
              <>
                <Link className="hover:text-foreground" to={`/entity/adset/${data.parentAdsetId}`}>Ad Set</Link>
                <span>/</span>
              </>
            )}
            <span>{LEVEL_LABEL[lvl]}</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2 truncate">
            <Icon className="h-5 w-5 text-primary flex-shrink-0" />
            {data.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>
              {d}d
            </Button>
          ))}
          {lvl === "ad" && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/ads/${data.id}/edit`)}>Edit ad</Button>
          )}
          {metaUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={metaUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Meta
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Spend" value={money(data.totals.spend)} current={data.totals.spend} prev={data.prevTotals.spend} />
        <Tile label="Leads" value={String(data.totals.leads)} current={data.totals.leads} prev={data.prevTotals.leads} />
        <Tile label="CPL" value={money(data.totals.cpl)} current={data.totals.cpl} prev={data.prevTotals.cpl} invert />
        <Tile label="CPM" value={money(data.totals.cpm)} current={data.totals.cpm} prev={data.prevTotals.cpm} invert />
        <Tile label="CTR" value={pct(data.totals.ctr)} current={data.totals.ctr} prev={data.prevTotals.ctr} />
      </div>

      <Tabs defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="audit">
            Audit
            {audit.some((a) => a.severity !== "info") && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 text-amber-600 px-1.5 text-[10px] font-semibold">
                {audit.filter((a) => a.severity !== "info").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Daily delivery</CardTitle></CardHeader>
            <CardContent className="h-[320px]">
              {data.days.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">No delivery in this range.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.days}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="spend" name="Spend" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.75} />
                    <Line yAxisId="right" dataKey="leads" name="Leads" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" dataKey="cpl" name="CPL" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="mt-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {lvl === "campaign" ? "Ad sets" : lvl === "adset" ? "Ads" : "No children"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.children.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Nothing beneath this level delivered in range.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left font-medium px-4 py-2">Name</th>
                      <th className="text-right font-medium px-4 py-2">Spend</th>
                      <th className="text-right font-medium px-4 py-2">Leads</th>
                      <th className="text-right font-medium px-4 py-2">CPL</th>
                      <th className="text-right font-medium px-4 py-2">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.children.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer"
                        onClick={() => navigate(`/entity/${c.level}/${c.id}`)}
                      >
                        <td className="px-4 py-2 font-medium text-foreground truncate max-w-[380px]">{c.name}</td>
                        <td className="px-4 py-2 text-right">{money(c.spend)}</td>
                        <td className="px-4 py-2 text-right">{c.leads}</td>
                        <td className="px-4 py-2 text-right">{c.leads ? money(c.cpl) : "—"}</td>
                        <td className="px-4 py-2 text-right">{pct(c.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Health & configuration checks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {audit.map((a, i) => {
                const AIcon = a.severity === "error" ? XCircle : a.severity === "warning" ? AlertTriangle : Info;
                const tone =
                  a.severity === "error" ? "text-destructive bg-destructive/10"
                  : a.severity === "warning" ? "text-amber-600 bg-amber-500/10"
                  : "text-primary bg-primary/10";
                return (
                  <div key={i} className="flex gap-3 rounded-lg border border-border p-3">
                    <span className={`h-7 w-7 rounded-lg grid place-items-center flex-shrink-0 ${tone}`}>
                      <AIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.detail}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">AI recommendations</CardTitle>
              <Button size="sm" onClick={askAi} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                Analyze
              </Button>
            </CardHeader>
            <CardContent>
              {aiReply ? (
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{aiReply}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run an analysis to get prioritized actions for this {LEVEL_LABEL[lvl].toLowerCase()} based on its metrics and audit flags.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Setup</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label="Meta ID" value={data.id} />
              <Row label="Level" value={LEVEL_LABEL[lvl]} />
              <Row label="Ad account" value={data.adAccountId ?? "—"} />
              <Row label="Days with delivery" value={String(data.days.filter((d) => d.spend > 0).length)} />
              {data.ad && (
                <>
                  <Row label="Status" value={(data.ad.effective_status as string) ?? "—"} />
                  <Row label="Campaign" value={(data.ad.campaign_name as string) ?? "—"} />
                  <Row label="Ad set" value={(data.ad.adset_name as string) ?? "—"} />
                  <Row label="Page" value={(data.ad.page_name as string) ?? "—"} />
                  <Row label="CTA" value={(data.ad.call_to_action_type as string) ?? "—"} />
                  <Row label="Media type" value={(data.ad.media_type as string) ?? "—"} />
                  <Row label="Headline" value={(data.ad.title as string) ?? "—"} />
                  <Row label="Destination" value={(data.ad.link_url as string) ?? "—"} />
                </>
              )}
            </CardContent>
          </Card>
          {data.ad?.body ? (
            <Card className="rounded-xl mt-4">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Primary text</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{data.ad.body as string}</CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-xs font-medium text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
