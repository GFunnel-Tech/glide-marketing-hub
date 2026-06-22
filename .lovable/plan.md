# Tiered Meta polling — leads first

Leads are revenue. If the Facebook Lead Form → GHL bridge stalls, every minute = lost contacts. So **leads sync is the top tier** and runs the most aggressively. Insights/spend tier below it.

## The tiers (re-ranked)

| Priority | Tier | Job | Frequency | What it pulls |
|---|---|---|---|---|
| **P0 — Revenue** | Critical | `meta-leads-sync` (hot accounts) | **every 3 min** | New leads from accounts that have any lead activity in the last 14 days |
| **P0 — Revenue** | Critical | `meta-lead-reconcile` (Meta→GHL gap check) | **every 5 min** | Re-checks any `meta_leads` row whose `next_check_at` is due and not yet mirrored in GHL; raises `lead_sync_missing` notification |
| **P1 — Revenue safety net** | Warm | `meta-leads-sync` (full, exhaustive) | every 30 min | All active accounts incl. cold ones, exhaustive form discovery |
| **P2 — Performance freshness** | Hot insights | `meta-sync` (account-level only, `today`) | every 20 min | Today's spend / CPM / CTR / leads count for active-spending accounts |
| **P3 — Attribution catch-up** | Warm insights | `meta-sync` (`last_3d`) | hourly | All active accounts, account-level — covers Meta's 72h attribution drift |
| **P4 — History** | Cold | `meta-sync` (`last_28d` + full granular ads/campaigns/adsets) | nightly 04:00 UTC | Everything, full granular refresh |

Manual "Sync now" in the UI keeps its current behavior (full pull).

## Why this order

Leads can't be reconstructed from a later sync — if the webhook drops one and we don't poll fast enough, it ages out and the client never hears from the lead. Insights, by contrast, are just numbers; pulling them 20 min later costs nothing real. The 3-min lead poll + 5-min reconciler gives us a < 8 min worst-case detection window on a broken Lead Form → GHL bridge, with notifications already wired (`lead_sync_failed` / `lead_sync_missing`).

## Rate-limit budget (Meta dev tier, ~200 calls/hr/user)

- Lead poll skips "cold" accounts (no leads in 14d) automatically — already in `meta-leads-sync` today, just runs more often. Realistic hot-account count per workspace is small (often < 5).
- Hot insights tier is account-level only (1 call per active account / 20 min), not granular.
- Cold granular pull moves out of the 10-min loop and runs once nightly.
- Add `rate_limited_until` on `meta_ad_accounts`: when Meta returns code 17 or 80004, stamp it and skip until cleared. Per-form backoff in `meta_lead_form_sync_state` already exists for leads.

Net effect vs today: leads polled **~3× more often**, insights API calls drop **~70–80%**.

## Technical changes

**`supabase/functions/meta-sync/index.ts`**
- Accept `{ tier: "hot" | "warm" | "cold" }` (default `"warm"` for back-compat with the manual button).
- Map tier → `date_preset`: `today` / `last_3d` / `last_28d`.
- `hot`: account-level only, skip granular ads/campaigns/adsets.
- `warm`: account-level + campaign roll-up.
- `cold`: full granular path (today's `includeDetails=true`).
- For `hot`, pre-filter accounts: clients with status in `LAUNCHING / LEARNING / GREEN / YELLOW / RED` or any spend today.
- Skip accounts where `rate_limited_until > now()`. On Meta error 17 / 80004, stamp it `now() + 30 min` and continue.

**`supabase/functions/meta-leads-sync/index.ts`**
- Already has cold-account throttling, per-form backoff, and notifications — no logic changes needed. It just runs on a tighter cron.

**Migration `tiered_meta_polling.sql`**
1. `ALTER TABLE public.meta_ad_accounts ADD COLUMN rate_limited_until timestamptz;`
2. Unschedule the existing 10-min jobs (`meta-sync-10min`, `meta-leads-sync-10min`).
3. Schedule the new cron set:
   ```text
   meta-leads-sync-3min       */3 * * * *    body: {}                  (hot accounts)
   meta-leads-reconcile-5min  */5 * * * *    (existing function)
   meta-leads-sync-30min      */30 * * * *   body: {"exhaustiveDiscovery": true, "force": true}
   meta-sync-hot-20min        */20 * * * *   body: {"tier":"hot"}
   meta-sync-warm-hourly      0 * * * *      body: {"tier":"warm"}
   meta-sync-cold-nightly     0 4 * * *      body: {"tier":"cold"}
   ```

**No frontend changes** in this step.

## Out of scope (follow-ups you mentioned)
- "Sync health" panel per account
- "Provisional today" badge in the KPI strip
- Token-expiry warnings 7 days out
