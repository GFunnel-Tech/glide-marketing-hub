import { useState } from "react";
import { FormulaNode, METRIC_TOKENS, METRIC_LABELS, OP_LABELS, describeFormula, validateFormula } from "@/lib/kpiFormula";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Hash, Sigma } from "lucide-react";

interface Props {
  value: FormulaNode;
  onChange: (next: FormulaNode) => void;
}

// Visual tree editor: each node is rendered as a row of chips.
// Click a chip to swap node kind. Constants are inline number inputs.

export function FormulaBuilder({ value, onChange }: Props) {
  const err = validateFormula(value);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3 overflow-x-auto">
        <NodeEditor node={value} onChange={onChange} depth={0} />
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Formula:</span> {describeFormula(value)}
      </div>
      {err && <div className="text-xs text-destructive">⚠ {err}</div>}
    </div>
  );
}

function NodeEditor({ node, onChange, depth }: { node: FormulaNode; onChange: (n: FormulaNode) => void; depth: number }) {
  const [kind, setKind] = useState<"metric" | "constant" | "op">(
    "metric" in node ? "metric" : "constant" in node ? "constant" : "op"
  );

  const changeKind = (k: "metric" | "constant" | "op") => {
    setKind(k);
    if (k === "metric") onChange({ metric: "meta.spend" });
    else if (k === "constant") onChange({ constant: 0 });
    else onChange({ op: "div", a: { metric: "meta.spend" }, b: { metric: "meta.leads" } });
  };

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md ${depth > 0 ? "border border-dashed border-border/60 px-2 py-1" : ""}`}>
      <Select value={kind} onValueChange={(v) => changeKind(v as any)}>
        <SelectTrigger className="h-7 w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="metric"><span className="flex items-center gap-1"><Sigma className="h-3 w-3" />Metric</span></SelectItem>
          <SelectItem value="constant"><span className="flex items-center gap-1"><Hash className="h-3 w-3" />Number</span></SelectItem>
          <SelectItem value="op">Formula</SelectItem>
        </SelectContent>
      </Select>

      {"metric" in node && (
        <Select value={node.metric} onValueChange={(v) => onChange({ metric: v })}>
          <SelectTrigger className="h-7 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_TOKENS.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{METRIC_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {"constant" in node && (
        <Input
          type="number"
          step="any"
          value={Number.isFinite(node.constant) ? node.constant : 0}
          onChange={(e) => onChange({ constant: parseFloat(e.target.value) || 0 })}
          className="h-7 w-[100px] text-xs"
        />
      )}

      {"op" in node && (
        <div className="flex items-center gap-1.5">
          <NodeEditor node={node.a} onChange={(a) => onChange({ ...node, a })} depth={depth + 1} />
          <Select value={node.op} onValueChange={(v) => onChange({ ...node, op: v as any })}>
            <SelectTrigger className="h-7 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(OP_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NodeEditor node={node.b} onChange={(b) => onChange({ ...node, b })} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}
