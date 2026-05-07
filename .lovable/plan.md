## Goal

Give the agency a way to spot winning, losing, and still-learning ads across all clients, broken down by the creative levers they can actually change: image/video, primary copy, headline, and audience.

## What you'll see in the app

A new **Creatives** page (top-nav item, next to Campaigns) with:

1. **Filter bar** — Client · Date range (7d/30d/90d) · Status (All / Best / Worst / Learning)
2. **Three columns of cards** — Best performers, Learning, Worst performers — each card shows the ad thumbnail, headline, primary copy excerpt, audience name, spend, leads, CPL, CTR, status pill.
3. **Breakdown tabs** below — Aggregate the same ads by:
   - **Creative** (same image/video hash) — which visuals win across ads
   - **Headline** — which headlines win across creatives
   - **Primary copy** — which body text wins
   - **Audience** (ad set targeting name) — which audiences win
   Each row: usage count · total spend · total leads · avg CPL · win rate.
4. **Click an ad** → side drawer with full creative preview, all copy fields, audience JSON, daily trend.

## Classification logic

For the selected window:
- **Learning** — Meta `effective_status = "IN_PROCESS"` OR ad has < 50 results / < 7 days since launch (Meta's own learning-phase rule).
- **Best** — Not learning AND CPL ≤ workspace's "green" CPL threshold AND spend ≥ $50 (avoid noise).
- **Worst** — Not learning AND CPL ≥ workspace's "red" CPL threshold OR zero leads after $200 spend.
- Everything else → unclassified, hidden by default.

Thresholds come from existing `kpi_threshold_presets` (CPL spec) so the user's tuning carries over.

## Data we need to capture

Extend `meta-sync` to pull ad-level creative fields and store them. New table:

```text
meta_ads
  id (text PK = Meta ad id)
  workspace_id, client_id, ad_account_id
  campaign_id, adset_id
  name
  effective_status                -- ACTIVE / IN_PROCESS / DISAPPROVED / etc.
  -- creative
  creative_id, creative_hash      -- hash groups identical visuals across ads
  thumbnail_url, video_id
  title                           -- headline
  body                            -- primary copy
  call_to_action_type
  link_url
  -- targeting
  adset_name                      -- usually doubles as audience name
  targeting_summary jsonb         -- raw targeting spec
  -- rolling 30d performance (refreshed each sync)
  spend, impressions, clicks, leads
  ctr, cpl
  days_active
  updated_at
```

Sync flow inside `syncCampaigns` (or a new `syncAds` step): list ads with fields `id,name,effective_status,creative{id,thumbnail_url,object_story_spec,image_hash,video_id,body,title,call_to_action_type,link_url}`, then list each ad's last-30d insights, then upsert.

## Files

- New table migration: `meta_ads`
- `supabase/functions/meta-sync/index.ts` — add `syncAds(acc, conn)` step
- `src/hooks/useMetaAds.ts` — TanStack hook + adapter
- `src/pages/Creatives.tsx` — new page
- `src/components/creatives/CreativeCard.tsx` — single ad card with thumbnail
- `src/components/creatives/BreakdownTable.tsx` — aggregation table for the four breakdowns
- `src/App.tsx` + `src/components/layout/TopNav.tsx` — register `/creatives` route

## Out of scope (this pass)

- Editing creatives in-app (read-only insights only — surface a deep link to Ads Manager).
- Cross-platform creatives (Google/TikTok); Meta only for now.
- AI-generated copy suggestions (can follow up after we have the data).
