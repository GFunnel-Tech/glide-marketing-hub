## AI Operations — full-stack rollout

You already have most plumbing (`ai-agent`, `ai-pending-execute`, `ai-optimization-cron`, `ai_pending_actions`, `ai_action_audit_log`, `client_optimization_rules`, `custom_kpis`, `OptimizationRulesPanel`, per-client `AgentChat`). This plan layers portfolio-wide intelligence on top instead of starting over.

### 1. Data layer (read-only views — no schema churn)

New SQL views + RPCs the AI and UI both read. Adds nothing user-facing to the schema, just makes "all data" queryable cheaply.

- `v_client_kpi_snapshot` — per client: spend, leads, CPL, CPM, CTR, frequency over 7d / 30d / MTD; trend deltas vs prior period; sync-failure count; open opportunities; appointments booked; guarantee progress; current status; red KPIs (from `client_red_kpis`).
- `v_portfolio_snapshot` — workspace rollup: totals, medians, P75/P90 CPL, top movers, top losers.
- `v_client_peer_cohort(client_id)` — same-workspace clients in the same brand/vertical bucket for benchmarking.
- RPC `forecast_client_eom(client_id)` — linear projection on last 14 days of `meta_insights_daily` for spend, leads, CPL through end of month; returns `{projected_spend, projected_leads, projected_cpl, vs_guarantee}`.
- RPC `detect_client_anomalies(client_id)` — z-score on 14-day baseline for CPL, CPM, CTR, frequency, lead volume, sync-failure rate; returns array of `{metric, severity, value, baseline, delta}`.

### 2. Edge functions

- `ai-ops-scan` (new, cron every 30 min):
  1. Loop active workspaces → for each client, call `detect_client_anomalies` + `forecast_client_eom` + `client_red_kpis`.
  2. Decide actions via Lovable AI (gemini-3-flash). Tool calls: `propose_pause_ad`, `propose_scale_budget`, `propose_swap_form`, `propose_duplicate_winner`, `log_insight`.
  3. **Safe-action auto-execute** (autonomy = "auto-execute safe actions"): if `action_type ∈ {pause_ad}` AND severity=high AND confidence ≥ threshold from `client_optimization_rules` → insert into `ai_pending_actions` with `status='approved'`, `approved_by=NULL`, `auto_executed=true`. The existing `ai-pending-execute` already runs approved actions.
  4. Anything else inserted as `status='proposed'` for human review.
  5. Write insights/forecasts/anomalies into a new `ai_insights` table (see §3) so the UI doesn't recompute.

- `ai-ops-chat` (new, streaming): portfolio-aware chat. Same `streamText` setup as `ai-agent` but the system prompt has access to tools that query `v_portfolio_snapshot`, `v_client_kpi_snapshot`, `v_client_peer_cohort`, `forecast_client_eom`, `detect_client_anomalies`, plus the existing action-proposal tools.

- Extend `ai-agent` (per-client): add the forecast / anomaly / peer-cohort tools so the per-client AI tab gets the same brain, scoped to one client.

### 3. New table

```
ai_insights (
  id, workspace_id, client_id, kind,        -- 'anomaly'|'forecast'|'recommendation'|'benchmark'
  severity,                                  -- 'info'|'warn'|'critical'
  title, body, metrics jsonb, reasoning,
  source,                                    -- 'ai-ops-scan'|'manual'
  status,                                    -- 'open'|'dismissed'|'acted_on'
  related_action_id,                         -- FK to ai_pending_actions
  created_at, dismissed_at, dismissed_by
)
```
RLS: workspace members read/update; service_role full. Grants per Lovable Cloud rules.

### 4. UI surfaces

**a) New `/ai` page (Operations command center).** Three columns:
- Left: portfolio rollup (`v_portfolio_snapshot`) + "Today's top risks" (top 10 critical insights).
- Center: streaming portfolio chat (`ai-ops-chat`), with quick prompts ("Which 3 clients need attention?", "Forecast end of month", "Compare Joseph Bui vs peers").
- Right: pending-actions queue (existing `PendingActionsPanel`, workspace-scoped) + auto-executed-actions log filtered from `ai_action_audit_log`.

**b) Per-client AI tab** (already exists): add an "Insights" header that shows `ai_insights` for that client (forecast vs guarantee, anomalies, peer benchmarks) above the chat. Same chat component, now backed by the upgraded `ai-agent` with new tools.

**c) Home dashboard widget**: small "AI Insights" card — count of open critical insights + 3 most recent, "Open AI Ops →" link. Add to `Index.tsx` next to existing KPIs.

**d) Auto-execute transparency**: anywhere actions are shown, badge auto-executed rows with "⚡ Auto" and surface them in a toast/notification when they run, so nothing happens silently.

### 5. Existing nav

Add an "AI Ops" link to `TopNav` (already has `/ai` route — just rename `AiAssistant` → `AiOps` and rebuild that page, or keep `AiAssistant` and add `/ai/ops`). Reuse the existing route to minimize churn.

### 6. Order of work (one PR per step, each verifiable)

1. Migration: `ai_insights` table + grants + RLS, plus the SQL views and the two RPCs.
2. `ai-ops-scan` edge function + cron schedule (every 30 min) + secrets check.
3. `ai-ops-chat` edge function with portfolio tools.
4. Extend `ai-agent` with the new tools (per-client scope).
5. Rebuild `/ai` page as the Operations center.
6. Insights header on per-client AI tab.
7. Dashboard widget on home.
8. Auto-execute badge + toast.

### Technical notes

- Models: `google/gemini-3-flash-preview` for scan/chat, `google/gemini-2.5-pro` for the weekly deep cross-client benchmarking pass (lower volume, higher quality).
- `stepCountIs(50)` on agent loops per knowledge.
- Forecasts and anomalies are deterministic SQL — the AI just *interprets and decides*, it doesn't do the math. Keeps spend low and results auditable.
- "Safe action" = configurable per workspace in `client_optimization_rules` (already exists). Default safe set: `pause_ad` when CPL > 3× baseline for 3+ days AND spend ≥ $50. Everything else stays proposal-only until a human approves.
- Cost: scan runs once every 30 min over all clients in one prompt batch per workspace, not per client, to keep token usage bounded.

Will start with step 1 (migration) on your go.
