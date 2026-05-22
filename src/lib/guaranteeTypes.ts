// Shared types for Guarantee Management

export type GuaranteeMetric =
  | "leads"
  | "appointments"
  | "applications"
  | "closed_deals"
  | "commission_revenue"
  | "spend"
  | "deals_in_underwriting"
  | "roas"
  | "custom";

export type GuaranteeSource = "meta" | "ghl" | "manual" | "auto";

export interface GuaranteeCriterion {
  id: string;
  label: string;
  metric: GuaranteeMetric;
  /** Absolute target count/amount (e.g. 2 deals, $30,000 commission). */
  target_count?: number;
  /** Conversion % from the previous step (e.g. 35% of Leads → Appointments). */
  target_conversion_pct?: number;
  /** Optional unit hint for rendering ("$", "%", "deals"). */
  unit?: "count" | "currency" | "percent";
  /** How to get the actual value. "manual" = user edits in dashboard. */
  source: GuaranteeSource;
  /** Manually entered actual value (when source = manual). */
  manual_value?: number;
  /** Notes/clarification visible on the criterion. */
  note?: string;
}

export type GuaranteeStatus = "on_track" | "at_risk" | "met" | "failed";

export interface GuaranteeTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  terms: string | null;
  duration_days: number;
  criteria: GuaranteeCriterion[];
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ClientGuarantee {
  id: string;
  workspace_id: string;
  client_id: number;
  template_id: string | null;
  name: string;
  description: string | null;
  terms: string | null;
  criteria: GuaranteeCriterion[];
  start_date: string;
  deadline: string;
  status: GuaranteeStatus;
  visible_to_client: boolean;
  last_evaluated_at: string | null;
  last_status_change_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CriterionResult {
  id: string;
  label: string;
  actual: number;
  target: number;
  progress_pct: number;
  met: boolean;
  unit: "count" | "currency" | "percent";
}

export interface GuaranteeEvaluation {
  status: GuaranteeStatus;
  progress_pct: number;
  results: CriterionResult[];
  days_remaining: number;
}
