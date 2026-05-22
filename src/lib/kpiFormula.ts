// Frontend mirror of supabase/functions/_shared/kpiFormula.ts
export type FormulaNode =
  | { metric: string }
  | { constant: number }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max" | "pct" | "safe_div"; a: FormulaNode; b: FormulaNode };

export const METRIC_TOKENS = [
  "meta.spend","meta.impressions","meta.clicks","meta.leads","meta.ctr","meta.cpm","meta.frequency","meta.cpl",
  "ghl.opportunities","ghl.appointments","ghl.pipeline_value","ghl.opps_won",
  "leads.true","leads.reported","leads.double_count",
] as const;

export type MetricToken = (typeof METRIC_TOKENS)[number] | `override.${string}`;

export const METRIC_LABELS: Record<string, string> = {
  "meta.spend": "Meta · Spend",
  "meta.impressions": "Meta · Impressions",
  "meta.clicks": "Meta · Clicks",
  "meta.leads": "Meta · Leads",
  "meta.ctr": "Meta · CTR",
  "meta.cpm": "Meta · CPM",
  "meta.frequency": "Meta · Frequency",
  "meta.cpl": "Meta · CPL",
  "ghl.opportunities": "GHL · Opportunities",
  "ghl.appointments": "GHL · Appointments",
  "ghl.pipeline_value": "GHL · Pipeline value",
  "ghl.opps_won": "GHL · Opps won",
  "leads.true": "Leads · True (deduped)",
  "leads.reported": "Leads · Reported",
  "leads.double_count": "Leads · Double-count flag",
};

export const OP_LABELS: Record<string, string> = {
  add: "+", sub: "−", mul: "×", div: "÷", pct: "÷ × 100", safe_div: "÷ safe", min: "min", max: "max",
};

const MAX_DEPTH = 16;

export type MetricSnapshot = Record<string, number>;

export function validateFormula(node: FormulaNode, depth = 0): string | null {
  if (depth > MAX_DEPTH) return "Formula too deeply nested";
  if (!node || typeof node !== "object") return "Invalid node";
  if ("metric" in node) {
    if (typeof node.metric !== "string") return "Metric must be string";
    if (!METRIC_TOKENS.includes(node.metric as any) && !node.metric.startsWith("override.")) {
      return `Unknown metric: ${node.metric}`;
    }
    return null;
  }
  if ("constant" in node) {
    if (typeof node.constant !== "number" || !Number.isFinite(node.constant)) return "Constant must be a finite number";
    return null;
  }
  if ("op" in node) {
    const ops = ["add","sub","mul","div","min","max","pct","safe_div"];
    if (!ops.includes(node.op)) return `Unknown op: ${node.op}`;
    if (node.op === "div" && "constant" in node.b && (node.b as any).constant === 0) return "Division by zero";
    return validateFormula(node.a, depth + 1) || validateFormula(node.b, depth + 1);
  }
  return "Unknown node";
}

export function evaluateFormula(node: FormulaNode, snapshot: MetricSnapshot): number {
  if ("metric" in node) {
    const v = snapshot[node.metric];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  if ("constant" in node) return node.constant;
  const a = evaluateFormula(node.a, snapshot);
  const b = evaluateFormula(node.b, snapshot);
  switch (node.op) {
    case "add": return a + b;
    case "sub": return a - b;
    case "mul": return a * b;
    case "div": return b === 0 ? 0 : a / b;
    case "min": return Math.min(a, b);
    case "max": return Math.max(a, b);
    case "pct": return b === 0 ? 0 : (a / b) * 100;
    case "safe_div": return b === 0 ? 0 : a / b;
  }
}

export function describeFormula(node: FormulaNode): string {
  if ("metric" in node) return METRIC_LABELS[node.metric] ?? node.metric;
  if ("constant" in node) return String(node.constant);
  const a = describeFormula(node.a);
  const b = describeFormula(node.b);
  switch (node.op) {
    case "add": return `(${a} + ${b})`;
    case "sub": return `(${a} − ${b})`;
    case "mul": return `(${a} × ${b})`;
    case "div": return `(${a} ÷ ${b})`;
    case "safe_div": return `(${a} ÷ ${b})`;
    case "pct": return `(${a} ÷ ${b} × 100)`;
    case "min": return `min(${a}, ${b})`;
    case "max": return `max(${a}, ${b})`;
  }
}

export function formatKpiValue(value: number | null | undefined, unit: string, format?: { decimals?: number; prefix?: string; suffix?: string }): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = format?.decimals ?? 2;
  const prefix = format?.prefix ?? "";
  const suffix = format?.suffix ?? "";
  let body = value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  switch (unit) {
    case "currency": return `$${body}`;
    case "percent": return `${body}%`;
    case "ratio": return `${body}×`;
    default: return `${prefix}${body}${suffix}`;
  }
}
