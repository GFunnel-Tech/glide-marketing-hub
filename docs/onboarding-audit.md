# Onboarding — Full Process Audit

**Repo:** `gfunnel-tech/glide-marketing-hub` @ `claude/eloquent-pasteur-ust0uj`
**Audit date:** 2026-09-15
**Scope:** every surface, table, function and integration that participates in getting a client from
"created" to "ready for the creative pipeline".
**Companions:** `AUDIT.md` (the build-time audit for the media-capture wizard),
`docs/d3-sales-onboarding-audit.md` (sales-side), `docs/scope-of-work.md` §WS3 (planned remediation).

**Verification basis.** Static audit of the repository plus the generated Supabase type file. Live-database
verification was **not** possible: the app targets Supabase project `wikxsrtdifsmazbharyu`
(`.env`), but the Supabase connector in this session is authorised for a different project
(`yjneucgsaayyzoyxrlnb`, "GFunnel"). Every claim below is grounded in repo code; claims about deployed
RLS policies and row data are explicitly marked as unverifiable.

---

## Headline

There is no single onboarding process. There are **three independent, unsynchronised ones**, plus a
fourth (invite/provisioning) that no code path currently triggers. They share no state, no completion
definition and no entry point.

| # | System | Storage | Who drives it | Entry point |
|---|---|---|---|---|
| 1 | **6-phase kanban** (Access → Tracking → Strategy → Launch → Optimizing → Testing) | `onboarding` table | Agency staff | `NewClientDialog` only |
| 2 | **Legacy 4-step portal setup** (profile / Meta / billing / brand) | `portal_onboarding.*_done` | Client | `/portal/onboarding` |
| 3 | **Media & asset capture wizard** (consent → info → photos → voice → files → review) | `portal_onboarding` new flags + `client_media_assets` + `client_consents` | Client, or staff on their behalf | `/onboarding/wizard?clientId=…`, or a card inside #2 |
| 4 | **Invite → provision → portal access** | `client_invites`, `portal_users` | Agency staff | `ClientInvitesPanel`; `portal-provision` is **never called** |

Completing any one of them tells you nothing about the others. The kanban phase is set once at creation
and only ever moved by hand; the legacy 4 steps are self-attested checkboxes; only system 3 produces
anything a downstream pipeline can consume.

The second structural finding: **nothing connects the sale to onboarding.** `useConvertProspect`
(`src/hooks/useProspectActions.ts:110-127`) flips `clients.lifecycle` to `'client'` and stops. It creates
no `onboarding` row, no `portal_onboarding` row, no invite, and fires no webhook. A closed-won prospect is
invisible to every onboarding surface until somebody re-types it into the New Client dialog.

---

## 1 · Surface-by-surface walkthrough

### 1.1 `/onboarding` — the kanban board
`src/pages/Onboarding.tsx` · 177 lines · reads the `onboarding` table via `useOnboarding`
(`src/hooks/useDatabase.ts:409-417`).

Six phases and their checklists are **hardcoded** at `Onboarding.tsx:9-25`. Clicking a client opens a
drawer showing all six phase checklists.

> **The checklists are not real.** `Onboarding.tsx:161` renders each item as
> `<input type="checkbox" defaultChecked={isComplete || (isCurrent && i < 2)} />` — no `onChange`,
> no handler, no persistence. Ticking a box changes nothing and survives nothing. The initial tick
> pattern is derived from the phase number, so the first two items of the current phase always appear
> done. Thirty checklist items across six phases are decoration.

Phase advancement has no UI at all — nothing in the repo writes `onboarding.phase` after insert.
`days_in_phase` is likewise written once (as `0`) and never incremented; the "Avg Days to Launch" KPI
(`Onboarding.tsx:47`) therefore reads `0` for every client forever.

### 1.2 `NewClientDialog` — the only way onto the board
`src/components/onboarding/NewClientDialog.tsx` · inserts a `clients` row (`:44-54`) then an `onboarding`
row (`:63-73`).

Two non-atomic inserts: if the second fails the client exists but never appears on the board, and the
error toast ("Could not create client") is wrong — the client *was* created. No transaction, no cleanup.

It does not create a `portal_onboarding` row, does not send an invite, and does not call
`portal-provision`.

### 1.3 `/portal/onboarding` — the legacy 4-step flow
`src/pages/portal/PortalOnboarding.tsx` · 294 lines.

Steps: profile → Meta → billing → brand. Steps 2 and 3 are **self-attestation only**:

- `:212` — "Mark connected & continue" writes `meta_done: true` and calls `toast.info("Opening Meta
  connection…")`. Nothing opens. The comment at `:214` admits it: *"The actual OAuth start lives in
  MetaConnectionsPanel; just mark intent and continue."* A client can mark Meta connected with no Meta
  account in existence.
- `:242` — billing identically writes `billing_done: true` with no Stripe interaction.

`:288` renders a "Skip onboarding for now" link to `/portal`. It is a **dead control**: `PortalRoute`
(`src/pages/portal/PortalRoute.tsx:90-98`) redirects any active portal user without
`portal_onboarding.completed_at` straight back to `/portal/onboarding`. The user bounces and cannot skip.

At the top, `:98-122` conditionally renders the asset-capture card that launches system 3.

### 1.4 The media-capture wizard
`src/components/onboarding/` — `OnboardingWizard.tsx` + 6 steps + 2 hooks + `config.ts` + `voiceScript.ts`.

Mounted twice: as a modal inside the portal flow (`PortalOnboarding.tsx:124-133`) and as a full page at
`/onboarding/wizard?clientId=…` for staff (`src/pages/OnboardingWizardPage.tsx`).

| Step | Gate | Writes |
|---|---|---|
| Consent | checkbox ticked | `client_consents` row + `consent_done` |
| Info | legal name, brand name, contact name, valid email; phone ≥7 digits; NMLS 3–9 digits | 11 columns on `portal_onboarding` + `info_done` + legacy `profile_done` |
| Photos | ≥ 5 images, ≤ 15 MB each, short side ≥ 1024 px | `client_media_assets` (kind `image`) + `images_done` |
| Voice | ≥ 90 s (recommended 150 s, max 480 s) | `client_media_assets` (kind `voice`) + `voice_done` |
| Files | **none** | `client_media_assets` (kind `logo`/`file`) + `files_done` |
| Review | re-checks consent, info, image count, voice duration | `submitted_at` + `completed_at`, then invokes `onboarding-drive-sync` |

Constants live in `src/components/onboarding/config.ts`. The voice script
(`src/components/onboarding/voiceScript.ts`) is ~2–3 min of **mortgage-specific** copy; its first line is
the spoken consent.

### 1.5 `/onboarding/assets` — the staff status board
`src/pages/OnboardingAssetsPage.tsx` · reads the `client_onboarding_status` view, one row per client, with
per-client expansion showing asset-level failures. Two actions: **Retry Drive sync** (`retry_drive_sync`
RPC + re-invoke the edge function) and **Mark ready for processing** (`onboarding-process-stage`).

This is the only place a failed Drive sync is ever surfaced. Nothing pushes; somebody has to look.

### 1.6 Invite → portal access
`ClientInvitesPanel` creates `client_invites` rows with a client-generated 8-char code
(`src/components/clients/ClientInvitesPanel.tsx:32-37`, `:85-92`). `PortalAcceptInvite` calls the
`lookup_client_invite` and `redeem_client_invite` RPCs. `PortalRoute` then gates on mapping status and
`completed_at`.

`supabase/functions/portal-provision/index.ts` is documented as *"Fired from the AFTER INSERT trigger on
public.clients"*. **No such trigger exists in the repo, and no code invokes this function.** It is dead
in the tree but live in the project — see finding H2.

---

## 2 · Data model

All of it is **live-only**. See finding H4.

### `onboarding` — the kanban row
`client_id`, `workspace_id`, `name`, `brand`, `phase` (int), `days_in_phase` (int), `owner` (free text),
`blockers` (text[]). No FK to a phase definition; `owner` is a typed string, not a user id, so it cannot
be joined to `profiles` or routed to.

### `portal_onboarding` — the step-flag row
Keyed **`(user_id, client_id)`** — every upsert in the codebase uses
`onConflict: "user_id,client_id"`. Carries the legacy 4 booleans, the 5 new wizard flags,
`submitted_at`, `completed_at`, and 11 business-info columns.

> **The composite key is a design error.** Onboarding state is a property of the *client*, not of a
> (user, client) pair. A client with two portal users gets two rows with divergent flags, two consent
> paths, and two "completions". `portal-provision:57-61` reads this table by `client_id` alone with
> `.maybeSingle()`, which **errors** as soon as a second row exists. How `client_onboarding_status`
> aggregates the duplicates is unverifiable from the repo.

### `client_media_assets`
One row per file: `kind` (`image|voice|logo|file`), `storage_bucket`, `storage_path`, `filename`,
`mime_type`, `byte_size`, `width`, `height`, `duration_seconds`, `drive_file_id`, `drive_sync_status`
(`pending|synced|failed`), `drive_synced_at`, `processing_status`
(`pending|ready_for_processing|processing|processed|failed`), `elevenlabs_voice_id`,
`higgsfield_character_id`, `error_message`.

Path convention: `{client_id}/{kind}/{uuid}.{ext}` in the private `client-onboarding` bucket
(`src/components/onboarding/hooks/useMediaAssets.ts:92`).

### `client_consents`
Append-only: `client_id`, `workspace_id`, `consent_type`, `consent_text`, `granted_by`, `granted_at`,
`method`, `ip_address`, `user_agent`. **`ip_address` is never populated** — nothing in the repo writes it,
and the browser cannot know it. See finding H1.

### `client_onboarding_status` (view)
Per-client rollup: the five step flags, `submitted_at`, `completed_at`, `image_count`, `voice_count`,
`has_consent`, and sync/processing counters. Drives `/onboarding/assets`.

### RPCs (live-only, no definitions in repo)
`lookup_client_invite`, `redeem_client_invite`, `retry_drive_sync`, `mark_assets_ready_for_processing`,
`seed_default_status_phases`.

`mark_assets_ready_for_processing` is **dead** — nothing calls it; `onboarding-process-stage` re-implements
the same logic inline (`:319-328`). Two copies of one rule, one of them unreachable.

---

## 3 · Edge functions

### `onboarding-drive-sync` (199 lines)
Auth: portal user for the client **or** workspace writer (`:80-86`). Pulls assets in `pending`/`failed`,
signs each for 1 h, POSTs to `N8N_ONBOARDING_DRIVE_WEBHOOK`, expects `drive_file_id` back, writes it to the
row. Failures are recorded honestly with a human-readable `error_message` and never marked synced — this
part is well built.

Two problems:

- **The webhook does not exist.** `N8N_ONBOARDING_DRIVE_WEBHOOK` is unset, and `workflows/` contains no
  Drive-sync flow (the 12 committed n8n workflows cover `meta-ads-sync`, `ghl-sync`, `manus-audit`,
  `form-swap`, `budget-scale`, `pause-campaigns`, `generate-report`, `clickup-task`, `playai-agent`,
  `ai-chat`, `sync-all`, `export-all-reports` — no onboarding). The function detects this and marks
  every pending asset failed (`:100-116`), which is the right behaviour, but it means **no onboarding
  asset has ever reached Drive.**
- **Serial, in-request, unbounded.** `:123-193` loops assets one at a time, each a full HTTP round-trip to
  n8n. A client at the recommended 10 photos plus voice plus logo is 12 sequential calls inside one
  invocation. There is no batching, no queue, no resumption; an edge-function wall-clock timeout leaves a
  partial sync with no record of where it stopped.

### `onboarding-process-stage` (210 lines)
`mode: "stage"` — requires workspace writer, requires a `voice_likeness` consent row (`:285-294`, returns
412 without one), marks image+voice assets `ready_for_processing`, returns 2 h signed URLs, and reports
whether `ELEVENLABS_API_KEY` / `HIGGSFIELD_API_KEY` are configured. It deliberately does not generate
anything.

`mode: "write_back"` — the path by which the pipeline reports `elevenlabs_voice_id` /
`higgsfield_character_id` back.

> **The write-back path cannot work as documented.** The header comment (`:359-362`) says downstream
> workers *"should use a service-role-token caller"*. But `:254-256` resolves the caller with
> `auth.getUser()` and 401s on failure, and `:376-384` then requires a `workspace_members` row for that
> user. A service-role key is not a user token — `getUser()` will not resolve it, so the documented caller
> is rejected before it reaches the authorisation check. There is no service-role branch. Write-back is
> reachable only by a human workspace writer, which is not what a pipeline is.

Neither function is represented in `supabase/config.toml` — that file contains a single line,
`project_id = "wikxsrtdifsmazbharyu"`. No `verify_jwt` setting for any of the 90+ edge functions is
version-controlled.

### `portal-provision` (115 lines)
Looks up the client's email (own columns, then `portal_onboarding.contact_email`), invites via
`auth.admin.inviteUserByEmail`, upserts a `portal_users` row. Three defects, detailed in findings H2 and
M-8.

---

## 4 · Findings

Severity is about business consequence, not code aesthetics.

### High

**H1 · The consent record is written by the browser and is not defensible evidence.**
`src/components/onboarding/steps/ConsentStep.tsx:20-28` inserts the `client_consents` row directly from the
client with RLS as the only control. Every legally material field is supplied by the consenting party's own
browser: `consent_text`, `granted_by`, `method: "both"`, `user_agent`. `ip_address` is never set.

Worse, the record is attributed to whoever is *operating the wizard*, not whoever is consenting. When
agency staff run `/onboarding/wizard?clientId=…` on a client's behalf — a documented, supported flow
(`AUDIT.md` F1) — `ctx.userId` is the staff member's id. The system then holds a row saying the staff
member authorised the use of their own voice and likeness, with `method: "both"` asserting a spoken
confirmation that may never have been recorded. Nothing distinguishes that row from a genuine one.

This underwrites AI voice cloning and avatar generation of real people. It should be an edge function that
stamps `consent_text` server-side from the canonical constant, captures the request IP, records the
operating user separately from the consenting subject, and refuses to record third-party consent at all.

**H2 · `portal-provision` takes a caller-supplied email and links it to any client, with no auth check.**
`supabase/functions/portal-provision/index.ts:26-104` performs no authentication whatsoever. It reads
`body.client_id` and `body.email`, and `:49-53` prefers **the caller's `email`** over the client's stored
address. It then invites that address and upserts a `portal_users` row binding the resulting account to
that `client_id` (`:94-102`), using the service-role key throughout.

The function is designed to be called by a database trigger, which requires `verify_jwt = false`. If it is
deployed that way — unverifiable from the repo, because `config.toml` carries no function settings — then
any unauthenticated POST of `{client_id: N, email: "attacker@…"}` yields a portal account mapped to client
N. Whether `portal_users.status = 'invited'` is enough to block access depends on live RLS and on
`PortalRoute`'s mapping checks, so the blast radius is unverified; the unauthenticated write path is not.

Two further defects in the same function: `:76` builds the invite redirect as
`SUPABASE_URL.replace(".supabase.co", ".lovable.app")` → `https://wikxsrtdifsmazbharyu.lovable.app/portal/accept`,
which is not the live app (`pixel-perfect-canvas-0521.lovable.app` per `README.md`) — every invite this
function sends lands on a wrong host. And `:67-71` inserts a `portal_users` row with **no `user_id`** in
the no-email branch, but `user_id` is `NOT NULL` (`src/integrations/supabase/types.ts:5533`) — that insert
always fails.

Currently nothing calls this function, which is the only reason none of this has bitten. It should be
fixed or deleted, not left deployed and unreferenced.

**H3 · Closing a sale produces no onboarding.**
`useConvertProspect` (`src/hooks/useProspectActions.ts:110-127`) updates `lifecycle` and nothing else. No
kanban row, no `portal_onboarding` row, no invite, no phase webhook, no task. The C1 prospect model
(`supabase/migrations/20260901000000_c1_prospect_account_model.sql`) was built so that everything attached
during the sale stays attached through conversion — but the handoff it was meant to enable was never
built. The only way a client reaches onboarding is somebody manually re-entering them in
`NewClientDialog`. This is `docs/scope-of-work.md` H2/H3, still open.

**H4 · The entire onboarding schema exists only in the live project.**
`supabase/migrations/` holds six files. **None** of them mention `portal_onboarding`,
`client_media_assets`, `client_consents`, `client_invites`, the `client-onboarding` bucket, the
`client_onboarding_status` view, or any of the five RPCs. The code even names the migration it expects —
`useOnboardingState.ts:17` cites `20260629050741_onboarding_media_capture.sql` — and that file is not in the
repository.

Consequences: RLS policies protecting a private bucket of clients' faces and voices cannot be reviewed,
diffed, or code-reviewed; the environment cannot be rebuilt; a bad policy change leaves no audit trail.
For a subsystem whose entire security model *is* its RLS policies, this is the most serious structural
gap in the audit.

**H5 · Every quality gate is client-side and trivially bypassable.**
`useUploadAsset` (`src/components/onboarding/hooks/useMediaAssets.ts:86-136`) uploads to storage and then
inserts the `client_media_assets` row **directly from the browser**, with `width`, `height`,
`duration_seconds` and `byte_size` all supplied by the page.

So the ≥5 photos, ≥1024 px short side, ≥90 s voice, and ≤15 MB rules
(`src/components/onboarding/config.ts:2-11`) are advisory. `VoiceStep.tsx:192` writes
`durationSeconds: elapsed` from a `setInterval` counter; `VoiceStep.tsx:256` then gates the whole step on
`existing.duration_seconds`, i.e. on the number the browser just reported about itself. Nothing
re-derives any of it server-side. `onboarding-process-stage` checks consent but never re-validates the
media it stages.

The downstream consumer is a paid voice-clone and avatar pipeline. It will be fed whatever the row claims.

### Medium

**M1 · Once complete, the wizard cannot be edited.**
`OnboardingWizard.tsx:56-64`:

```js
if (allDone && step !== "review") setStep("review");
```

`step` is in the dependency array, so this fires on every step change. After all five flags are set, every
stepper button and every "Edit" button in `ReviewStep` is dead — the click sets the step and the effect
immediately reverts it. A client who mistypes their NMLS number or wants to swap a photo has no route back.
The `ReviewStep` "Edit" affordances (`ReviewStep.tsx:207-235`) actively promise a capability the wizard
prevents.

**M2 · Resume-to-saved-step never works on a fresh load.**
`useWizardStep` (`useOnboardingState.ts:132-138`) builds its localStorage key from `userId`, and reads
localStorage inside a `useState` initializer — which runs exactly once, on first render. On a page load,
auth has not resolved yet, so `userId` is `undefined`, `storageKey` is `null`, and the initializer returns
`"consent"`. The key is correct by the time the write-effect runs, so the value is saved faithfully and
never read back. Every returning client restarts at step 1.

**M3 · The documented resume behaviour was never wired.**
`useOnboardingState` computes `firstIncompleteStep` (`:109-117`) and `OnboardingWizard.tsx:45` destructures
it — then never references it. `AUDIT.md` F6 states the wizard "re-opens to the first incomplete step". It
does not. Combined with M2, the resume story documented in two places exists in neither.

**M4 · Submitting is silent.**
`ReviewStep.tsx:26-55` sets the timestamps and invokes the Drive sync. It creates no notification, no
`client_notes` task, no webhook, no ClickUp card. The repo has all of this machinery
(`notifications`, `task_routing_rules`, `09-clickup-task-creation.json`) and onboarding uses none of it. A
client can finish onboarding on a Friday and nobody finds out until someone opens `/onboarding/assets`.

**M5 · Drive sync is serial and unbounded** — see §3. Risk of timeout and partial sync as soon as the
webhook exists.

**M6 · The write-back path rejects its own documented caller** — see §3.

**M7 · Deleting an asset can orphan the file.**
`useDeleteAsset` (`useMediaAssets.ts:141-150`) deletes the database row **first**, then attempts storage
removal and swallows the failure — the comment concedes RLS may block portal users. The row is the only
record of `storage_path`, so a failed storage delete leaves an unreferenced object in a private bucket
with no way to find it. There is no sweeper: `cleanup-audit-artifacts` covers audit PDFs only. Over time
this accumulates clients' faces and voices that nobody can enumerate or purge — a live problem for any
deletion request.

**M8 · One client, two portal users, two onboardings** — see §2, `portal_onboarding` key.

**M9 · HEIC is accepted, unchecked and unconverted.**
`ImagesStep.tsx:79-81` skips dimension validation for `image/heic`/`image/heif` with the comment
*"accept blindly; backend can re-check later"*. No backend re-checks it. HEIC is the iPhone default, so the
most common client upload path is the one with no validation, and it flows to an avatar pipeline that
likely cannot decode it. There is no server-side normalisation step anywhere.

**M10 · Three competing phase models.**
The hardcoded 6 phases in `Onboarding.tsx`/`NewClientDialog.tsx`; the step flags on `portal_onboarding`;
and the configurable `client_status_phases` table with `seed_default_status_phases` and per-phase
`webhook_url`, surfaced in `src/components/settings/StatusPhasesPanel.tsx`. The configurable one — the only
one that can fire a webhook — is not used by any onboarding surface.

**M11 · The generated types are bypassed throughout.**
Every onboarding query casts `(supabase as any)` — `useOnboardingState.ts:61,75,90`,
`useMediaAssets.ts:35,117,142`, `ConsentStep.tsx:20`, `OnboardingAssetsPage.tsx:45,57,212`,
`PortalOnboarding.tsx:59`. All of these tables **are** in `src/integrations/supabase/types.ts`, so the casts
buy nothing and cost the only compile-time check that a column rename would break the wizard. Given H4 —
schema changes made live, outside the repo — this is the second line of defence, also disabled. `npx eslint`
reports 36 `no-explicit-any` errors across the onboarding files.

### Low

- **L1** `FilesStep.tsx:45` sets `files_done: true` unconditionally, so `ReviewStep` shows "Files ✓" for a
  client who uploaded nothing — including no logo. If files are genuinely optional the review line should
  say so rather than display a green check.
- **L2** `PortalOnboarding.tsx:288` "Skip onboarding for now" is a dead control (§1.3).
- **L3** `PortalOnboarding.tsx:212,242` — Meta and billing are self-attested (§1.3).
- **L4** `ReviewStep.tsx:34-35` sets `completed_at` as well as `submitted_at`, satisfying `PortalRoute`'s
  gate. A client who finishes the media wizard never sees the legacy Meta/billing steps again — they are
  silently skipped rather than deliberately retired.
- **L5** `ConsentStep.tsx:29` guards against a duplicate-key error on an append-only table with no unique
  constraint — dead defensive code. Each revisit-and-reclick writes another consent row; nothing
  deduplicates or supersedes.
- **L6** Dead code: the empty `useEffect` at `OnboardingWizardPage.tsx:34-38`; the no-op `else if` branch at
  `OnboardingWizard.tsx:61-63`; the unreachable `mark_assets_ready_for_processing` RPC.
- **L7** Mortgage-vertical content is hardcoded into the default path: the NMLS field
  (`InfoStep.tsx:107-109`), the mortgage voice script, `"EMM"` in the consent text and wizard title, and a
  US-only 7-entry timezone list (`InfoStep.tsx:9-17`). This is `scope-of-work` H1, still open.
- **L8** **Zero test coverage.** `src/test/` contains `example.test.ts`, which asserts `true === true`.
  Nothing tests the gates, the flag transitions, the consent write, or the sync state machine.
- **L9** `package-lock.json` is out of sync with `package.json` — `npm ci` fails on missing
  `@testing-library/dom` and friends, so CI cannot do a reproducible install. The repo also carries three
  lockfiles (`package-lock.json`, `bun.lock`, `bun.lockb`).
- **L10** `supabase/config.toml` contains only `project_id`; no per-function `verify_jwt` setting is
  version-controlled, which is what makes H2's exposure unverifiable from the repo.

### Configuration blockers (previously documented in `AUDIT.md` §4a, all still open)

| Variable | Effect while unset |
|---|---|
| `N8N_ONBOARDING_DRIVE_WEBHOOK` | No asset ever reaches Drive. Every asset is marked `failed` with a clear reason. The n8n flow itself does not exist in `workflows/`. |
| `ELEVENLABS_API_KEY` | Voice assets stop at `ready_for_processing`. No clone is produced. |
| `HIGGSFIELD_API_KEY` | Image sets stop at `ready_for_processing`. No avatar is produced. |

The consequence is worth stating plainly: **the capture pipeline has no consumer.** A client can complete
every step, and the assets sit in a private Supabase bucket. Nothing downstream has ever run.

---

## 5 · What is actually well built

Worth protecting through any remediation:

- **Honest failure reporting.** `onboarding-drive-sync` never marks an asset synced on a failure path, and
  writes the real reason to `error_message` — including "webhook not configured". `/onboarding/assets`
  surfaces it verbatim. This is unusually disciplined.
- **The consent gate on staging.** `onboarding-process-stage:285-294` refuses with 412 if no
  `voice_likeness` row exists, and the UI disables the button and explains why
  (`OnboardingAssetsPage.tsx:175,181-185`). The right control in the right place — it just needs the
  consent record itself to be trustworthy (H1).
- **Idempotent sync.** Assets carrying a `drive_file_id` are reconciled rather than re-uploaded (`:126-137`).
- **Step-level persistence.** Each step writes its own flag and assets persist immediately, so nothing is
  lost mid-flow — the storage half of save-and-resume is correct even though the restore half (M2/M3) is not.
- **Genuine voice-capture UX.** `MediaRecorder` with codec negotiation, a live level meter, a max-length
  auto-stop, and a file-upload fallback on mic-permission failure.
- **The `client_onboarding_status` view.** The right rollup for the staff board.

---

## 6 · Recommended order of work

Sequenced by risk, not by effort.

1. **Export the live schema into migrations** (H4). Everything else is unreviewable until the RLS policies,
   the bucket policies and the five RPCs are in the repo. Start here.
2. **Move consent server-side** (H1). Edge function; canonical `consent_text`; server-stamped IP and
   timestamp; consenting subject recorded distinctly from the operating user; refuse third-party consent.
3. **Fix or delete `portal-provision`** (H2). It is unreferenced, its redirect host is wrong, and its
   no-email branch cannot succeed. If the trigger-driven design is still wanted, add a shared-secret check
   and stop honouring `body.email`; otherwise remove it from the project.
4. **Validate media server-side** (H5). Re-derive dimensions and duration on ingest; make the gates real.
5. **Re-key `portal_onboarding` to `client_id`** (M8), migrating existing rows and collapsing duplicates.
6. **Fix the three resume/edit bugs** (M1, M2, M3) — small changes, directly felt by every client.
7. **Wire the handoff** (H3, M4): conversion creates the onboarding artifacts; submission notifies, opens
   tasks and fires the phase webhook. Reuse `client_status_phases.webhook_url` rather than a fourth
   mechanism.
8. **Make the Drive sync queued** (M5) and give the write-back path a service-role caller (M6), *then*
   configure `N8N_ONBOARDING_DRIVE_WEBHOOK` and build the n8n flow.
9. **Collapse the three phase models to one** (M10) — `client_status_phases` is the only configurable one
   and the only one that can fire a webhook.
10. **Make the kanban checklists real or remove them** (§1.1). Thirty fake checkboxes are worse than none:
    staff will believe them.
11. **Test the gates** (L8) and re-sync the lockfile (L9).

Items 1–4 are the ones that carry legal and security exposure. Items 5–11 are product correctness.
