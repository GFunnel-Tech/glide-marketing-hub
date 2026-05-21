# GoHighLevel Sync — Implementation Plan

Build agency-level OAuth + webhooks + scheduled reconciliation so every sub-account's contacts, pipeline stages, and appointments flow into Lovable, and lead status changes push back to GHL.

## Prerequisites you'll do once in GHL Marketplace

1. Create an **Agency-level Marketplace App** (Settings → Marketplace → My Apps).
2. Scopes to enable: `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `calendars/events.readonly`, `locations.readonly`, `users.readonly`, `oauth.readonly`, `oauth.write`.
3. Redirect URI: `https://kkuvdoejqruszisyojap.supabase.co/functions/v1/ghl-oauth-callback`
4. Webhook URL (for events): `https://kkuvdoejqruszisyojap.supabase.co/functions/v1/ghl-webhook`
5. Give me the **Client ID** and **Client Secret** — I'll store them as secrets.

## Database changes (one migration)

- **`ghl_installs`** — one row per installed location: `location_id`, `company_id`, `client_id` (FK), `workspace_id`, `access_token`, `refresh_token`, `token_expires_at`, `scopes[]`, `status`, `installed_by`, timestamps.
- **`ghl_opportunities`** — `id` (GHL id), `location_id`, `client_id`, `contact_id`, `pipeline_id`, `pipeline_name`, `stage_id`, `stage_name`, `status`, `monetary_value`, `assigned_to`, `created_at`, `updated_at`, `raw`.
- **`ghl_appointments`** — `id` (GHL id), `location_id`, `client_id`, `contact_id`, `calendar_id`, `title`, `start_time`, `end_time`, `status` (booked/showed/no-show/cancelled), `assigned_to`, `raw`.
- **`ghl_sync_state`** — per `location_id`: `last_contacts_sync_at`, `last_opps_sync_at`, `last_appts_sync_at`, `last_error`, `last_run_at`.
- **`ghl_webhook_events`** — raw inbound webhook log (`id`, `type`, `location_id`, `payload`, `processed_at`, `error`).
- Add `ghl_contact_id` column to `leads` and `meta_leads` to dedupe.
- RLS: workspace members read/write their own; portal users read their client's data only.

## Edge functions

| Function | Purpose |
|---|---|
| `ghl-oauth-start` | Builds GHL authorize URL (agency-level), stores CSRF state, returns redirect URL. Triggered from "Connect GoHighLevel" button on Client Profile or Settings. |
| `ghl-oauth-callback` | Exchanges code → tokens, fetches installed locations, upserts one `ghl_installs` row per location, auto-maps to clients by `ghl_location_id` when set. |
| `ghl-webhook` | Public endpoint. Verifies signature, logs to `ghl_webhook_events`, dispatches by type: ContactCreate/Update → upsert lead; OpportunityCreate/StatusUpdate → upsert opportunity + update lead stage; AppointmentCreate/Update → upsert appointment. |
| `ghl-sync` | Scheduled reconciliation. For each install: pull contacts/opps/appointments updated since `last_*_sync_at`, refresh token if needed, update `ghl_sync_state`. |
| `ghl-push-lead-update` | Called from app when a user changes lead stage/notes. Maps internal stage → GHL pipeline stage and PATCHes the opportunity. |
| `ghl-token-refresh` | Helper invoked by other functions when token within 5 min of expiry. |

All functions: CORS headers, Zod input validation, structured logging with correlation IDs, `verify_jwt = false` only on `ghl-webhook` and `ghl-oauth-callback`.

## Scheduling

`pg_cron` + `pg_net` job: invoke `ghl-sync` every 15 minutes. Inserted via the insert tool (not migration) since it contains the project ref.

## UI changes

- **Client Profile** → new `GhlConnectionPanel`:
  - If no install for client's `ghl_location_id`: "Connect GoHighLevel" → opens OAuth in new tab.
  - If installed: green status, last sync timestamp, "Sync now" button, "Disconnect".
  - Recent webhook events table (last 10).
- **Leads page** → new column "GHL stage" + filter by pipeline.
- **Lead detail drawer** → "Bookings" section listing `ghl_appointments` for that contact.
- **Settings → Integrations** → agency-wide install management (list of all installed locations, map unmapped ones to clients).
- **Portal dashboard** → "Bookings (MTD)" KPI wired to `ghl_appointments`.

## Two-way push

When a user updates lead `stage` in Leads page or drawer:
1. Frontend calls `ghl-push-lead-update` with `lead_id` + new stage.
2. Function looks up the linked `ghl_contact_id` and active opportunity, maps to a configured GHL pipeline/stage, PATCHes via GHL API.
3. Logs to `activity_log` with success/failure.

A small mapping table (`ghl_stage_map`) lets each client configure: internal stage → GHL pipeline_id + stage_id.

## Open question I need from you

What you call "leads" in Lovable can map to either GHL **Contacts** or **Opportunities**. Best practice:
- Inbound = create/update Contact + Opportunity in default pipeline.
- Stage changes here = move the Opportunity, not the Contact.

I'll default to that unless you say otherwise.

## After you approve

1. I'll ask you to add `GHL_CLIENT_ID` and `GHL_CLIENT_SECRET` as secrets.
2. Run the migration.
3. Ship all 6 edge functions + cron.
4. Ship the UI.
5. We test by installing into one sub-account and watching webhooks land.
