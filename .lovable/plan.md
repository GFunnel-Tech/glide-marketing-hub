# AI Account Optimization — build plan

Your project already has the bones for this (pending-actions queue, optimization rules table, custom KPIs, ops scan, audit log). I'll extend those instead of duplicating, then add the missing pieces: manual / external data points, client context for the AI, plain-English rules, creative-swap and flag-only actions, and a unified "AI Decisions" approval inbox.

## What you'll see in the app

**Per-client (Client Profile → AI tab):**
- **Optimization Rules** (existing visual builder, untouched)
- **NEW · AI Rules (plain English)** — type `"If CPL > $80 for 3 days, pause the worst ad and notify me"`. AI parses it into a structured spec you can review before saving.
- **NEW · Client Context for AI** — free-text box: `"Only takes leads M–F · avg deal $5k · don't pause weekend campaigns"`. Sent with every AI scan for this client.
- **NEW · Manual data points** — e.g. `target_cac = 80`, `min_daily_leads = 5`. AI treats these as goals.
- **NEW · External data points** — paste a URL the AI can GET (e.g. CRM close-rate webhook). Refreshed before each scan.
- **Custom KPIs** (existing formula builder, untouched)

**Workspace-level (AI Assistant page):**
- **NEW · AI Decisions inbox** — every proposed action with a one-line "why", the data the AI saw, and Approve / Reject / Snooze. Bulk approve. Auto-refresh.
- **Audit log** (already exists) — every decision approved, rejected, executed, or failed.

## What the AI will do each run (every 30 min + on demand)

For each active client, the AI:
1. Pulls the last 7/14/30 days of Meta + GHL metrics.
2. Reads the client's visual rules, plain-English rules, manual targets, external data, custom KPIs, and context notes.
3. Calls Lovable AI (`google/gemini-3-flash-preview`) with all of the above as structured input.
4. Returns a list of proposed actions, each with a reason, severity, and confidence.
5. Inserts them into `ai_pending_actions` with `status='proposed'` — **nothing executes until you click Approve** (per your choice).

Action types the AI can propose:
- `pause_ads` / `unpause_ads` — already wired
- `adjust_budget` — already wired
- `swap_creative` — **NEW**: rotate to a better-performing creative from `ad_templates`
- `flag_only` — **NEW**: just create a notification + task, no Meta change

## Technical details

### Database (one migration)

1. `custom_kpis`: add `kind` (`'formula' | 'manual' | 'external'`), `manual_value numeric`, `external_url text`, `external_headers jsonb`, `last_external_value numeric`, `last_external_fetched_at`.
2. `clients`: add `ai_context text` (free-text context for AI).
3. New table `client_ai_rules`:
   - `client_id`, `workspace_id`, `prompt text` (plain English), `parsed_spec jsonb` (AI-parsed structured rule), `enabled bool`, `last_parsed_at`, `parse_error text`.
   - RLS: workspace members read/write.
4. Extend `ai_pending_actions.action_type` to include `'swap_creative'` and `'flag_only'` (it's a text column already — just code-level enum).

### Edge functions

- **NEW `ai-rule-parse`** — accepts `{ prompt, client_id }`, calls Lovable AI to convert plain English into the same shape as `client_optimization_rules`, returns `{ spec, explanation, warnings }`. Saved to `client_ai_rules.parsed_spec`.
- **NEW `ai-external-fetch`** — fetches all external data points for a workspace before each scan, with a 10s timeout each.
- **Extend `ai-ops-scan`** — gather rules + context + KPIs + external + manual values, batch into an AI call per client, parse proposed actions, write to `ai_pending_actions` (status `proposed`, never auto-approved).
- **Extend `ai-pending-execute`** — handle `swap_creative` (calls `meta-ad-update` with new creative_id) and `flag_only` (insert notification + task).

### Frontend

- New components:
  - `src/components/ai/AiRulesPanel.tsx` (plain-English rule editor + parse preview)
  - `src/components/ai/ClientContextPanel.tsx` (textarea + manual data points editor)
  - `src/components/ai/ExternalDataPanel.tsx` (URL list with test-fetch button)
  - `src/components/ai/AiDecisionsInbox.tsx` (workspace-level approval queue)
- Extend `CustomKpisPanel` to switch between Formula / Manual / External in the editor sheet.
- Mount the per-client panels in `ClientProfile.tsx` under the existing AI tab.
- Mount the inbox at the top of `AiAssistant.tsx`.

### Safety

- Approval is **always required** (matches your choice). No auto-execute path.
- Each proposed action stores the full snapshot the AI saw (`payload.context`), so you can audit why later.
- Plain-English rules show the parsed structured version before save — you can edit it directly.
- External URLs are workspace-scoped and require workspace admin to add.

## What I'll need from you

Nothing — `LOVABLE_API_KEY` is already configured, and all action plumbing (Meta ads, notifications, tasks) is already in place.

## Out of scope (for this round)

- Auto-execute mode (you chose approval-only)
- Slack / email digest of pending decisions (can add later)
- AI learning from rejections (can add a "why rejected" prompt later)

Ready to build?