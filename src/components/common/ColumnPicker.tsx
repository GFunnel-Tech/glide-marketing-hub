import { useState } from "react";
import { Plus, Trash2, SlidersHorizontal, GripVertical, Sigma, Star, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCustomKpis } from "@/hooks/useCustomKpis";
import { ColumnConfig, TableView, useTableView } from "@/hooks/useTableColumns";

export interface BuiltinColumnOption {
  id: string;
  label: string;
  /** Tokens that the formula scope exposes for this column when present on a row. */
  token?: string;
}

interface Props {
  tableKey: string;
  /** All built-in columns the host table can show. Order = default display order. */
  builtins: BuiltinColumnOption[];
  /** Built-ins that cannot be hidden (always shown), e.g. status, name. */
  alwaysIds?: string[];
  /** Formula scope tokens (for help text). */
  formulaTokens?: string[];
  /** Render style for the popover trigger. */
  triggerMode?: "button" | "icon";
}

export function ColumnPicker({ tableKey, builtins, alwaysIds = [], formulaTokens, triggerMode = "button" }: Props) {
  const { view, save } = useTableView(tableKey);
  const { data: customKpis = [] } = useCustomKpis();
  const [open, setOpen] = useState(false);

  // Lookup helpers from view
  const hidden = new Set(
    view.columns.filter((c: any) => c.kind === "builtin" && c.hidden).map((c) => c.id)
  );
  const enabledKpi = new Set(
    view.columns.filter((c) => c.kind === "custom_kpi").map((c: any) => c.kpi_id)
  );
  const formulas = view.columns.filter((c) => c.kind === "formula") as Extract<
    ColumnConfig,
    { kind: "formula" }
  >[];

  const setHidden = (id: string, value: boolean) => {
    const others = view.columns.filter((c: any) => !(c.kind === "builtin" && c.id === id));
    const next: TableView = {
      ...view,
      columns: value ? [...others, { kind: "builtin", id, hidden: true }] : others,
    };
    save(next);
  };

  const toggleKpi = (kpiId: string, name: string) => {
    const already = enabledKpi.has(kpiId);
    const others = view.columns.filter((c: any) => !(c.kind === "custom_kpi" && c.kpi_id === kpiId));
    const next: TableView = {
      ...view,
      columns: already ? others : [...others, { kind: "custom_kpi", id: `kpi_${kpiId}`, kpi_id: kpiId }],
    };
    save(next);
  };

  // Add formula
  const [fLabel, setFLabel] = useState("");
  const [fExpr, setFExpr] = useState("");
  const [fFormat, setFFormat] = useState<"number" | "currency" | "percent">("number");
  const addFormula = () => {
    const label = fLabel.trim();
    const expr = fExpr.trim();
    if (!label || !expr) return;
    const id = `f_${Date.now().toString(36)}`;
    const next: TableView = {
      ...view,
      columns: [...view.columns, { kind: "formula", id, label, expr, format: fFormat, decimals: 2 }],
    };
    save(next);
    setFLabel("");
    setFExpr("");
  };
  const removeFormula = (id: string) => {
    save({ ...view, columns: view.columns.filter((c) => c.id !== id) });
  };

  const setDensity = (density: "compact" | "normal") => {
    save({ ...view, density });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Customize columns</p>
          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setDensity("normal")}
              className={cn("rounded px-1.5 py-0.5", view.density === "normal" ? "bg-accent" : "text-muted-foreground")}
            >
              Normal
            </button>
            <button
              onClick={() => setDensity("compact")}
              className={cn("rounded px-1.5 py-0.5", view.density === "compact" ? "bg-accent" : "text-muted-foreground")}
            >
              Compact
            </button>
          </div>
        </div>

        <Tabs defaultValue="builtin">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="builtin" className="text-xs data-[state=active]:bg-accent rounded-none">
              <Eye className="mr-1 h-3 w-3" /> Built-in
            </TabsTrigger>
            <TabsTrigger value="kpis" className="text-xs data-[state=active]:bg-accent rounded-none">
              <Star className="mr-1 h-3 w-3" /> Custom KPIs
            </TabsTrigger>
            <TabsTrigger value="formula" className="text-xs data-[state=active]:bg-accent rounded-none">
              <Sigma className="mr-1 h-3 w-3" /> Formula
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builtin" className="max-h-[280px] overflow-y-auto p-2 mt-0">
            <div className="space-y-1">
              {builtins.map((b) => {
                const isAlways = alwaysIds.includes(b.id);
                const isHidden = hidden.has(b.id);
                return (
                  <label
                    key={b.id}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
                      isAlways ? "text-muted-foreground cursor-not-allowed" : "hover:bg-accent cursor-pointer"
                    )}
                  >
                    <Checkbox
                      disabled={isAlways}
                      checked={isAlways || !isHidden}
                      onCheckedChange={(v) => !isAlways && setHidden(b.id, !v)}
                    />
                    <span className="flex-1">{b.label}</span>
                    {isAlways && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">always</span>}
                  </label>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="kpis" className="max-h-[280px] overflow-y-auto p-2 mt-0">
            {customKpis.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                No custom KPIs yet. Create them in Settings → Custom KPIs.
              </p>
            ) : (
              <div className="space-y-1">
                {customKpis.map((k) => (
                  <label
                    key={k.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={enabledKpi.has(k.id)}
                      onCheckedChange={() => toggleKpi(k.id, k.name)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{k.name}</span>
                      {k.description && <span className="block text-[10px] text-muted-foreground">{k.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="formula" className="p-3 mt-0 space-y-2">
            <div className="space-y-1.5">
              <Input
                value={fLabel}
                onChange={(e) => setFLabel(e.target.value)}
                placeholder="Column name (e.g. Adj CPL)"
                className="h-8 text-xs"
              />
              <Input
                value={fExpr}
                onChange={(e) => setFExpr(e.target.value)}
                placeholder="Expression (e.g. spend / leads * 1.2)"
                className="h-8 text-xs font-mono"
              />
              <div className="flex items-center gap-2">
                <Select value={fFormat} onValueChange={(v) => setFFormat(v as any)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="currency">Currency ($)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={addFormula} disabled={!fLabel || !fExpr}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {formulaTokens && formulaTokens.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Available: <span className="font-mono">{formulaTokens.join(", ")}</span>
                </p>
              )}
            </div>

            {formulas.length > 0 && (
              <div className="border-t border-border pt-2 space-y-1">
                {formulas.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded bg-accent/50 px-2 py-1.5 text-xs">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{f.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground truncate">{f.expr}</p>
                    </div>
                    <button
                      onClick={() => removeFormula(f.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove formula"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
