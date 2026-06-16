## Goal
When a client's Stripe charge fails (or a subscription invoice fails), surface it as a real notification to the agency team and record it in a dedicated, queryable log — so issues like a declined card on Cameron Race's account are never silently missed.

## What we'll build

### 1. New `payment_events` log table
A dedicated audit log for billing problems (separate from generic `notifications` so we can filter, export, and resolve them).

Fields:
- workspace_id, client_id, stripe_user_id, stripe_charge_id
- event_type: `charge_failed` | `charge_refunded` | `invoice_payment_failed` | `charge_disputed`
- amount, currency, failure_code, failure_message, customer_email
- severity: `warn` | `critical` (critical = failed, disputed; warn = refund)
- status: `open` | `acknowledged` | `resolved`
- acknowledged_by / resolved_by / resolved_at
- raw (jsonb), created_at

RLS: workspace members read; only admins/owners can resolve. Service role writes from the webhook.

### 2. Wire the existing per-client Stripe webhook to emit events
`supabase/functions/stripe-client-webhook/index.ts` already mirrors charge events into `stripe_charges`. We'll add: on `charge.failed`, `charge.refunded`, `charge.dispute.created`, and `invoice.payment_failed`, also insert a row into `payment_events` and a corresponding `notifications` row (type `payment_failed`) for every workspace member with the pref enabled. The `payment_failed` notification type is already in the preference seeder.

### 3. Backfill from existing failed charges
One-time pass over `stripe_charges` where `status='failed'` in the last 90 days → seed `payment_events` so the new log isn't empty on day one.

### 4. UI: Payment Issues panel on the Billing dashboard
A new section above the client table in `BillingDashboard.tsx`:
- Counts: Open, This week, Resolved (30d)
- List of open events with client name, amount, failure reason, time, and Acknowledge / Resolve buttons
- Filter by severity, click-through to the client

The existing red "X payments need attention" banner stays but starts pulling from `payment_events` (live source of truth) instead of being derived only from the latest charge per client.

### 5. Notifications bell integration
`payment_failed` notifications already flow through the existing bell + realtime channel — no new plumbing, just confirm the pref defaults to on (it already does per the recent seeder change).

## Out of scope (ask if you want them)
- Email/SMS delivery of payment failure alerts (currently in-app only)
- Auto-retry / dunning logic
- Slack / webhook fan-out

## Technical notes
- New table: `public.payment_events` with GRANTs to authenticated + service_role, RLS scoped via `is_workspace_member` / `workspace_role_of`.
- Webhook handler stays signature-verified per client (already implemented).
- For the Stripe sync backfill function (`stripe-sync-all-charges`), also emit `payment_events` for any newly-discovered failed charges so manual syncs surface issues too.
- Index on `(workspace_id, status, created_at desc)` for the dashboard query.

## Open questions
1. Should "refunds" count as a payment event (warn) or be excluded?
2. Want a severity threshold (e.g. only alert on charges ≥ $X) to avoid noise from $1 card-validation failures?
