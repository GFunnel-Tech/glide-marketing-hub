# Shared Ad Accounts — Multi-Client Mapping

Today `meta_ad_accounts.client_id` is a single FK, so one ad account can only belong to one client. You need to map several clients to a shared ad account and split performance **by campaign**, with all mapped clients treated equally and each client's spend = sum of their mapped campaigns.

## What changes

### 1. New table: `meta_ad_account_clients` (shared-account membership)
Many-to-many link between an ad account and the clients that share it. Treated equally — no primary.

Columns: `ad_account_id`, `client_id`, `workspace_id`, `created_at`, `created_by`. Unique on (`ad_account_id`, `client_id`).

Rules: workspace members can read; admins/owners can add/remove. When this table has any rows for an account, the account is considered "shared" and `meta_ad_accounts.client_id` is treated as optional/ignored for attribution — campaign-level mapping wins.

### 2. Campaign → client mapping (already exists)
`campaigns.client_id` already drives per-client KPIs. We'll expose a UI to reassign each campaign on a shared account to one of the mapped clients. The Meta sync will:
- For accounts with no shared mapping → keep current behavior (use `meta_ad_accounts.client_id`).
- For shared accounts → assign each campaign to its currently mapped client (default: unmapped until a user picks one).

### 3. Spend / lead allocation
No allocation math needed — per your choice, each client gets the sum of their mapped campaigns. Account-level rows (`meta_insights_daily`) stay tied to the account; client-level KPIs already roll up from `campaigns` + `meta_leads.client_id`, which both carry `client_id` per row. We'll update the Meta lead router so leads on a shared account route to the client of the form's parent campaign.

### 4. UI

**a. `ClientAccountMapper` (Integrations tab)**
Add a "Shared with" multi-select on each Meta row. Picking 2+ clients converts the account to shared mode (clears the single `client_id`, inserts membership rows). Picking 1 reverts to single-owner.

**b. New "Campaign mapping" drawer**
On any shared account row, a "Map campaigns" button opens a drawer listing every campaign on that account with a client dropdown (limited to the mapped clients) + an "Unmapped" option. Saves write to `campaigns.client_id`.

**c. Client Profile → Meta Accounts section**
Show shared accounts with a "Shared with N clients" badge and a link into the campaign mapping drawer scoped to this client.

### 5. Edge function updates
- `meta-sync` / `meta-accounts-refresh`: when ingesting campaigns on a shared account, preserve existing `campaigns.client_id` mapping; for new campaigns leave `client_id` NULL until mapped.
- `meta-leads-sync`: for shared accounts, resolve `client_id` via the lead's `campaign_id → campaigns.client_id` instead of the account's `client_id`.

## Technical details

- Migration creates `meta_ad_account_clients` with the standard 4-step GRANT + RLS pattern (authenticated SELECT, members INSERT/DELETE via `can_write_workspace`).
- A SQL helper `is_shared_account(ad_account_id uuid) returns boolean` for use in the edge functions and UI queries.
- `ClientAccountMapper.tsx`: replace the single-client `Select` for Meta rows with a multi-select popover; add the "Map campaigns" affordance.
- New component `CampaignClientMapper.tsx` (drawer) reading `campaigns` filtered by `workspace_id` + the account's campaign ids (we'll add `campaigns.ad_account_id text` if not present — checking confirms it's not currently on `campaigns`, so we either add it via migration or join through `meta_ads.ad_account_id → campaign_id`). Simplest: add `ad_account_id uuid` to `campaigns` (nullable, indexed) and backfill from `meta_ads`.
- No frontend allocation math; all per-client metrics continue to come from existing `campaigns` / `meta_leads` queries.

## Out of scope
- Proportional/manual spend splits (you chose sum-of-mapped only).
- Primary-client concept (all equal).
- Splitting at ad set / ad level (campaign-level only).
