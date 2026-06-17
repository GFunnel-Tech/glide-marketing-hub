## What you actually need

Good news — the plumbing already exists. Shared ad accounts support per-campaign attribution today via `campaigns.client_id`, and there's a dedicated "Map campaigns" dialog under **Settings → Integrations → Shared ad accounts**. The metrics engine and lead sync both prefer the campaign-level mapping over the account-level one, so as soon as you tag the right campaigns to Anthony, only those campaigns' spend/leads/insights flow to him.

The only gap is discoverability: from Anthony's client profile you can see the shared account but can't open the campaign mapper from there — you have to detour through Settings.

## Plan

1. **Add a "Map campaigns" action to `MetaAccountsForClient`** (the panel on the Client Profile page).
   - For any account row flagged as Shared, add a button that opens the existing `CampaignClientMapperDialog`.
   - Pre-filter the dialog to Anthony's client so unmapped campaigns are highlighted, and default the bulk-apply target to the current client for one-click "assign all visible to Anthony".

2. **Surface unmapped-campaign warnings** on the shared-account row.
   - Show a small badge like "3 campaigns unmapped" when the shared account has campaigns with `client_id IS NULL`. Today these silently drop out of attribution.
   - Tooltip explains: "Unmapped campaigns won't count toward any client — open Map campaigns to assign them."

3. **No backend / migration changes.** `meta_ad_account_clients`, `campaigns.client_id`, `useClientsRangeMetrics`, and `meta-leads-sync` already do the right thing.

### For Anthony specifically (no code needed, do it now)
- Settings → Integrations → Shared ad accounts → find **General Real Estate Investor Loans** → click **Map campaigns** → set the relevant campaigns' client dropdown to **Anthony Grego** → Save. Leads and spend for only those campaigns will start attributing to him on the next sync.

### Technical notes
- File to edit: `src/components/integrations/MetaAccountsForClient.tsx` (~lines 196–254 — add button + unmapped-count badge).
- Reuse `CampaignClientMapperDialog` as-is; pass `adAccountId` and optionally a `defaultClientId={client.id}` prop (new optional prop, additive).
- Unmapped count: `select count(*) from campaigns where ad_account_id = ? and client_id is null`.

Want me to also (a) add a "Tag only my campaigns" quick-action that bulk-applies the current client to every campaign the user has selected in the dialog, or (b) keep it to just exposing the existing dialog from the client profile?
