## Problems

1. **Campaign rows don't react to the date picker.** In `src/pages/ClientProfile.tsx`, the merge of snapshot campaigns + range insights keeps the snapshot's lifetime `spend`/`leads`/`cpl`/`cpm` when a campaign has no rows in the selected range. That's why Sean Riley / Capital Concepts shows the same numbers regardless of the chosen range.

2. **Averages include past (paused/ended) campaigns.** The KPI aggregation iterates every campaign for the client, so paused campaigns dilute the live CPL / CPM / Frequency tiles.

## Fix

### 1. Make every campaign row range-driven (`src/pages/ClientProfile.tsx`, ~lines 202–253)

For each snapshot campaign, if there is no matching `meta_insights_granular_daily` row in the selected range, render the row as zeroed for the date-range metrics (spend, leads, trueLeads, cpl, trueCpl, cpm, impressions, clicks, ctr, frequency, adSets count, ads count, adSetsDetail). Keep snapshot-only fields that aren't time-bound (name, status, doubleCount flag, issuesStatus).

Result: switching the date picker recomputes spend/leads/CPL per campaign from `meta_insights_granular_daily` only. Campaigns with no activity in the range show $0 / 0 leads instead of lifetime totals.

### 2. Restrict KPI averages to active campaigns (same file, ~lines 254–281)

Change the `agg` reducer to iterate `activeCampaigns` instead of `clientCampaigns`. This affects:
- `liveSpend`, `liveLeads`, `liveCpl`
- `liveCpm` (spend-weighted across active)
- `liveFreq` (spend-weighted across active)
- `hasLiveData` gate

Header / KPI tiles (CPL, Leads MTD, CPM, Frequency) then reflect active campaigns only. Paused/ended campaigns still appear in the Campaigns tab list with their own (now range-correct) numbers, but no longer dilute the client-level averages.

### 3. Same active-only treatment for the Campaigns tab header counter

The "X active · Y total" line stays informational; no change needed.

## Files touched

- `src/pages/ClientProfile.tsx` — merge logic + KPI aggregation.

No schema, hook, or other component changes required. `useClientCampaignsRange` already returns range-correct data; we just stop falling back to snapshot lifetime numbers.

## Verification

- Open Capital Connecpts / Sean Riley, switch date range between `Today`, `Last 7 days`, `Last 30 days`, and a custom historical range — per-campaign spend/leads/CPL change.
- Pause a campaign (or pick a client with paused campaigns) and confirm CPL/CPM/Frequency tiles match the active-campaign math.
