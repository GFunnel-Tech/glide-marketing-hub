## Problem

For Tim's client (client 27 in workspace `admin's Workspace`), the dashboard shows ~$1,562.59 spend for Jun 10–15 instead of the real $307-ish.

Root cause, traced in the data:

1. `useClientsRangeMetrics` (the hook that drives date-ranged Spend/Leads/CPL on the All-Clients table) only maps insights → client through `meta_ad_accounts.client_id`.
2. Tim's ad account `act_1133577078368578` lives in a different workspace (`tim's Workspace`) and has `client_id = NULL` there. There is also no row in `meta_ad_account_clients` for it.
3. So `rangeMetrics[27]` is empty.
4. `ClientHierarchyTable` falls back to `campSpend = sum(campaigns.spend)` — and `campaigns.spend` is the **static last-sync snapshot** (lifetime/last-30d-ish), not the picker's date range. That's why the number doesn't move with the date picker and is far higher than the actual June 10–15 spend.

True date-ranged spend from `meta_insights_granular_daily` for those campaigns is $782.71 across Jun 10–14 (still doesn't match $307, but it is the legitimate source of truth — the $1,562 is wrong because it ignores the date range entirely).

The same pattern affects every client whose Meta account isn't directly linked through `meta_ad_accounts.client_id` in the current workspace, so this is a global fix, not a Tim-only fix.

## Fix

### 1. Range metrics must resolve client by all linkage paths

Update `src/hooks/useClientsRangeMetrics.ts` so an insights row is attributed to a client through any of:

- `meta_ad_accounts.client_id` (current path)
- `meta_ad_account_clients` join (shared accounts; already partially supported elsewhere)
- `campaigns.client_id` looked up by `campaign_id` for campaign-level rows in `meta_insights_granular_daily`

Algorithm:

```text
1. Load all campaigns in the workspace → Map<campaign_id, client_id>.
2. Load meta_ad_accounts (workspace_id = ws) → Map<acct_id, client_id?>.
3. Load meta_ad_account_clients (workspace_id = ws) → Map<acct_id, client_id[]>.
4. For daily aggregates, prefer per-campaign attribution from
   meta_insights_granular_daily (level='campaign'), summing spend / impressions /
   clicks / leads / frequency*impr per client_id resolved via campaign_id.
5. Fall back to meta_insights_daily for any ad_account whose campaigns aren't
   represented in granular (avoid double-counting: only use the daily row for
   an account on dates where no granular campaign row exists for that account).
```

This makes the date-ranged spend correct for clients whose accounts are shared, unlinked, or only reachable via campaign assignment.

### 2. Stop the static `campaigns.spend` fallback from polluting date-ranged totals

In `src/components/dashboard/ClientHierarchyTable.tsx` (≈ line 668–676):

- Remove the `pick(rmVal, campSpend)` fallback for Spend / Leads / Clicks / Impressions / CPL / CPM. When a date range is active, an absent `rangeMetrics` entry means "0 in this window", not "use the lifetime snapshot."
- Keep the static `campaigns.spend` only as a hint for the "hide rows with zero data" filter, not as a displayed number.

After step 1, `rangeMetrics` will be populated for every client that actually has insights, so the visible side effect of removing the fallback is that genuinely zero-spend windows now show $0 instead of a misleading lifetime number.

### 3. Same fix for per-campaign drilldown

`useClientCampaignsRange` already reads `meta_insights_granular_daily`, but it bails out when the client has no `meta_ad_accounts` row (`if (acctIds.length === 0) return []`). Replace that gate with:

- Resolve the campaign ids for the client from `campaigns WHERE client_id = ?`.
- Query granular insights by those `object_id`s (campaign level) instead of (or in addition to) `ad_account_id IN (...)`. Then aggregate per campaign as today.

This makes the campaign drilldown honest for the same set of clients.

### 4. Verification

- Reload `/?preset=custom&from=2026-06-10&to=2026-06-15` while impersonating Tim → expect client 27 Spend ≈ $782.71 (the actual granular total) instead of $1,562.59, and to react when the date range changes.
- Spot-check at least one client whose account is directly linked (`meta_ad_accounts.client_id` set) to confirm numbers are unchanged.
- Spot-check a shared account (row in `meta_ad_account_clients`) to confirm spend splits / attributes as expected.

## Out of scope

- Reconciling our reported number against what Meta Ads Manager shows in the user's browser for $307. That requires comparing our pulled insights to Meta's UI for the same window and is a sync-accuracy question, not an attribution bug. If the granular total ($782.71) still disagrees with Meta Ads Manager after this fix, we'll open a separate investigation into the meta-sync job (timezone, attribution window, excluded campaigns).
