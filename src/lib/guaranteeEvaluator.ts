import type {
  ClientGuarantee,
  CriterionResult,
  GuaranteeCriterion,
  GuaranteeEvaluation,
  GuaranteeStatus,
} from "./guaranteeTypes";

interface ClientLike {
  leads?: number;
  spend?: number;
  trueLeads?: number;
}

interface EvaluationContext {
  client?: ClientLike;
  /** Count of GHL appointments in window. */
  appointments?: number;
  /** Count of GHL opportunities that are 'open' (in underwriting / pipeline). */
  deals_in_underwriting?: number;
  /** Count of GHL opportunities that are 'won'. */
  closed_deals?: number;
  /** Sum of monetary_value for won opportunities in window. */
  commission_revenue?: number;
}

function resolveActual(
  c: GuaranteeCriterion,
  ctx: EvaluationContext,
  prev?: CriterionResult,
): number {
  if (c.source === "manual" && typeof c.manual_value === "number") return c.manual_value;
  if (c.source === "manual") return 0;
  switch (c.metric) {
    case "leads":
      return ctx.client?.leads ?? 0;
    case "spend":
      return ctx.client?.spend ?? 0;
    case "appointments":
      return ctx.appointments ?? 0;
    case "deals_in_underwriting":
      return ctx.deals_in_underwriting ?? 0;
    case "closed_deals":
      return ctx.closed_deals ?? 0;
    case "commission_revenue":
      return ctx.commission_revenue ?? 0;
    case "roas": {
      const rev = ctx.commission_revenue ?? 0;
      const spend = ctx.client?.spend ?? 0;
      return spend > 0 ? rev / spend : 0;
    }
    case "applications":
      return c.manual_value ?? 0;
    case "custom":
      return c.manual_value ?? 0;
    default:
      return 0;
  }
}

function resolveTarget(c: GuaranteeCriterion, prev?: CriterionResult): number {
  if (typeof c.target_count === "number") return c.target_count;
  if (typeof c.target_conversion_pct === "number" && prev) {
    return (prev.actual * c.target_conversion_pct) / 100;
  }
  return 0;
}

function inferUnit(c: GuaranteeCriterion): "count" | "currency" | "percent" {
  if (c.unit) return c.unit;
  if (c.metric === "commission_revenue" || c.metric === "spend") return "currency";
  if (c.metric === "roas") return "count";
  return "count";
}

export function evaluateGuarantee(
  g: ClientGuarantee,
  ctx: EvaluationContext,
): GuaranteeEvaluation {
  const results: CriterionResult[] = [];
  let prev: CriterionResult | undefined;

  for (const c of g.criteria) {
    const actual = resolveActual(c, ctx, prev);
    const target = resolveTarget(c, prev);
    const progress_pct = target > 0 ? Math.min(100, (actual / target) * 100) : actual > 0 ? 100 : 0;
    const r: CriterionResult = {
      id: c.id,
      label: c.label,
      actual,
      target,
      progress_pct,
      met: target > 0 ? actual >= target : false,
      unit: inferUnit(c),
    };
    results.push(r);
    prev = r;
  }

  const totalProgress =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + r.progress_pct, 0) / results.length;
  const allMet = results.length > 0 && results.every((r) => r.met);

  const now = new Date();
  const deadline = new Date(g.deadline);
  const days_remaining = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);

  let status: GuaranteeStatus;
  if (allMet) status = "met";
  else if (days_remaining < 0) status = "failed";
  else if (days_remaining <= 7 && totalProgress < 70) status = "at_risk";
  else if (totalProgress < 40 && days_remaining < 14) status = "at_risk";
  else status = "on_track";

  return { status, progress_pct: totalProgress, results, days_remaining };
}

export function formatCriterionValue(value: number, unit: "count" | "currency" | "percent") {
  if (unit === "currency") return `$${Math.round(value).toLocaleString()}`;
  if (unit === "percent") return `${value.toFixed(2)}%`;
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

export const METRIC_LABELS: Record<string, string> = {
  leads: "Leads",
  appointments: "Appointments",
  applications: "Applications",
  closed_deals: "Closed Deals",
  commission_revenue: "Commission Revenue",
  spend: "Ad Spend",
  deals_in_underwriting: "Deals in Underwriting",
  roas: "ROAS",
  custom: "Custom",
};
