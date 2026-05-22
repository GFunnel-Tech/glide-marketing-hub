// Shared KPI formula AST + evaluator.
// Mirrored at src/lib/kpiFormula.ts — keep in sync.

export type FormulaNode =
  | { metric: string }
  | { constant: number }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max" | "pct" | "safe_div"; a: FormulaNode; b: FormulaNode };

export const METRIC_TOKENS = [
  // Meta (window-aggregated)
  "meta.spend",
  "meta.impressions",
  "meta.clicks",
  "meta.leads",
  "meta.ctr",
  "meta.cpm",
  "meta.frequency",
  "meta.cpl",
  // GHL
  "ghl.opportunities",
  "ghl.appointments",
  "ghl.pipeline_value",
  "ghl.opps_won",
  // Lead truth
  "leads.true",
  "leads.reported",
  "leads.double_count",
] as const;

export type MetricToken = (typeof METRIC_TOKENS)[number] | `override.${string}`;

export type MetricSnapshot = Record<string, number>;

const MAX_DEPTH = 16;

export function validateFormula(node: FormulaNode, depth = 0): string | null {
  if (depth > MAX_DEPTH) return "Formula too deeply nested";
  if (!node || typeof node !== "object") return "Invalid node";
  if ("metric" in node) {
    if (typeof node.metric !== "string") return "Metric must be string";
    if (
      !METRIC_TOKENS.includes(node.metric as any) &&
      !node.metric.startsWith("override.")
    ) {
      return `Unknown metric: ${node.metric}`;
    }
    return null;
  }
  if ("constant" in node) {
    if (typeof node.constant !== "number" || !Number.isFinite(node.constant)) {
      return "Constant must be a finite number";
    }
    return null;
  }
  if ("op" in node) {
    const ops = ["add", "sub", "mul", "div", "min", "max", "pct", "safe_div"];
    if (!ops.includes(node.op)) return `Unknown op: ${node.op}`;
    if (node.op === "div" && "constant" in node.b && node.b.constant === 0) {
      return "Division by zero";
    }
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
  if ("metric" in node) return node.metric;
  if ("constant" in node) return String(node.constant);
  const a = describeFormula(node.a);
  const b = describeFormula(node.b);
  switch (node.op) {
    case "add": return `(${a} + ${b})`;
    case "sub": return `(${a} - ${b})`;
    case "mul": return `(${a} × ${b})`;
    case "div": return `(${a} ÷ ${b})`;
    case "safe_div": return `(${a} ÷ ${b})`;
    case "pct": return `(${a} ÷ ${b} × 100)`;
    case "min": return `min(${a}, ${b})`;
    case "max": return `max(${a}, ${b})`;
  }
}

export function collectMetrics(node: FormulaNode, into = new Set<string>()): Set<string> {
  if ("metric" in node) { into.add(node.metric); return into; }
  if ("constant" in node) return into;
  collectMetrics(node.a, into);
  collectMetrics(node.b, into);
  return into;
}
