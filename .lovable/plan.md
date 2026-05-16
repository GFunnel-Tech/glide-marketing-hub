# Phase 2 — Meta Ad Creator (Plai-style)

A new full-page ad creator modeled on the Plai screenshots: three modes (Generate / Template / Manual), live Facebook + Instagram preview, Special Ad Category support, and a Creative Bank for Dynamic Creative.

## Entry points

- New button **"+ New Ad"** on `/ads` (currently disabled) → opens objective picker modal → routes to `/ads/new?objective=leads|website|awareness|messages`.
- Same modal also reachable from a new **"Launch"** card grid on `/ads` (Meta tile = active, others = Coming soon — mirrors your Plai "Launch" screenshot).

## Objective picker modal (matches screenshot 1)

- Header: "Create a Facebook campaign"
- Top row: **Leads / Website / Awareness** primary tiles. **Messages** secondary tile underneath.
- For Leads only: sub-tiles **Leads (Instant Form) / Phone Calls / Lead Message** (we ship Instant Form; others disabled w/ tooltip).
- **Special Ad Categories** toggle + 3 cards: Housing / Financial Products / Employment (single-select when toggle on).
- Country multi-select (defaults to United States).
- "Create Campaign" → routes to builder with these params persisted in URL + Zustand draft store.

## Builder page `/ads/new`

Two-column layout:

### Left column — three tabs

**1. Generate (AI)**
- Describe what you're advertising (textarea + "Improve" button → calls `lovable-ai` edge fn, gemini-2.5-flash).
- Creative type tiles: AI Images / Product Shot / AI Avatar / Smart Creatives / Memes / Use My Own. Phase 2 ships **AI Images** + **Use My Own**; rest = "Coming soon".
- "Generate" → calls `meta-ad-generate` edge fn → returns 3–5 image variants (Gemini 3 image preview) + copy variants (primary text, headlines, CTA suggestion).

**2. Template**
- List of saved templates (new `ad_templates` table). Click → hydrates Manual form.
- "Save as template" toggle in Manual mode.

**3. Manual** — sections (collapsible, mirrors screenshots 2–5):
- **Creative**: Dynamic Ad / Standard Ad / Carousel tabs. Media uploader (images + videos, up to 10 — Creative Bank). Primary Texts list (add up to 5). Headlines list. Description. CTA dropdown. Display link.
- **Lead Form** (Leads objective only): Select existing lead form OR Create new (questions builder: name/email/phone + custom short-answer & multiple choice + intro/privacy/thank-you). OR Use template.
- **Targeting**: "Edit Targeting" drawer. Locations (multi country/region/city). Age & Gender (disabled w/ explainer when Special Ad Category active — matches screenshot). Detailed interests autosuggest (Meta Targeting Search API). Placements: Advantage+ or Manual.
- **Budget**: Daily / Lifetime. Amount input + currency. **Forecasted Results** card (Daily/Weekly/Monthly tabs, spend/clicks/reach ranges — uses Meta Reach Estimate API).
- **Optional**:
  - Optimize For Me toggle
  - **Creative Bank** panel (add up to 50 extra images / videos / ad copy — AI rotates)
  - Update Product Group toggle (stub, off by default)
  - Save prompt / Save as template toggles
  - Campaign Name input (auto-suggested)
  - UTM parameters textarea (pre-filled with `utm_source=fb_ad&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}`)

Sticky bottom CTA: **Launch Campaign** (gradient button).

### Right column — live preview

- Top tabs: **Facebook | Instagram**
- "Ad Set 1" pill + "+ Add More Ad Sets" (Phase 2 supports 1 ad set; the + button is stubbed).
- "Ad combinations" pill (cycles through creative bank variants).
- Renders a faithful FB/IG post mock: page avatar + name (from `meta_connections.page_name`), "Sponsored", media area (shows uploaded media or placeholder), primary text, headline + CTA card, like/comment/share row with mock counts.
- Updates live as the user edits Manual form (Zustand store + selector subscriptions).

## Data model (migration)

```sql
-- Drafts (autosaved every 2s)
create table ad_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id integer references clients(id) on delete set null,
  created_by uuid not null,
  channel text not null default 'meta',  -- future-proof
  objective text not null,               -- leads|website|awareness|messages
  special_ad_category text,              -- null|housing|credit|employment
  countries text[] not null default '{US}',
  state jsonb not null default '{}',     -- full form snapshot
  preview_summary jsonb,                 -- name, thumbnail_url for list views
  status text not null default 'draft',  -- draft|launching|launched|failed
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  launch_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Reusable templates
create table ad_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id integer references clients(id) on delete set null,
  created_by uuid not null,
  channel text not null default 'meta',
  objective text not null,
  name text not null,
  state jsonb not null default '{}',
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Storage bucket for uploaded creative assets
insert into storage.buckets (id, name, public) values ('ad-creatives', 'ad-creatives', true);
```

RLS: workspace-scoped read/write via `is_workspace_member` / `can_write_workspace`. Storage policy: authenticated upload to `{workspace_id}/...`, public read.

## New edge functions

1. **`meta-ad-generate`** — Lovable AI (gemini-2.5-flash for copy, gemini-3-flash-image-preview for images). Returns `{ images: string[], primaryTexts: string[], headlines: string[], description, cta }`.
2. **`meta-targeting-search`** — proxies `GET /search?type=adinterest` for autosuggest.
3. **`meta-reach-estimate`** — proxies `GET /{ad_account}/reachestimate` for Forecasted Results.
4. **`meta-lead-forms-list`** — lists existing instant forms for selected page.
5. **`meta-lead-form-create`** — creates a new instant form via `/{page_id}/leadgen_forms`.
6. **`meta-ad-launch`** — orchestrates: create Campaign (with `special_ad_categories` if set) → AdSet (with targeting, budget, placements, optimization_goal per objective) → Creative (with image_hash / video_id / asset_feed_spec for Creative Bank) → Ad. Uploads media to `/{ad_account}/adimages` first. Writes results back to `ad_drafts` + `ad_action_log`.

All use existing `meta_connections` token + `ads_management` scope.

## Frontend file map

```
src/pages/Ads.tsx                          (add Launch grid + New Ad button)
src/pages/AdCreator.tsx                    (new — builder page route /ads/new)
src/components/ads/builder/
  ObjectivePickerModal.tsx
  BuilderLayout.tsx                        (2-col + sticky launch bar)
  ModeTabs.tsx                             (Generate/Template/Manual)
  GenerateMode.tsx
  TemplateMode.tsx
  ManualMode.tsx
  sections/CreativeSection.tsx             (Dynamic/Standard/Carousel)
  sections/LeadFormSection.tsx
  sections/TargetingSection.tsx
  sections/TargetingDrawer.tsx
  sections/BudgetSection.tsx
  sections/ForecastCard.tsx
  sections/OptionalSection.tsx
  sections/CreativeBankPanel.tsx
  preview/PreviewPane.tsx
  preview/FacebookPostPreview.tsx
  preview/InstagramPostPreview.tsx
  shared/MediaUploader.tsx
  shared/InterestAutocomplete.tsx
  shared/CountryPicker.tsx
src/stores/adDraftStore.ts                 (Zustand: state + autosave)
src/hooks/useAdDrafts.ts
src/hooks/useAdTemplates.ts
src/lib/adChannels/meta.ts                 (add launch/generate methods)
```

## Out of scope (Phase 3+)

- Multiple ad sets per campaign
- Carousel media editor (tab will render "Coming soon")
- Google / TikTok / LinkedIn implementations (tiles disabled)
- AI Avatar / Memes / Smart Creatives generators
- A/B test scheduling, dayparting
- Custom audiences / lookalikes (interest targeting only at launch)
- Pixel/conversion event picker for Website objective (defaults to LINK_CLICKS)

## Build order

1. Migration (`ad_drafts`, `ad_templates`, `ad-creatives` bucket + RLS)
2. Edge functions (generate, targeting-search, reach-estimate, lead-forms-list, lead-form-create, ad-launch)
3. Zustand draft store + hooks
4. Objective picker modal + route wiring on `/ads`
5. Builder layout + Manual mode sections + live preview
6. Generate mode (AI)
7. Template mode + save flow
8. Launch flow + post-launch toast + redirect to `/ads`

I'll start with the migration.