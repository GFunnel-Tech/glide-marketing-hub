## Custom KPIs + Custom Notifications

Lets users define their own metrics (e.g. "Lead-to-Appointment %", "Profit per Lead") with a visual formula builder, set thresholds + trend rules, and get notifications when those rules trigger.

### 1. Data model (new tables)

- **`custom_kpis`** — formula definitions
  - `workspace_id`, `client_id` (nullable → workspace default when null)
  - `name`, `description`, `unit` (`currency` | `percent` | `number` | `ratio`)
  - `format` (decimals, prefix/suffix)
  - `direction` (`lower_better` | `higher_better` | `range`)
  - `formula` (jsonb AST from the visual builder, see below)
  - `enabled`, `sort_order`, `created_by`

- **`custom_kpi_alerts`** — alert rules tied to a KPI
  - `custom_kpi_id`, `workspace_id`, `client_id` (nullable)
  - `trigger_type`: `threshold` | `trend`
  - `threshold` jsonb: `{ op: 'gt'|'lt'|'between', value, value2? }`
  - `trend` jsonb: `{ window_days, compare_to: 'prev_period'|'prev_week', change_pct, direction: 'up'|'down'|'either' }`
  - `severity` (`info`|`warning`|`critical`), `cooldown_minutes`
  - `notify_channels` jsonb: `{ in_app: true, email: [] }`
  - `enabled`, `last_fired_at`

- **`custom_kpi_evaluations`** — history of computed values
  - `custom_kpi_id`, `client_id`, `period_start`, `period_end`, `value`, `inputs` jsonb, `created_at`
  - lets the trend evaluator compare current vs prior, and powers a sparkline in the UI

All three: workspace-scoped RLS (`is_workspace_member` read, `can_write_workspace` write, owner/admin delete) plus portal-user read on the per-client view.

### 2. Formula AST (visual builder output)

JSON structure the builder produces and the server evaluates:

```text
{ "op": "div",
  "a": { "metric": "meta.spend" },
  "b": { "op": "add",
         "a": { "metric": "ghl.appointments" },
         "b": { "constant": 1 } } }
```

Allowed nodes: `metric`, `constant`, and ops `add`, `sub`, `mul`, `div`, `min`, `max`, `pct` (a÷b×100), `safe_div` (0 if denominator 0).

Available metric tokens (all of "Everything available"):
- `meta.spend`, `meta.impressions`, `meta.clicks`, `meta.leads`, `meta.ctr`, `meta.cpm`, `meta.frequency`, `meta.cpl`
- `ghl.opportunities`, `ghl.appointments`, `ghl.pipeline_value`, `ghl.opps_won`
- `leads.true`, `leads.reported`, `leads.double_count` (0/1)
- `override.<key>` for any value in `client_kpi_overrides`

Evaluator is a pure TS function: walks the AST, looks up metrics from a pre-fetched per-client snapshot, returns `{ value, inputs }` so the UI can show "shown because spend=$1,240 / leads=12".

### 3. Visual builder UI

`src/components/kpi/FormulaBuilder.tsx` — token-based row editor:

```text
[ metric ▾ ]  [ ÷ ▾ ]  [ ( ]  [ metric ▾ ]  [ + ▾ ]  [ 1 ]  [ ) ]
```

- Click a token to swap it; `+` button appends; group/ungroup with parentheses chip.
- Live preview pane shows: formula in plain English, sample value computed against the currently selected client's latest snapshot, and validation errors (divide-by-zero risk, unknown token).
- No raw text input — purely click-to-build.

### 4. Management UI

New route **`/settings/custom-kpis`** with tabs:

- **KPIs** — list with name, scope (workspace/client), formula chip, latest value, sparkline, enabled toggle, edit/delete.
- **Alerts** — list grouped by KPI, severity badge, trigger summary ("CPL > $50" or "Form CVR ↓ 20% vs last 7d"), last fired, enabled toggle.
- **Drawer** for create/edit: name, scope picker (workspace default or specific client), unit/format, direction, FormulaBuilder, then alerts section with threshold + trend sub-forms.

Per-client overrides live on the existing **Client Profile** page under a new "Custom KPIs" tab, listing inherited workspace KPIs with an "Override for this client" action that clones the formula or thresholds.

### 5. Display surfaces

- **Agency Dashboard** — new "Custom KPIs" strip above the client table, showing workspace-default KPIs aggregated across visible clients.
- **Client Profile / Client Portal** — custom KPIs render in the KPI grid alongside core metrics, respecting client overrides.
- All values come from the evaluator + `custom_kpi_evaluations` snapshot so numbers match what alerts fire on.

### 6. Evaluation + alerting

- **Edge function `custom-kpi-evaluate`** — for one workspace (or all clients), loads the metric snapshot from `meta_insights_daily`, `ghl_*`, `meta_leads`, `clients`, evaluates each enabled KPI per client, inserts into `custom_kpi_evaluations`.
- **Edge function `custom-kpi-alert-check`** — runs after evaluation:
  - Threshold: compare latest value vs rule.
  - Trend: compare latest window aggregate vs prior window using `custom_kpi_evaluations`.
  - On fire: insert into `notifications` (existing table, `type='custom_kpi_alert'`), respect `cooldown_minutes`, send email via existing transactional path if requested.
- **pg_cron** schedules `custom-kpi-evaluate` every 15 min (same cadence already used for Meta sync).

### 7. Notifications wiring

- Reuse existing `notifications` table + bell UI — new `type='custom_kpi_alert'` with deep-link to the KPI drawer.
- New row in `notification_preferences` event: `custom_kpi_alert`, so users can mute per-workspace.
- Severity styles the bell badge color.

### Technical notes

- AST evaluator: pure-TS module shared by frontend (preview) and edge function (canonical). Lives at `supabase/functions/_shared/kpiFormula.ts` plus a thin re-export at `src/lib/kpiFormula.ts` (frontend copy, kept in sync — small, ~150 lines).
- Server-side validation rejects unknown metric tokens, deeply nested ASTs (>16 levels), and division by literal 0.
- All UI in `src/components/kpi/` and `src/pages/settings/CustomKpis.tsx`; types in `src/hooks/useCustomKpis.ts`.
- Permission: only `owner`/`admin` can create/edit/delete KPIs and alerts; members can view.
- Backfill: on first deploy, no rows; users add KPIs from scratch. Existing CPL/CPM/Frequency stay where they are — custom KPIs are additive.

### Out of scope (can add later)

- Plain-text formula editor (we chose visual).
- Cross-client aggregations inside one KPI (e.g. average across clients).
- Slack/SMS notification channels (in-app + email only for v1).
