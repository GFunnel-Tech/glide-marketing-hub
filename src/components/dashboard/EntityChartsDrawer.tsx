import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, Area, AreaChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, Users, MousePointerClick, Activity, Loader2, History,
} from "lucide-react";

export type EntityLevel = "campaign" | "adset" | "ad";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  level: EntityLevel | null;
  objectId: string | null;
  name?: string | null;
}

interface DailyPoint {
  date: string;
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  cpl: number;
  ctr: number;
  cpm: number;
  frequency: number;
}

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const shortDate = (s: string) => {
  const [, m, d] = s.split("-");
  return `${m}/${d}`;
};
const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

function useEntityTrend(
  workspaceId: string | null,
  level: EntityLevel | null,
  objectId: string | null,
  fromStr: string,
  toStr: string,
) {
  return useQuery({
    queryKey: ["entity-trend", workspaceId, level, objectId, fromStr, toStr],
    enabled: !!workspaceId && !!level && !!objectId,
    queryFn: async (): Promise<DailyPoint[]> => {
      const { data, error } = await (supabase as any)
        .from("meta_insights_granular_daily")
        .select("date, spend, leads, clicks, impressions, raw")
        .eq("workspace_id", workspaceId)
        .eq("level", level)
        .eq("object_id", objectId)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d: any) => {
        const spend = Number(d.spend) || 0;
        const leads = Number(d.leads) || 0;
        const clicks = Number(d.clicks) || 0;
        const impressions = Number(d.impressions) || 0;
        const raw = d.raw || {};
        const ctr = Number(raw.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0);
        const cpm = Number(raw.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0);
        return {
          date: d.date,
          spend,
          leads,
          clicks,
          impressions,
          cpl: leads > 0 ? spend / leads : 0,
          ctr,
          cpm,
          frequency: Number(raw.frequency) || 0,
        };
      });
    },
  });
}

interface EventRow {
  id: string;
  action: string;
  status: string;
  created_at: string;
  meta: any;
}

function useEntityEvents(
  workspaceId: string | null,
  objectId: string | null,
  fromStr: string,
  toStr: string,
) {
  return useQuery({
    queryKey: ["entity-events", workspaceId, objectId, fromStr, toStr],
    enabled: !!workspaceId && !!objectId,
    queryFn: async (): Promise<EventRow[]> => {
      const fromISO = `${fromStr}T00:00:00.000Z`;
      const toISO = `${toStr}T23:59:59.999Z`;
      const { data, error } = await (supabase as any)
        .from("ad_action_log")
        .select("id, action, status, created_at, meta")
        .eq("workspace_id", workspaceId)
        .or(`source_object_id.eq.${objectId},result_object_id.eq.${objectId}`)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
}

function totals(points: DailyPoint[]) {
  const t = { spend: 0, leads: 0, clicks: 0, impressions: 0 };
  for (const p of points) {
    t.spend += p.spend;
    t.leads += p.leads;
    t.clicks += p.clicks;
    t.impressions += p.impressions;
  }
  const cpl = t.leads > 0 ? t.spend / t.leads : 0;
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
  const avgFreq =
    points.reduce((a, p) => a + p.frequency * p.impressions, 0) /
    Math.max(1, t.impressions);
  return { ...t, cpl, ctr, cpm, avgFreq };
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon,
}: {
  label: string; value: string; sub?: string; icon: any;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <StatLabel>{label}</StatLabel>
          <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
        </div>
        <div className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </Card>
  );
}

function ChartShell({
  title, subtitle, children, hasData,
}: {
  title: string; subtitle?: string; children: React.ReactNode; hasData: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="h-44">
        {hasData ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No data in this range
          </div>
        )}
      </div>
    </Card>
  );
}

function freqTone(freq: number): { tone: string; label: string } {
  if (freq >= 4) return { tone: "text-destructive", label: "Fatigue risk" };
  if (freq >= 2.5) return { tone: "text-warning", label: "Watch" };
  if (freq > 0) return { tone: "text-success", label: "Healthy" };
  return { tone: "text-muted-foreground", label: "—" };
}

function actionTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "success") return "bg-success/15 text-success border-success/30";
  if (s === "error" || s === "failed") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "pending" || s === "running") return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground";
}

export function EntityChartsDrawer({
  open, onOpenChange, level, objectId, name,
}: Props) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, label: rangeLabel } = useDateRange();
  const fromStr = fmtDate(from);
  const toStr = fmtDate(to);

  const trendQ = useEntityTrend(wsId, level, objectId, fromStr, toStr);
  const eventsQ = useEntityEvents(wsId, objectId, fromStr, toStr);

  const points = trendQ.data ?? [];
  const t = useMemo(() => totals(points), [points]);
  const freq = freqTone(t.avgFreq);
  const hasAny = points.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize text-[10px]">
              {level ?? ""}
            </Badge>
            <SheetTitle className="text-base">{name ?? "Performance"}</SheetTitle>
            {level && objectId && (
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" asChild>
                <Link to={`/entity/${level}/${objectId}`} onClick={() => onOpenChange(false)}>
                  Full profile & audit <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
          <SheetDescription className="text-xs">
            {rangeLabel} · {shortDate(fromStr)} – {shortDate(toStr)}
          </SheetDescription>
        </SheetHeader>

        {trendQ.isLoading ? (
          <div className="mt-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label="Spend"
                value={fmtMoney(t.spend)}
                sub={`${points.length} day${points.length === 1 ? "" : "s"} live`}
                icon={TrendingUp}
              />
              <StatCard
                label="Leads"
                value={fmtInt(t.leads)}
                sub={t.cpl > 0 ? `${fmtMoney(t.cpl)} CPL` : "—"}
                icon={Users}
              />
              <StatCard
                label="CTR"
                value={fmtPct(t.ctr)}
                sub={t.cpm > 0 ? `${fmtMoney(t.cpm)} CPM` : "—"}
                icon={MousePointerClick}
              />
              <StatCard
                label="Avg Freq"
                value={t.avgFreq > 0 ? t.avgFreq.toFixed(2) : "—"}
                sub={freq.label}
                icon={Activity}
              />
            </div>

            {/* Spend over time */}
            <ChartShell
              title="Spend over time"
              subtitle="Daily ad spend"
              hasData={hasAny}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v: any) => [fmtMoney(Number(v)), "Spend"]}
                  />
                  <Area dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#spendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartShell>

            {/* Leads & CPL */}
            <ChartShell
              title="Leads & CPL"
              subtitle="Daily leads (bars) vs. CPL (line)"
              hasData={hasAny}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="leads" fontSize={10} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis yAxisId="cpl" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v: any, n: any) => n === "cpl" ? [fmtMoney(Number(v)), "CPL"] : [fmtInt(Number(v)), "Leads"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="leads" dataKey="leads" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="cpl" dataKey="cpl" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartShell>

            {/* Reach & engagement */}
            <ChartShell
              title="Reach & engagement"
              subtitle="Impressions, CTR, CPM"
              hasData={hasAny}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="impr" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="rate" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v: any, n: any) => {
                      if (n === "ctr") return [`${Number(v).toFixed(2)}%`, "CTR"];
                      if (n === "cpm") return [fmtMoney(Number(v)), "CPM"];
                      return [fmtInt(Number(v)), "Impressions"];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="impr" dataKey="impressions" fill="hsl(var(--muted))" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="rate" dataKey="ctr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" dataKey="cpm" stroke="hsl(var(--accent-foreground))" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartShell>

            {/* Frequency / fatigue */}
            <ChartShell
              title="Frequency / fatigue"
              subtitle="Avg impressions per reached user · 3+ = watch, 4+ = fatigue"
              hasData={hasAny && points.some((p) => p.frequency > 0)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" domain={[0, (dataMax: number) => Math.max(4, dataMax)]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v: any) => [Number(v).toFixed(2), "Frequency"]}
                  />
                  <Line dataKey="frequency" stroke={t.avgFreq >= 4 ? "hsl(var(--destructive))" : "hsl(var(--warning))"} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartShell>

            {/* Status / event timeline */}
            <Card className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="text-xs font-semibold text-foreground">Status timeline</div>
                <div className="text-[10px] text-muted-foreground">Pauses, activations, edits during this window</div>
              </div>
              {eventsQ.isLoading ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </div>
              ) : (eventsQ.data?.length ?? 0) === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No status changes recorded for this window.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {eventsQ.data!.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-2 rounded border border-border/50 bg-muted/30 px-2 py-1.5">
                      <Badge variant="outline" className={`text-[10px] ${actionTone(ev.status)}`}>
                        {ev.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-foreground capitalize">{ev.status}</div>
                        {ev.meta && Object.keys(ev.meta).length > 0 && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {Object.entries(ev.meta).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString(undefined, {
                          month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
