
# Multi-Channel Ad Creator — Phase 1

## Goal

Let users **act on existing ads** (duplicate, scale budget, pause, edit copy) on Meta today, with an architecture that drops in Google / TikTok / LinkedIn next without a rewrite.

## Phase 1 — Tier 1 actions on Meta (this iteration)

### 1. Re-authorize Meta with `ads_management` scope

Current Meta OAuth only requests `ads_read` + `leads_retrieval`. Writing requires `ads_management`. We'll:
- Update `meta-oauth-start` to include `ads_management`
- Add a banner on the Creatives / Ads pages: *"Re-connect Meta to enable ad creation"* when scope is missing
- Track granted scopes on `meta_connections.scopes` (column already exists)

### 2. Channel-adapter foundation (multi-channel ready)

New folder `src/lib/adChannels/` with a shared interface:

```text
adChannels/
  types.ts           ChannelAdapter interface (duplicateAd, updateBudget, pauseAds, updateCreative, createAd…)
  meta.ts            Meta implementation (calls edge functions)
  google.ts          stub — throws "Not yet supported"
  tiktok.ts          stub
  linkedin.ts        stub
  index.ts           getAdapter(channel)
```

UI components import `getAdapter("meta" | "google" | …)` and never know channel specifics.

### 3. New edge functions (Meta only for now)

| Function | Purpose |
|---|---|
| `meta-ad-duplicate`   | Clone an existing ad into a new ad set (or same ad set) with optional budget + name override |
| `meta-ad-update`      | PATCH headline / primary text / CTA / link on existing creative (creates new creative + swaps) |
| `meta-ad-budget`      | Scale ad-set daily/lifetime budget by % or absolute value |
| `meta-ad-status`      | Pause / resume one or more ads or ad sets |

All four call Meta Marketing API v19.0 with the connection's access token, log to `meta_sync_log`, and return the new IDs.

### 4. UI — "Actions" on each ad

In `CreativeCard` and `AdDetailDrawer`:
- New **Actions** menu (kebab) per ad: Duplicate, Scale budget +20%, Pause, Edit copy
- "Edit copy" opens a small dialog with headline / primary text / CTA / link fields, prefilled from the current creative
- "Duplicate" opens a dialog: choose target ad set (or "same"), new budget, new name, then confirm
- All actions show optimistic toasts and refresh `meta_ads` query on success

### 5. New top-level page: `/ads`

A unified **"Ads"** page (separate from `/creatives` which stays as the analytics view):
- Channel tabs: Meta · Google · TikTok · LinkedIn (Google/TikTok/LinkedIn show "Coming soon" empty state)
- Filter chips: status (active/paused), client, search
- Table of ads with inline action buttons (same actions as above)
- Top-right: **"+ New Ad"** button — disabled in Phase 1 with tooltip *"Full ad builder coming in Phase 2"*

## Phase 2 — Full guided ad builder (next iteration, scoped here for visibility, NOT built now)

- Multi-step wizard: Objective → Audience → Placements → Budget/Schedule → Creative → Lead form
- Media uploader → Meta `/adimages` and `/advideos`
- Creative composer with live ad preview
- Lead form builder (questions, privacy URL)
- Submit → poll review status

## Technical details

**Database** — minimal additions:
```text
ad_action_log (
  id, workspace_id, client_id, channel, action,
  source_object_id, result_object_id,
  status, error_message,
  performed_by, created_at
)
```
Used as a unified audit trail across channels. RLS: workspace members read; members write.

**Meta API specifics**
- Duplicate uses `POST /act_{id}/ads` with `creative={creative_id:...}` reusing the source creative; budget changes happen on the parent ad set, not the ad
- Edit copy creates a **new** creative (Meta creatives are immutable) then PATCHes the ad to point at it
- All calls go through the workspace's `meta_connections.access_token`, validated with the `ads_management` scope

**Channel adapter interface**
```ts
interface ChannelAdapter {
  duplicateAd(input): Promise<{ newAdId: string }>;
  updateBudget(input): Promise<void>;
  setStatus(input): Promise<void>;
  updateCreative(input): Promise<{ newCreativeId: string }>;
  // Phase 2:
  createCampaign?, createAdSet?, createAd?, uploadMedia?
}
```

## What you'll see when this ships

1. A **"Re-connect Meta"** banner once (to grant `ads_management`)
2. New **Ads** entry in the top nav → multi-channel tabbed view
3. Action buttons on every Meta ad (in both `/ads` and `/creatives`)
4. Real Meta API calls — duplicating an ad in your dashboard creates a real ad in Ads Manager
5. An audit log of every action under the hood

## Out of scope (Phase 2+)

- Creating ads from scratch / media upload / lead form builder
- Google / TikTok / LinkedIn implementations (adapters are stubs)
- AI-generated ad copy variants
- Bulk actions across many ads at once
