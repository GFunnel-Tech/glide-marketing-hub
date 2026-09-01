# Build log

Progress against `docs/scope-of-work.md`. Newest first.

| Item | Status | Commit | Notes |
|---|---|---|---|
| C1 · Prospect & account model | **Landed** (app), migration pending apply | `feat(C1)` | Lifecycle discriminator, account fields, prospect hooks and page. Server-side half tracked as C1b below. |
| C2 · Pipeline stage machines | **Landed** (app), migration pending apply | `feat(C2)` | Dedicated `pipelines` / `pipeline_stages`; D3 and CTV stage sets seeded; board view with days-in-stage. |

## Outstanding against landed items

### C1b — server-side exclusion of pre-sale rows
Documented at the foot of `supabase/migrations/20260901000000_c1_prospect_account_model.sql`.

These must also exclude `lifecycle <> 'client'` before prospects are created at volume:

- `compute_client_status()`, `auto_classify_new_clients()`, `recompute_all_client_statuses()`
- `rollup_client_kpis_for_workspace()`, `detect_client_anomalies()`, `purge_inactive_client_signals()`
- `forecast_client_eom()`, `client_red_kpis()`
- views `v_portfolio_snapshot`, `v_client_kpi_snapshot`
- crons `recompute-statuses-nightly`, `client-alerts-scan`, `churn-risk-detect`,
  `ad-account-billing-scan`, `kpi-breach-tasks-cron`

They were left untouched because their current definitions cannot be read from the build session, and
replacing a function body blind risks dropping logic. **Unblocked by** either database read access or the
function definitions pasted in. Until then the `lifecycle` default of `'client'` keeps all of them behaving
exactly as before; the only exposure is that a newly created prospect would be picked up by them.

### C2 — exit-criteria enforcement
Stages carry `exit_criteria` as human-readable text and the board surfaces them, but nothing blocks a move
yet. Machine enforcement needs the items that produce the evidence: R1 (discovery capture), R2 (courage
score), R4 (intelligence runs), R7 (quality gate). Enforcement lands with those.

### C2 — stage webhooks
`pipeline_stages.webhook_url` exists and is seeded empty. Firing it on stage entry belongs with H4
(order → fulfilment orchestration), which is where the n8n side gets built.

## Migrations awaiting application

Neither has been applied — the build session has no database permission. Both are additive and safe to
apply in either order relative to the app code, which tolerates the columns and tables being absent.

1. `20260901000000_c1_prospect_account_model.sql`
2. `20260901010000_c2_pipeline_stage_machines.sql`

After applying, run `select public.seed_default_pipelines('<workspace_id>');` — or click **Load default
pipelines** on the Prospects page, which calls it for the current workspace.

## Verification standard

Every landed item is checked with: production build passes, no new TypeScript errors against the
pre-existing `TopNav.tsx` baseline, and the app boots in a real browser with no new console errors.
Authenticated page renders and migration application are **not** verified from the build session.
