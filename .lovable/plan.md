# Client Portal — Top-Nav Tabs with Custom Embeds

Turn `/client-portal/:id` into a tabbed surface. The first tab is the existing dashboard. Additional tabs are **custom embeds** the agency configures at the workspace level (e.g. "Term Sheet" → eem-termsheet.lovable.app, future "Offers" → offers.gfunnel.com, etc.). Each tab iframes a per-client URL.

## What the agency sees

- A new **Workspace Settings → Embed Tabs** page lists every custom tab. Each tab has: label, icon, provider key (`connectwise_terms`, `custom`, …), URL template (with `{client_id}` and `{token}` placeholders), enabled toggle, sort order.
- On a client's profile, an **"Embeds"** section lets the agency paste the per-client URL/token for each enabled tab (e.g. paste the `https://eem-termsheet.lovable.app/q/<token>` link for that client). If left blank, that tab is hidden on the portal for this client.

## What the client sees on `/client-portal/:id`

- Top nav with tabs: **Dashboard** | **Term Sheet** | (other tabs the agency enabled). Active tab is underlined, matches the existing portal aesthetic — no branding changes.
- Dashboard tab = current ClientPortal content unchanged.
- Embed tab = full-bleed iframe of the configured URL, with the GFunnel header still on top.

## Database

Two new tables — both scoped through `clients.workspace_id` for RLS.

1. `workspace_embed_tabs` (one row per tab the agency defines):
   - `workspace_id`, `label`, `provider`, `icon` (lucide name), `url_template`, `sort_order`, `enabled`
2. `client_embeds` (per-client filled-in URL for a given tab):
   - `client_id`, `tab_id` → `workspace_embed_tabs.id`, `embed_url`, `public_token` (nullable), `status` (`pending|accepted|declined`), `last_event_at`
   - Unique on `(client_id, tab_id)`

RLS:
- Agency members (`can_write_workspace`) can read/write both tables for clients in their workspace.
- Portal users (`is_portal_user_for_client`) can `SELECT` only their own `client_embeds` rows and the matching `workspace_embed_tabs` rows.

## Frontend

- **`src/components/portal/PortalTabs.tsx`** — top-nav tabs reading the enabled embeds for the resolved client.
- **`src/components/portal/EmbedFrame.tsx`** — iframe + postMessage listener with origin allowlist derived from `embed_url`. Updates `client_embeds.status` when it receives `{ source: "ct-terms", type: "decision" }`. Falls back to a fixed height when no resize message arrives (handles the un-instrumented CT app).
- **`src/pages/ClientPortal.tsx`** — replace top of body with `<PortalTabs>`; render Dashboard when `tab === "dashboard"`, otherwise render `<EmbedFrame>` for the active tab. Also switch from mock data to the real client (looked up by `:id`).
- **`src/pages/settings/EmbedTabsSettings.tsx`** — agency UI to CRUD `workspace_embed_tabs`. Add link in existing workspace settings nav.
- **Client profile (`src/pages/ClientProfile.tsx` or equivalent)** — new "Embeds" card listing enabled tabs with an input per tab to paste the per-client URL; saves to `client_embeds`.

## Realtime

Subscribe to `postgres_changes` on `client_embeds` filtered by `client_id` from both:
- the agency client-profile view (to see status flip when client accepts in portal),
- the portal view (so agency can update the URL and the client tab refreshes without reload).

## Out of scope this step

- Auto-creating a ConnectWise Terms quote from GFunnel (you said unsure — keep manual paste for now).
- The CSP / postMessage edits on the ConnectWise Terms project (status updates will be no-ops until those land; everything else works).
- Per-tab permissions (e.g. hiding a tab once accepted). Easy follow-up.

## Files touched

```text
supabase migration: workspace_embed_tabs, client_embeds (+ RLS, realtime publication)
src/pages/ClientPortal.tsx                  edit
src/components/portal/PortalTabs.tsx        new
src/components/portal/EmbedFrame.tsx        new
src/pages/settings/EmbedTabsSettings.tsx    new
src/pages/ClientProfile.tsx                 edit (add Embeds card)
src/App.tsx                                 add settings route
```
