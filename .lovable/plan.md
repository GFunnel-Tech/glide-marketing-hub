
# Scheduled Reports & Client Communications

A two-pillar system bolted onto the existing client/workspace model:

1. **Reports** — staff-configurable, schedulable performance digests that get emailed (HTML inline + PDF link), can be sent on-demand, opened as a live shareable link, and archived in the Client Portal.
2. **Communications** — structured request workflows (content update, video brief, script approval, generic announcement) that fan out to email, in-app portal notifications, and internal staff tasks.

Phased so you get something usable end of phase 1.

## Phase 1 — Reports (the core deliverable)

### Data model
- `report_templates` — reusable report definitions per workspace (name, sections enabled: kpis / leads / creative / commentary, date_range_preset, branding overrides).
- `client_report_schedules` — links a template to a client + cadence (daily/weekly/monthly + day/time + timezone), recipient list, active flag, next_run_at.
- `client_reports` — generated report instances (client_id, template_id, period_start/end, payload JSONB snapshot, pdf_url, share_token, status: queued/generating/ready/sent/failed, email_message_id).
- `report_recipients` — embedded as JSONB on schedule (email + name + role) — no separate table needed.

All workspace-scoped with the standard `is_workspace_member` / `can_write_workspace` RLS pattern. Public read on `client_reports` only via `share_token` (separate policy keyed on token presence) so the live link works without auth.

### Generation pipeline
- Edge function `generate-client-report`: takes `{ scheduleId? , clientId, templateId, periodStart, periodEnd, triggeredBy }`, pulls KPIs from `campaigns` / `meta_insights_daily`, leads from `meta_leads`/`google_leads`/`linkedin_leads`/`manual_leads`, top ads from `meta_ads`, stitches the JSONB payload, renders PDF (puppeteer-less: use `npm:@react-pdf/renderer` in Deno), uploads to a new public `client-reports` storage bucket, writes `client_reports` row, returns share URL + payload.
- Edge function `send-client-report`: takes a `client_reports.id`, renders the React Email template (inline KPI cards + commentary + "View full report" button → share link + PDF download link), calls `send-transactional-email` per recipient with one `idempotencyKey` per (report, recipient), marks the row `sent`.
- Edge function `run-scheduled-reports`: pg_cron-driven dispatcher that finds `client_report_schedules` where `next_run_at <= now() AND active`, kicks off `generate-client-report` then `send-client-report`, advances `next_run_at` using the cadence.
- pg_cron job runs every 5 min.

### UI
- **Staff: `/reports` page** gets two tabs:
  - *Templates* — list + create/edit modal (name, sections toggles, period preset, commentary text supporting `{{client_name}}`/`{{period}}` tokens).
  - *Schedules* — per-client schedule list with Run-now, Pause, Edit recipients.
- **Client profile** gets a "Reports" tab: schedule for this client, history of generated reports (status, sent date, link to view, resend button), and an "Add commentary" inline editor on draft reports before they auto-send.
- **Public share page** `/r/:shareToken` — branded, no-auth, mirrors the email content with charts (Recharts). Locks down to read-only.
- **Client Portal** gets a "Reports" card listing all `client_reports` for the linked client where status=sent. Opens the same share page inside the portal shell.

### Email
- New React Email template `client-performance-report` in `_shared/transactional-email-templates/` with KPI tiles, top-ads strip, commentary block, and the share-link CTA. All dynamic data via props.
- Requires Lovable Email infrastructure — I'll set that up first if it isn't already (this is the only "intermediary" step; I'll continue straight through).

## Phase 2 — Communications

### Data model
- `client_communications` — type (`content_update` | `video_request` | `script_approval` | `announcement`), client_id, created_by, subject, body (markdown), payload JSONB (type-specific: e.g. script text, video brief fields, due date, attachments URLs), status (`draft`/`sent`/`acknowledged`/`approved`/`changes_requested`/`completed`), channels[] (email/portal/internal_task), created_at, due_at.
- `client_communication_recipients` — per-recipient delivery row (email or portal_user_id, channel, status: queued/delivered/opened/responded, email_message_id, responded_at, response_payload JSONB for approvals).
- `client_communication_tasks` — internal task rows when "internal_task" channel selected (assignee_user_id, status, linked back to communication).

### Workflow per type
- **Content update**: composer with structured fields (what to change, why, deadline). Channel default: portal notification + internal task; email optional.
- **Video request**: brief form (concept, length, target hook, due date, reference URLs). Channel: email to client + internal task for video team. Status tracks production.
- **Script approval**: paste/upload script, set "needs approval by" recipients. Portal shows Approve / Request changes buttons; result writes to `response_payload` and bumps comm status. Email contains the script preview + approve link to the portal.
- **Announcement**: free-form composer, multi-recipient, email + portal.

### UI
- **Staff: new `/communications` page** (also reachable from client profile as a "Comms" tab) with:
  - List view filtered by client/type/status.
  - "New communication" wizard: pick type → fill type-specific form → choose recipients → preview email → send.
  - Detail view showing per-recipient delivery status + responses (approvals etc.).
- **Client Portal**: new "Updates" section listing communications targeted at that client. Content-update items show a read receipt. Script-approval items show inline Approve / Request changes with a textarea. Video requests show status.
- **Agency Dashboard**: internal tasks generated by communications surface in a "Comms tasks" widget; clicking opens the communication detail.

### Email
- One template per type (`content-update-notice`, `video-request-brief`, `script-approval-request`, `client-announcement`), each with a "Open in portal" CTA.
- Approval/response actions happen in the portal (no email-link voting) so we don't need signed action tokens in phase 2 — keeps the surface small.

## Technical details

- **PDF rendering**: `@react-pdf/renderer` via `npm:` specifier in the Deno edge function. Same React component is reused for the email HTML (via `@react-email/components`) and the live share page (regular React in the SPA) — three renderers, one data payload.
- **Cron**: single pg_cron job hitting `run-scheduled-reports` every 5 min via `net.http_post` (uses the schedule-jobs pattern — inserted via the insert tool with the project URL + anon key, not a migration).
- **Storage**: new public bucket `client-reports` for PDFs; share tokens are random 32-char strings, not enumerable.
- **Realtime**: enable Realtime on `client_reports` and `client_communications` so the staff list and client portal update without refresh, matching the existing pattern.
- **Adapters**: extend `useDatabase.ts` adapters for the new snake_case → camelCase mappings.
- **Permissions**:
  - Staff (`owner`/`admin`/`member`) can CRUD templates, schedules, communications for clients in their workspace.
  - Client portal users see only `client_reports` and `client_communications` for their linked client(s), via existing portal-user → client mapping.
  - Share-link page bypasses auth using `share_token` match only.
- **Security**: all type-specific JSONB validated server-side in the edge functions with Zod before insert/send. No raw HTML in commentary — markdown → sanitized HTML via `marked` + DOMPurify equivalent (sanitize-html in the edge function, React-safe rendering on the client).

## Out of scope (call out so we don't scope-creep)

- SMS/WhatsApp delivery
- Marketing-style bulk sends (blocked by policy anyway)
- Granular per-section permissions on reports (everyone in a workspace sees all templates)
- A/B testing communications
- Calendar invites for video shoot dates

## Suggested build order

1. Lovable Email infra + transactional scaffolding (if not yet set up).
2. Reports DB + storage bucket + RLS.
3. `generate-client-report` + `send-client-report` + email template + share page.
4. Staff Templates/Schedules UI + Client profile Reports tab + Client portal Reports card.
5. pg_cron dispatcher.
6. Communications DB + RLS + realtime.
7. Communications composer + per-type forms + portal Updates section + internal task widget + 4 email templates.

Want me to proceed with this plan, or trim/reorder anything (e.g. ship reports first as v1 and tackle comms in a follow-up)?
