## Goal

Make each client's portal feel like a client-facing mirror of the internal Client Profile card — same KPI tiles, status pill, tabs — while giving the client self-service tools (request a campaign, download reports, connect integrations). Every new client automatically gets their own password-protected portal.

## 1. Portal redesign (mirror the Client Profile)

Rework `src/pages/portal/PortalDashboard.tsx` + `PortalLayout.tsx` to reuse the same visual language as `ClientProfile.tsx`:

- **Header card**: client name + colored status pill (GREEN/YELLOW/RED/LEARNING/NEW), business name + brand, "Last synced" timestamp, right-aligned Month-to-date range picker.
- **KPI row (6 tiles, identical to profile)**: CPL, Leads MTD, Spend, CPM, Form CVR, Frequency — each with target line and a red/amber/green health dot. Extract the tile from `ClientProfile.tsx` into a shared `ClientKpiTile.tsx` so both views stay in sync.
- **Tabs** (client-safe subset): Overview · Campaigns · Leads · Reports · Requests · Integrations · Documents · Support.
- **Right rail**: "Quick Actions" card matching the profile — buttons become client-appropriate: *Request a Campaign*, *Request a Report*, *Book a Call*. Plus an "External Links" card (GHL, Terms, any `client_embeds`).
- Keep the top-nav-only shell (per iframe constraint) — no branding/search/profile chrome.

## 2. Auto-provision portal on client creation

When a client row is inserted:

- DB trigger `on_client_created_provision_portal()` creates a `portal_users` row linked to the client with a generated temporary password and `must_reset_password = true`.
- Edge function `portal-provision` (called from the trigger via `pg_net` or from the client-create UI) invites the primary contact email via Supabase Auth `inviteUserByEmail`, storing the mapping in `portal_users(client_id, user_id, status='invited')`.
- If no email exists yet, the invite is queued and surfaced in the Client Profile → Access tab as "Send portal invite".
- Add `portal_slug` to `clients` so each portal has a stable URL: `/portal/<slug>`. `PortalRoute.tsx` resolves slug → client_id.

## 3. Password protection + first-login flow

- Reuse existing Supabase Auth. Invite email → magic link → forced password set on first login (`/portal/set-password`).
- Session gated by `portal_users.status = 'active'`. RLS: portal user can only read their own client's data.
- Agency staff impersonation (already built) continues to work via `admin-impersonate`.

## 4. Self-service features

New tables (all with GRANTs + RLS scoped to `client_id` the portal user owns):

- `campaign_requests(id, client_id, requested_by, type, objective, budget, target_audience, creative_notes, status, created_at)` — statuses: `new → in_review → scheduled → launched → declined`. Shows up in agency Tasks feed and routes to `media_buying` position.
- `report_requests(id, client_id, requested_by, period_start, period_end, format, status, file_url)` — "Download Full Report PDF" button generates on demand via `report-generate` edge function.
- `integration_requests(id, client_id, provider, credentials_note, status)` — for clients to ask the agency to connect GHL, Meta, GA4, Stripe, etc.

Portal pages:

- **Requests tab**: form to submit a new campaign request + list of prior requests with status timeline.
- **Reports tab**: list of generated monthly/weekly reports with download links + "Generate new report" button.
- **Integrations tab**: read-only list of connected platforms (Meta, GHL, GA4, Stripe) with green/gray dots + "Request an integration" CTA.

## 5. Agency-side surfacing

- New "Requests" panel on `ClientProfile.tsx` and a global `Requests` inbox at `/requests` for staff.
- Notifications: new campaign/report/integration request creates a task assigned by `task_routing_rules` (existing) and pings the assignee.

## Technical section

**DB migration (single migration, in order):**
1. `ALTER TABLE clients ADD COLUMN portal_slug text UNIQUE` (backfill from name).
2. `CREATE TABLE public.campaign_requests`, `report_requests`, `integration_requests` — each with `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated`, `GRANT ALL ... TO service_role`, then `ENABLE ROW LEVEL SECURITY` + policies:
   - portal user: `client_id IN (SELECT client_id FROM portal_users WHERE user_id = auth.uid() AND status='active')`
   - agency staff: `workspace_id` membership via existing helper.
3. Trigger `on_client_insert_provision_portal` → `net.http_post` to `portal-provision` edge function.

**Edge functions:**
- `portal-provision` — invite email, create `portal_users` row, set temp password.
- `report-generate` — assembles PDF for a period (reuses existing KPI rollup RPC), stores in `reports` bucket, updates `report_requests.file_url`.

**Frontend files touched/added:**
- `src/components/client/ClientKpiTile.tsx` (extracted, shared).
- `src/pages/portal/PortalDashboard.tsx` — rebuilt to match profile layout.
- `src/pages/portal/PortalRequests.tsx`, `PortalReports.tsx`, `PortalIntegrations.tsx` (new).
- `src/components/portal/RequestCampaignDialog.tsx` (new).
- `src/pages/ClientProfile.tsx` — add "Requests" panel.
- `src/pages/portal/PortalLayout.tsx` — add Requests/Reports/Integrations tabs.
- `src/hooks/useClientRequests.ts` (new).

**Security notes:**
- Portal auth is standard Supabase email/password + magic-link invite; no client-side role checks.
- All request tables enforce `client_id` scoping via RLS.
- Temp passwords never returned to the browser; user always sets their own on first login.

## Out of scope (ask before adding)

- White-labeled per-client domains for the portal.
- Client-initiated billing / plan changes.
- Full custom-report designer (v1 uses a fixed monthly template).
