## Goal

Every Meta lead that arrives should be tracked end-to-end into GoHighLevel. If the CRM doesn't receive it within 5 minutes, the system retries the push automatically — and the team gets a notification at each stage (received, missing, recovered, or failed).

## How it works

```text
Meta lead arrives
      │
      ▼
[meta_leads INSERT]  ──►  notify "Lead received, verifying CRM sync in 5 min"
      │
      │  (5 min later, every minute cron picks it up)
      ▼
[reconcile worker]  ──►  search GHL by email + phone
      │
      ├─ found ─────────►  mark "synced"  ──►  notify "Lead synced ✓" (optional)
      │
      └─ missing ───────►  notify "Lead missing from CRM — retrying"
                             │
                             ▼
                          POST to GHL /contacts
                             │
                             ├─ success ──►  mark "recovered" ──►  notify "Lead recovered ✓"
                             │
                             └─ fail (after 3 tries, 5 min apart)
                                          ──►  mark "failed"
                                          ──►  notify "Lead failed to sync — manual action needed"
                                          ──►  create ClickUp task (existing flow)
```

## Database changes (migration)

Extend `meta_leads`:
- `sync_status` text default `'pending'` — one of: `pending`, `synced`, `missing`, `recovered`, `failed`
- `sync_attempts` int default `0`
- `next_check_at` timestamptz — when the worker should next look at this row
- `last_sync_error` text — last error from GHL push
- `ghl_contact_id` text — id returned by GHL when found/pushed
- `recovered_at` timestamptz

Trigger on `meta_leads` INSERT:
- Set `next_check_at = now() + interval '5 minutes'`
- Fire a `lead_received` notification to workspace members (already exists — extend body to mention "verifying CRM sync in 5 min")

New notification event types added to defaults:
- `lead_sync_missing`
- `lead_sync_recovered`
- `lead_sync_failed`

## Edge function: `meta-lead-reconcile`

Cron-invoked every minute. For each workspace with rows where `next_check_at <= now()` and `sync_status IN ('pending','missing')`:

1. Load workspace `integration_configs` (GHL key) and per-client `ghl_location_id`.
2. For each lead:
   - **Search** GHL contacts by email then phone (scoped to the client's `ghl_location_id`).
   - If found → set `sync_status='synced'`, `ghl_contact_id=…`, `ghl_checked_at=now()`. Done.
   - If missing:
     - `sync_attempts++`. Insert `lead_sync_missing` notification on first miss only.
     - **Push** to GHL: `POST /contacts/` with name, email, phone, source `Meta Lead Ads`, plus custom fields for campaign/ad/form.
     - On success → `sync_status='recovered'`, notify `lead_sync_recovered`.
     - On failure → store `last_sync_error`, set `next_check_at = now() + 5 min`.
     - After 3 failed attempts → `sync_status='failed'`, notify `lead_sync_failed`, create ClickUp task (reuse existing path).

Use `SUPABASE_SERVICE_ROLE_KEY` so RLS is bypassed for system writes.

## Cron schedule

`pg_cron` job calling the function every minute, scoped to all workspaces (the function filters internally).

## Frontend additions

- **Lead Sync Health card** on `/leads` showing:
  - Pending verification (count, last 24h)
  - Recovered (count) — green
  - Failed — red, with a list and a **Retry** button per row that re-queues by setting `next_check_at = now()` and `sync_attempts = 0`.
- **Sync status badge** column in the leads table: `Synced ✓` / `Recovered ↻` / `Pending…` / `Missing ⚠` / `Failed ✕`.
- The existing notifications bell will surface the four event types automatically (no UI change required there).

## Technical notes

- All four notification event types are seeded into `notification_preferences` via the existing `seed_notification_preferences_for_member` flow — add them to the `(VALUES …)` list.
- The retry button calls a small edge function (or direct UPDATE through RLS — owners/admins only) that resets the lead's reconcile state.
- The existing `ghl-lead-check` function stays for the long-tail 4h–24h sweep (unchanged) — the new function handles the fast 5-min loop.
- Notification body keeps lead name + campaign so it's actionable from the bell.

## Acceptance

- Lead arrives → bell notification within seconds.
- 5 min later, if absent from GHL → second notification + automatic push attempt.
- If push succeeds → "recovered" notification, status badge flips to green.
- If 3 attempts fail → "failed" notification, ClickUp task created, badge red.
- `/leads` page shows the health card and per-row status badges.
