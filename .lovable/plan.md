# Lead Quality Scoring System

An automated, configurable scoring engine that grades every lead 0–100, surfaces an A/B/C/D badge, rolls up to client KPIs, drives notifications and status changes, can trigger automations, and auto-tunes its own weights from closed-deal outcomes.

## 1. Data model (new tables)

**`lead_score_rule_sets`** — a versioned bundle of weights & thresholds.
- `scope` (`workspace` | `client` | `campaign`), `scope_id`, `version`, `is_active`
- `weights` jsonb: `{ completeness, validity, crm_progression, engagement, qualifying_answers, source }`
- `qualifying_rules` jsonb: array of `{ field, op, value, points }`
- `source_modifiers` jsonb: `{ ad_id|adset_id|form_id : delta }`
- `grade_thresholds` jsonb: `{ A: 85, B: 70, C: 50 }` (anything below C = D)
- `auto_tune_enabled` bool, `last_tuned_at`

Resolution order (per lead): campaign > client > workspace, picking the highest-specificity active rule set.

**`lead_scores`** — one row per lead, recomputed on signal change.
- `lead_id`, `client_id`, `workspace_id`, `campaign_id`
- `score` numeric(5,2), `grade` text, `rule_set_id`, `rule_set_version`
- `breakdown` jsonb (per-signal points + weight contribution — for the lead drawer)
- `computed_at`, `outcome` (`unknown` | `closed_won` | `closed_lost` | `disqualified`) — set when GHL stage hits a terminal value

**`lead_score_events`** — append-only signal log used by both the scorer and the tuner.
- `lead_id`, `signal_type` (`form_submit`, `email_valid`, `phone_valid`, `duplicate`, `stage_change`, `reply_received`, `call_answered`, `time_to_response`, `qualifying_answer_matched`), `value` jsonb, `occurred_at`

**`lead_score_calibrations`** — proposed weight changes from auto-tuner, awaiting approval.
- `rule_set_id`, `proposed_weights`, `proposed_thresholds`, `evidence` jsonb (sample sizes, correlations), `status` (`pending` | `approved` | `rejected`), `created_at`

All tables: workspace-scoped RLS using existing `is_workspace_member` / `can_write_workspace` / `is_portal_user_for_client` helpers.

## 2. Scoring engine

Edge function `lead-score-compute`:
- Input: `lead_id` (or batch).
- Pulls signal events + GHL stage from `ghl_opportunities` / `ghl_appointments`, form payload from `meta_leads`/`google_leads`/`linkedin_leads`.
- Resolves the rule set (campaign → client → workspace fallback).
- Computes weighted sub-scores (0–1) → sum × 100 → grade.
- Writes `lead_scores`; emits `lead.score.updated` for downstream.

Triggers that call it:
- DB trigger on insert into `meta_leads` / `google_leads` / `linkedin_leads` / `leads` → enqueue.
- DB trigger on `ghl_opportunities` stage change → enqueue.
- New `ghl_appointments` rows → enqueue.
- Cron edge function `lead-score-recompute-stale` (every 15 min) for engagement-window updates.

Scheduling uses Supabase `pg_cron` + `pg_net` to invoke the edge function.

## 3. Auto-tuner

Edge function `lead-score-autotune` (weekly cron):
- For each rule set with `auto_tune_enabled = true` and ≥30 leads with known outcomes:
  - Computes point-biserial correlation between each signal contribution and `outcome = closed_won`.
  - Suggests new weights (normalized so they sum to 1) and grade thresholds (precision/recall sweep).
  - Writes a row to `lead_score_calibrations` (status `pending`).
- A bell in the UI prompts the workspace owner to review & approve.
- On approval: bumps rule set version, recomputes all affected lead scores.

## 4. UI

**Settings → Lead Scoring** (workspace level)
- List rule sets (Workspace / Client / Campaign tabs).
- Editor: weight sliders, qualifying-rule builder, source modifier table, grade thresholds, auto-tune toggle.
- "Preview on recent 50 leads" — shows score distribution before saving.
- Calibration inbox: pending proposals with diff vs current, approve / reject.

**Leads view**
- Score column with grade pill (A green / B blue / C amber / D red).
- Filter by grade, sort by score.
- Quality distribution sparkline per client.

**Lead drawer**
- Score breakdown: each signal, raw value, points, weighted contribution.
- "Why this score" plain-language summary.

**Client dashboard**
- New KPI tile: avg lead quality (last 30 days) + delta.
- Quality factors into client RED/YELLOW/GREEN via `compute_client_status` (add `lead_quality` KPI key resolved from `lead_scores` avg).

## 5. Notifications & automations

New notification types (using existing `notifications` + `notification_preferences` pattern):
- `lead_quality_drop` — client avg drops below threshold.
- `score_calibration_ready` — auto-tuner has suggestions.

Automation hooks (new `lead_score_automations` table — fire when grade meets condition):
- Pause ad set in Meta (uses existing `meta-ad-status` function).
- Create ClickUp task (existing pattern).
- Trigger form-swap workflow `05-form-swap`.

## 6. Rollout phases

Build in this order so the user gets value early:

1. **Schema + scoring engine + Leads view badges** — the core. Manual rule editing only.
2. **Client KPI rollup + notifications**.
3. **Per-client and per-campaign rule sets + rule editor UI**.
4. **Automations hooks**.
5. **Auto-tuner + calibration inbox**.

## Technical notes

- All score computation in edge functions, never client-side.
- `breakdown` jsonb keeps the math transparent and auditable.
- Rule sets are versioned so historical scores remain explainable.
- Cron jobs registered via `supabase--insert` (not migration) since they contain project-specific URLs.
- TanStack Query keys: `["lead_scores", workspaceId, clientId]`, invalidated by Realtime channel on `lead_scores`.

## Out of scope (for now)

- ML model beyond linear weight tuning (can add gradient boosting later if needed).
- Cross-workspace benchmarking.
- Lead enrichment via 3rd-party data providers.
