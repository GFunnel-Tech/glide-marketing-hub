# Full GHL Sync: Contacts, Notes, Pipelines, Appointments

Yes — it's possible. We already sync locations, appointments and opportunities from GoHighLevel using the same location tokens (OAuth install token or per-subaccount Private Integration Token). Everything else — contacts, notes/tasks, pipeline definitions, conversations — comes from the same API family and can be added the same way.

## What exists today
- Locations sync, appointments sync, opportunities, stage map, inbound webhook for stage changes.
- Auth per subaccount already solved (install token or PIT), plus a daily auth health check.

## What to add

### 1. Contacts
New `ghl_contacts` table (contact id, location, name, email, phone, tags, source, DND, custom fields, created/updated). Full backfill on first run, then incremental by `dateUpdated`. Links to existing leads by GHL contact id, then email/phone.

### 2. Notes and tasks
New `ghl_contact_notes` and `ghl_contact_tasks` tables, fetched per contact (the API is contact-scoped, so this runs after contacts and only for contacts touched since last sync). Surfaced on the lead drawer and client profile as a read-only activity timeline.

### 3. Pipelines and stages
New `ghl_pipelines` / `ghl_pipeline_stages` tables so stage names, order and pipeline ownership are real data instead of the current keyword guessing in the webhook. The existing `ghl_stage_map` then maps real stage ids to our `lead_stage` enum, and inbound webhooks resolve stages exactly.

### 4. Appointments (extend)
Add calendar id/name, assigned user, and appointment outcome so the calendar can filter by calendar and show who owns the booking.

### 5. Conversations (optional, phase 2)
Last inbound/outbound message timestamp per contact — enough to show "last contacted" without storing full message bodies.

## Where it shows up
- Lead drawer: GHL contact card with tags, owner, pipeline stage, notes and tasks timeline.
- Client profile: a GHL tab with contacts count, pipeline funnel by real stage, upcoming appointments.
- Calendar: appointments enriched with calendar and assignee.
- Portal: read-only pipeline stage on the client's own leads.

## Technical notes
- One new `ghl-full-sync` edge function orchestrating per-location sync with cursor state in `ghl_sync_state` (contacts → notes/tasks → pipelines → appointments), chunked and resumable so it never hits the function timeout.
- Cron every 15 min for incrementals; manual "Full resync" button per location in Integrations.
- Scopes required on the install/PIT: `contacts.readonly`, `objects/pipeline.readonly` (`opportunities.readonly`), `calendars.readonly`, `calendars/events.readonly`, plus `conversations.readonly` only if phase 2 is included. Locations missing a scope get flagged in the existing auth-health panel rather than failing silently.
- All new tables workspace-scoped with RLS matching the current GHL tables, plus grants for `authenticated` and `service_role`.

## Suggested order
1. Pipelines + stages (small, immediately improves stage accuracy).
2. Contacts + incremental cursor.
3. Notes and tasks timeline.
4. Appointment enrichment.
5. Conversations last-contacted (optional).
