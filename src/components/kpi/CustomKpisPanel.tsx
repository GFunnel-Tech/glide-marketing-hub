import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Bell, Play, AlertTriangle } from "lucide-react";
import { FormulaBuilder } from "./FormulaBuilder";
import {
  useCustomKpis, useCustomKpiAlerts, useLatestKpiEvaluations,
  useUpsertCustomKpi, useDeleteCustomKpi,
  useUpsertCustomKpiAlert, useDeleteCustomKpiAlert,
  runCustomKpiEvaluate,
  type CustomKpi, type CustomKpiAlert,
} from "@/hooks/useCustomKpis";
import { useClients } from "@/hooks/useDatabase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { describeFormula, formatKpiValue, type FormulaNode } from "@/lib/kpiFormula";
import { toast } from "sonner";

const DEFAULT_FORMULA: FormulaNode = { op: "div", a: { metric: "meta.spend" }, b: { metric: "meta.leads" } };

const blankKpi = (): Partial<CustomKpi> => ({
  name: "",
  description: "",
  unit: "currency",
  format: { decimals: 2, prefix: "", suffix: "" },
  direction: "lower_better",
  formula: DEFAULT_FORMULA,
  enabled: true,
  client_id: null,
});

export function CustomKpisPanel() {
  const { currentWorkspace } = useWorkspace();
  const { data: kpis = [] } = useCustomKpis();
  const { data: alerts = [] } = useCustomKpiAlerts();
  const { data: clients = [] } = useClients();
  const { data: evals = [] } = useLatestKpiEvaluations(kpis.map((k) => k.id));
  const [editing, setEditing] = useState<Partial<CustomKpi> | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const upsert = useUpsertCustomKpi();
  const del = useDeleteCustomKpi();

  const aggValueByKpi = useMemo(() => {
    const map = new Map<string, number>();
    for (const k of kpis) {
      const rows = evals.filter((e) => e.custom_kpi_id === k.id);
      if (!rows.length) continue;
      const sum = rows.reduce((s, r) => s + (r.value ?? 0), 0);
      map.set(k.id, sum / rows.length);
    }
    return map;
  }, [evals, kpis]);

  const handleEvaluate = async () => {
    if (!currentWorkspace?.id) return;
    setEvaluating(true);
    try {
      await runCustomKpiEvaluate(currentWorkspace.id);
      toast.success("KPIs recomputed");
    } catch (e: any) {
      toast.error(`Evaluate failed: ${e.message ?? e}`);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Custom KPIs</h2>
          <p className="text-sm text-muted-foreground">
            Build your own metrics with a visual formula and trigger notifications when they breach thresholds or shift over time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleEvaluate} disabled={evaluating}>
            <Play className="h-4 w-4 mr-1" /> {evaluating ? "Computing…" : "Recompute now"}
          </Button>
          <Button size="sm" onClick={() => setEditing(blankKpi())}>
            <Plus className="h-4 w-4 mr-1" /> New KPI
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Scope</th>
              <th className="text-left p-3">Formula</th>
              <th className="text-right p-3">Latest avg</th>
              <th className="text-center p-3">Alerts</th>
              <th className="text-center p-3">Enabled</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {kpis.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                No custom KPIs yet. Click "New KPI" to create your first formula.
              </td></tr>
            )}
            {kpis.map((k) => {
              const alertCount = alerts.filter((a) => a.custom_kpi_id === k.id).length;
              const v = aggValueByKpi.get(k.id);
              const scope = k.client_id == null
                ? "All clients"
                : clients.find((c) => c.id === k.client_id)?.name ?? `Client #${k.client_id}`;
              return (
                <tr key={k.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3">
                    <div className="font-medium text-foreground">{k.name}</div>
                    {k.description && <div className="text-[11px] text-muted-foreground line-clamp-1">{k.description}</div>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{scope}</td>
                  <td className="p-3 text-xs font-mono text-muted-foreground max-w-[280px] truncate" title={describeFormula(k.formula)}>
                    {describeFormula(k.formula)}
                  </td>
                  <td className="p-3 text-right font-medium">{formatKpiValue(v ?? null, k.unit, k.format)}</td>
                  <td className="p-3 text-center">
                    {alertCount > 0 ? (
                      <Badge variant="outline" className="gap-1"><Bell className="h-3 w-3" />{alertCount}</Badge>
                    ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    <Switch
                      checked={k.enabled}
                      onCheckedChange={(c) => upsert.mutate({ id: k.id, enabled: c })}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(k)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm(`Delete KPI "${k.name}"? Its alerts and history will be removed.`)) del.mutate(k.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <KpiEditorSheet
          kpi={editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSave={async (k) => {
            try {
              await upsert.mutateAsync(k);
              toast.success("KPI saved");
              setEditing(null);
            } catch (e: any) {
              toast.error(`Save failed: ${e.message ?? e}`);
            }
          }}
        />
      )}
    </div>
  );
}

function KpiEditorSheet({
  kpi, clients, onClose, onSave,
}: {
  kpi: Partial<CustomKpi>;
  clients: any[];
  onClose: () => void;
  onSave: (k: Partial<CustomKpi>) => void;
}) {
  const [draft, setDraft] = useState<Partial<CustomKpi>>(kpi);
  const { data: alerts = [] } = useCustomKpiAlerts(kpi.id);
  const alertUpsert = useUpsertCustomKpiAlert();
  const alertDel = useDeleteCustomKpiAlert();
  const [newAlertOpen, setNewAlertOpen] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{kpi.id ? "Edit KPI" : "New custom KPI"}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="definition" className="mt-4">
          <TabsList>
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="alerts" disabled={!kpi.id}>Alerts ({alerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="definition" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Cost per appointment" />
              </div>
              <div className="col-span-2">
                <Label>Description (optional)</Label>
                <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="currency">Currency ($)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="ratio">Ratio (×)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Better when</Label>
                <Select value={draft.direction} onValueChange={(v) => setDraft({ ...draft, direction: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lower_better">Lower is better</SelectItem>
                    <SelectItem value="higher_better">Higher is better</SelectItem>
                    <SelectItem value="range">In a range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Scope</Label>
                <Select
                  value={draft.client_id == null ? "_all" : String(draft.client_id)}
                  onValueChange={(v) => setDraft({ ...draft, client_id: v === "_all" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All clients (workspace default)</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Formula</Label>
              <FormulaBuilder value={draft.formula as FormulaNode} onChange={(f) => setDraft({ ...draft, formula: f })} />
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Notifications fire to all workspace members when the rule triggers.</p>
              <Button size="sm" onClick={() => setNewAlertOpen(true)}><Plus className="h-3 w-3 mr-1" />Add alert</Button>
            </div>
            {alerts.length === 0 && (
              <div className="text-center text-xs text-muted-foreground p-6 border border-dashed border-border rounded-lg">
                No alerts yet for this KPI.
              </div>
            )}
            {alerts.map((a) => <AlertRow key={a.id} alert={a} onDelete={() => alertDel.mutate(a.id)} />)}
            {newAlertOpen && kpi.id && (
              <NewAlertForm
                kpiId={kpi.id}
                onCancel={() => setNewAlertOpen(false)}
                onSave={async (a) => {
                  await alertUpsert.mutateAsync({ ...a, custom_kpi_id: kpi.id! });
                  setNewAlertOpen(false);
                  toast.success("Alert created");
                }}
              />
            )}
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)} disabled={!draft.name}>Save KPI</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AlertRow({ alert, onDelete }: { alert: CustomKpiAlert; onDelete: () => void }) {
  const summary = alert.trigger_type === "threshold" && alert.threshold
    ? `value ${alert.threshold.op === "gt" ? ">" : alert.threshold.op === "lt" ? "<" : "outside"} ${alert.threshold.value}${alert.threshold.value2 != null ? `–${alert.threshold.value2}` : ""}`
    : alert.trend
    ? `${alert.trend.direction === "either" ? "±" : alert.trend.direction === "up" ? "↑" : "↓"} ${alert.trend.change_pct}% vs prior ${alert.trend.window_days}d`
    : "";
  const sevColor = alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "secondary" : "outline";
  return (
    <div className="flex items-center justify-between border border-border rounded-md p-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">{alert.trigger_type === "threshold" ? "Threshold" : "Trend"}: {summary}</div>
          <div className="text-[11px] text-muted-foreground">
            cooldown {alert.cooldown_minutes}m
            {alert.last_fired_at && ` · last fired ${new Date(alert.last_fired_at).toLocaleString()}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={sevColor as any}>{alert.severity}</Badge>
        <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );
}

function NewAlertForm({ kpiId, onCancel, onSave }: { kpiId: string; onCancel: () => void; onSave: (a: Partial<CustomKpiAlert>) => void }) {
  const [type, setType] = useState<"threshold" | "trend">("threshold");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [cooldown, setCooldown] = useState(60);
  // threshold
  const [op, setOp] = useState<"gt" | "lt" | "between">("gt");
  const [value, setValue] = useState(0);
  const [value2, setValue2] = useState(0);
  // trend
  const [windowDays, setWindowDays] = useState(7);
  const [changePct, setChangePct] = useState(20);
  const [direction, setDirection] = useState<"up" | "down" | "either">("either");

  return (
    <div className="border border-primary/30 rounded-md p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Trigger type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="threshold">Threshold breach</SelectItem>
              <SelectItem value="trend">Trend change</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {type === "threshold" ? (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Operator</Label>
            <Select value={op} onValueChange={(v) => setOp(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gt">Greater than</SelectItem>
                <SelectItem value="lt">Less than</SelectItem>
                <SelectItem value="between">Outside range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Value</Label>
            <Input type="number" step="any" value={value} onChange={(e) => setValue(parseFloat(e.target.value) || 0)} />
          </div>
          {op === "between" && (
            <div>
              <Label>Max</Label>
              <Input type="number" step="any" value={value2} onChange={(e) => setValue2(parseFloat(e.target.value) || 0)} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Window (days)</Label>
            <Input type="number" value={windowDays} onChange={(e) => setWindowDays(parseInt(e.target.value) || 7)} />
          </div>
          <div>
            <Label>Change ≥ (%)</Label>
            <Input type="number" value={changePct} onChange={(e) => setChangePct(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="either">Either</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div>
        <Label>Cooldown (minutes)</Label>
        <Input type="number" value={cooldown} onChange={(e) => setCooldown(parseInt(e.target.value) || 60)} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave({
          trigger_type: type,
          severity,
          cooldown_minutes: cooldown,
          enabled: true,
          notify_channels: { in_app: true, email: [] },
          threshold: type === "threshold" ? { op, value, ...(op === "between" ? { value2 } : {}) } : null,
          trend: type === "trend" ? { window_days: windowDays, change_pct: changePct, direction } : null,
        } as any)}>Save alert</Button>
      </div>
    </div>
  );
}
