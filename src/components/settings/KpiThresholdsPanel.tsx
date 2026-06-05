import { useEffect, useState } from "react";
import {
  useKpiPresets,
  useWorkspaceKpiSettings,
  useUpsertWorkspaceKpiSettings,
  useRecomputeStatuses,
  KPI_LABELS,
  type KpiMap,
  type KpiSpec,
  type KpiWindowDays,
} from "@/hooks/useKpiThresholds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";

const KPI_KEYS = Object.keys(KPI_LABELS);
const WINDOW_OPTIONS: KpiWindowDays[] = [7, 14, 30];

export function KpiThresholdsPanel() {
  const { data: presets = [] } = useKpiPresets();
  const { data: settings } = useWorkspaceKpiSettings();
  const upsert = useUpsertWorkspaceKpiSettings();
  const recompute = useRecomputeStatuses();

  const [presetId, setPresetId] = useState<string>("");
  const [greenMin, setGreenMin] = useState("80");
  const [yellowMin, setYellowMin] = useState("50");
  const [defaultWindow, setDefaultWindow] = useState<KpiWindowDays>(30);
  const [overrides, setOverrides] = useState<KpiMap>({});

  useEffect(() => {
    if (settings) {
      setPresetId(settings.preset_id ?? "");
      setGreenMin(String(settings.green_score_min));
      setYellowMin(String(settings.yellow_score_min));
      setDefaultWindow((settings.default_window_days ?? 30) as KpiWindowDays);
      setOverrides(settings.overrides ?? {});
    } else if (presets.length && !presetId) {
      const def = presets.find((p) => p.is_default) ?? presets[0];
      setPresetId(def.id);
    }
  }, [settings, presets]);

  const activePreset = presets.find((p) => p.id === presetId);
  const effective: KpiMap = { ...(activePreset?.kpis ?? {}), ...overrides };

  const updateKpi = (key: string, patch: Partial<KpiSpec>) => {
    setOverrides((o) => ({
      ...o,
      [key]: { ...(effective[key] ?? { weight: 0, direction: KPI_LABELS[key].direction }), ...patch },
    }));
  };

  const save = () => {
    upsert.mutate({
      preset_id: presetId || null,
      overrides,
      green_score_min: Number(greenMin),
      yellow_score_min: Number(yellowMin),
      default_window_days: defaultWindow,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Custom KPI thresholds</h3>
          <p className="text-sm text-muted-foreground">
            Set the bands that drive the GREEN / YELLOW / RED status across your portfolio.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recompute.isPending ? "animate-spin" : ""}`} />
          Recompute now
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <Label>Vertical preset</Label>
          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger><SelectValue placeholder="Pick a preset" /></SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.workspace_id ? "" : " (global)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Default window</Label>
          <Select value={String(defaultWindow)} onValueChange={(v) => setDefaultWindow(Number(v) as KpiWindowDays)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Green score ≥</Label>
          <Input type="number" value={greenMin} onChange={(e) => setGreenMin(e.target.value)} />
        </div>
        <div>
          <Label>Yellow score ≥</Label>
          <Input type="number" value={yellowMin} onChange={(e) => setYellowMin(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">KPI</th>
              <th className="px-3 py-2 text-left w-20">Weight</th>
              <th className="px-3 py-2 text-left w-28">Window</th>
              <th className="px-3 py-2 text-left w-24">Range</th>
              <th className="px-3 py-2 text-left">Green when</th>
              <th className="px-3 py-2 text-left">Yellow when</th>
            </tr>
          </thead>
          <tbody>
            {KPI_KEYS.map((key) => {
              const meta = KPI_LABELS[key];
              const spec: KpiSpec = effective[key] ?? { weight: 0, direction: meta.direction };
              // Band-direction KPIs are always range; others honor use_range toggle.
              const isRange = meta.direction === "band" || !!spec.use_range;
              const op = meta.direction === "lower" ? "≤" : meta.direction === "higher" ? "≥" : "between";
              const effWindow = spec.window_days ?? defaultWindow;
              return (
                <tr key={key} className="border-t border-border align-middle">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {meta.label}
                    <span className="text-muted-foreground ml-1 text-xs">({meta.unit})</span>
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} max={100} value={spec.weight ?? 0}
                      onChange={(e) => updateKpi(key, { weight: Number(e.target.value) })}
                      className="h-8 w-16" />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={spec.window_days ? String(spec.window_days) : "default"}
                      onValueChange={(v) =>
                        updateKpi(key, { window_days: v === "default" ? undefined : (Number(v) as KpiWindowDays) })
                      }
                    >
                      <SelectTrigger className="h-8 w-24">
                        <SelectValue>{spec.window_days ? `${spec.window_days}d` : `${effWindow}d *`}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default ({defaultWindow}d)</SelectItem>
                        {WINDOW_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    {meta.direction === "band" ? (
                      <span className="text-xs text-muted-foreground">Always</span>
                    ) : (
                      <Switch
                        checked={isRange}
                        onCheckedChange={(checked) => updateKpi(key, { use_range: checked })}
                      />
                    )}
                  </td>
                  {isRange ? (
                    <>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Input type="number" value={spec.green_min ?? ""} placeholder="min"
                            onChange={(e) => updateKpi(key, { green_min: e.target.value === "" ? undefined : Number(e.target.value) })}
                            className="h-8 w-20" />
                          <span className="text-muted-foreground text-xs">to</span>
                          <Input type="number" value={spec.green_max ?? ""} placeholder="max"
                            onChange={(e) => updateKpi(key, { green_max: e.target.value === "" ? undefined : Number(e.target.value) })}
                            className="h-8 w-20" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Input type="number" value={spec.yellow_min ?? ""} placeholder="min"
                            onChange={(e) => updateKpi(key, { yellow_min: e.target.value === "" ? undefined : Number(e.target.value) })}
                            className="h-8 w-20" />
                          <span className="text-muted-foreground text-xs">to</span>
                          <Input type="number" value={spec.yellow_max ?? ""} placeholder="max"
                            onChange={(e) => updateKpi(key, { yellow_max: e.target.value === "" ? undefined : Number(e.target.value) })}
                            className="h-8 w-20" />
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className="text-muted-foreground text-xs mr-1">{op}</span>
                        <Input type="number" value={spec.green ?? ""}
                          onChange={(e) => updateKpi(key, { green: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="h-8 w-24 inline-block" />
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-muted-foreground text-xs mr-1">{op}</span>
                        <Input type="number" value={spec.yellow ?? ""}
                          onChange={(e) => updateKpi(key, { yellow: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="h-8 w-24 inline-block" />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 py-2 text-xs text-muted-foreground bg-accent/30 border-t border-border">
          * Window uses workspace default. Note: status scoring currently uses latest values — windowed scoring will follow in a DB update.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={upsert.isPending}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save thresholds
        </Button>
      </div>
    </div>
  );
}
