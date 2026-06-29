# metahub Client Onboarding & Asset Capture — AUDIT

> Companion to the PM spec. Captures the real state of the metahub repo and DB,
> the build-vs-reuse decisions, and the resolutions of forks F1–F7.
> Branding throughout the wizard is EMM-only; "GFunnel" never appears
> in any client-facing surface.

## 1. Repo & framework

| Thing | Reality |
|---|---|
| Stack | React 18 + Vite (SWC) + TypeScript, Tailwind CSS, Radix UI primitives (`@radix-ui/react-*`), `react-router-dom@6` |
| Component library | shadcn-style local copies under `src/components/ui/*` (button, dialog, card, input, label, textarea, checkbox, progress, scroll-area, toaster, sonner, …) |
| Notifications | `sonner` toaster mounted at `App.tsx`; existing usages already imported. Use `toast.success/error/info`. |
| Modal/dialog | `src/components/ui/dialog.tsx` (Radix). Already used elsewhere; the onboarding wizard uses this. |
| Routing | `BrowserRouter` in `App.tsx`. Workspace-scoped client URLs are the convention. |
| Brand theme | `PortalLayout` already defines an `emmTheme` CSS-var palette — we reuse the same vars on the wizard so the popup matches portal styling everywhere. No EMM logo asset is in the repo today; `agency_profiles.logo_url` is the per-workspace logo and is used when available. |

## 2. Auth & client model

| Thing | Reality |
|---|---|
| Auth | Supabase Auth via `@supabase/supabase-js`. `AuthProvider` in `src/contexts/AuthContext.tsx` (listener-before-getSession). |
| Workspaces | `workspace_members` (`owner | admin | member | viewer`). Helper RPCs in DB: `is_workspace_member`, `workspace_role_of`, `can_write_workspace`, `is_super_admin`. |
| Clients | `public.clients` (SERIAL id, `name`, `brand`, `workspace_id`, `status` enum incl. `NEW`, `PENDING_APPROVAL`, `GREEN`, `YELLOW`, `RED`, `BLOCKED`, …). |
| Portal users | `public.portal_users` keyed `(user_id, client_id)` with `status` (`pending_approval` / `active`). One portal user can map to several clients; the active one is `localStorage:portal:activeClientId`. |
| Existing portal-side onboarding | `public.portal_onboarding` already exists — 4-step (profile / meta / billing / brand). Built for the operational portal handoff, NOT for media/voice asset capture. We **reuse the row** (extend it with new step flags and link to the new media tables) rather than rebuild it. |

## 3. Database — what's there, what we add

### Already present
- `clients`, `workspaces`, `workspace_members`, `portal_users`, `portal_onboarding`, `client_invites`, `agency_profiles`.
- `update_updated_at_column()` trigger function (used across the schema — we reuse it on new tables).
- Storage buckets exist for unrelated work: `client-reports` (private, authenticated read), `agency-assets` (public), `ad-creatives` (public-read).
- **No media-asset / consent / voice tables exist.** No Higgsfield, ElevenLabs, Drive, or n8n-onboarding tables exist.

### Added by this build
- `client_media_assets` — one row per uploaded file (image / voice / logo / file). Holds storage path, mime, byte size, voice duration, image dimensions, Drive sync state, processing state, returned voice/character IDs, last error.
- `client_consents` — append-only consent log (`voice_likeness`, exact text shown, granted_by, granted_at, method).
- `portal_onboarding` is **extended** with new flags (`consent_done`, `info_done`, `images_done`, `voice_done`, `files_done`, `submitted_at`), the legacy 4 booleans are kept untouched, and a `submitted_at` separate from the legacy `completed_at` so we don't break the old portal flow.
- Private storage bucket `client-onboarding` with strict per-client RLS (clients read/write only their own `{client_id}/...` prefix, workspace members can read all of their workspace's clients).

### Why this shape
- The spec proposed a separate `client_onboarding` table; auditing shows `portal_onboarding` is already the row that's seeded the moment a portal user redeems an invite (see `redeem_client_invite`). Reusing it satisfies guardrail #6 (reuse over rebuild) and saves the wizard from juggling two parallel rows. The new step flags + new tables sit alongside it.

## 4. Storage

- Existing buckets are unsuitable: `client-reports` is private but authenticated-anyone-read (no client scoping), `agency-assets` and `ad-creatives` are public.
- The build creates **`client-onboarding`** as a **private** bucket with key prefix `{client_id}/{kind}/...`. RLS pins reads/writes to the matching client. Workspace members read all of their own workspace's clients via the existing `is_workspace_member` helper.

## 5. Integrations already present (or not)

| Integration | State |
|---|---|
| **n8n** | App calls `https://apihub.gfunnel.com/webhook/{slug}` via `src/lib/api.ts#post()` already. The webhook endpoints `meta-ads-sync`, `manus-audit`, `form-swap`, `budget-scale`, … are wired in n8n. No `onboarding-drive-sync` webhook exists yet — see blocker (4a). |
| **Google Drive** | Nothing in the app today. No Drive client code, no service account, no Drive-related env var. |
| **ElevenLabs / Higgsfield** | No client SDK, no env var, no edge function — confirmed by grep. |
| **Supabase Edge Functions** | Many examples (`portal-chat`, `workspace-invite-user`, `meta-*`) — clear pattern of `verify_jwt = true`, ANON + SERVICE_ROLE split, `Deno.serve` + `corsHeaders`. We follow this pattern for the new functions. |
| **Existing consent capture** | None — the legacy `portal_onboarding` row has no consent fields. This is a fresh build. |

## 6. Env vars in `.env`

```
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
```
Edge functions assume `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (standard Supabase managed). New names introduced by this build (see 4a):

- `N8N_ONBOARDING_DRIVE_WEBHOOK` — the n8n webhook URL that mirrors a finalized asset into Drive and returns its Drive file ID. Build expects this in the edge-function env. **Missing — populate before Drive sync produces real file IDs.**
- `ELEVENLABS_API_KEY` — optional now; required when M5 moves from staging to live generation.
- `HIGGSFIELD_API_KEY` — same.

---

## Build-vs-reuse decisions

| Concern | Decision |
|---|---|
| Onboarding row | **Reuse** `portal_onboarding`, extend with new flags + `submitted_at`. Old portal still works on it. |
| Wizard popup | **New.** Reuses Radix `Dialog`, shadcn `Button`/`Input`/`Label`/`Textarea`/`Progress`/`ScrollArea`, sonner toasts, lucide icons. No new dependencies. |
| Brand theme | **Reuse** the `emmTheme` CSS-var override (already proven in `PortalLayout`). The wizard sets the same vars on its root so it looks identical whether opened from the portal or from the admin/agency surface. |
| Storage RLS | **New** bucket `client-onboarding`, **new** policies keyed on the path prefix. |
| Consent capture | **New** table `client_consents` — there was nothing to extend. |
| Drive sync | **New** edge function `onboarding-drive-sync` that posts to n8n. n8n holds the Drive credential. Idempotent: it sends `client_id`, `asset_id`, `kind`, `signed_url`, `filename`; n8n returns the Drive file id and the function writes it back. |
| Downstream staging | **New** tiny edge function `onboarding-process-stage` that flips `processing_status` and returns signed URLs. Wiring to ElevenLabs/Higgsfield is staged but not run (per F5). |
| Admin status view | **New** route under the existing dashboard at `/onboarding/assets` — beside the existing `/onboarding` (which is unchanged). |

## Fork resolutions (F1–F7)

| # | Default | Resolution | Why |
|---|---|---|---|
| F1 | `/onboarding` + re-openable popup | **Both.** New route `/onboarding/wizard` mounted under `DashboardLayout` for agency staff to preview-and-run, plus same wizard pops on the portal whenever `portal_onboarding.media_done` is false. The legacy `/onboarding` Kanban is left intact. | Audit shows `Onboarding.tsx` is a Kanban dashboard, not the capture flow — we add a new surface and keep the old one. |
| F2 | Admin-invited, client-self-completes | **Reuse the existing invite flow.** `client_invites` + `PortalAcceptInvite` already work; we just deep-link `/portal/onboarding/wizard` post-accept. Admin can also trigger from `/onboarding/wizard?clientId=…`. | The invite/redemption machinery is in place — no duplication. |
| F3 | n8n relay if Drive creds in n8n, else in-app service account | **n8n relay.** Wiring lives in a new edge function `onboarding-drive-sync` that POSTs to n8n. **Drive credentials assumed to live in n8n; the n8n webhook URL is the missing config point.** | n8n is the only place this org already does cross-system orchestration. Adding a Google service-account JSON to the Supabase secret store is a bigger change than necessary for MVP. |
| F4 | ElevenLabs IVC, 2–3 min script | Accepted. Script lives in `src/components/onboarding/voiceScript.ts`; voice gate ≥ 90s, recommend 2–3 min. | — |
| F5 | Admin-approve-then-process | Accepted. Audit shows no working ElevenLabs/Higgsfield call pattern; we **stage** with `ready_for_processing` and persist returned IDs when they arrive. | — |
| F6 | Save-and-resume | Accepted. Each step writes its own flag on `portal_onboarding`; assets persist immediately, the wizard re-opens to the first incomplete step. | — |
| F7 | Checkbox + spoken consent line | Accepted. The script's first sentence is the spoken consent; the checkbox sets `method='both'`. | — |

## 4a. Consolidated blockers

These do not stall the build. The code is complete; populate the env vars / set up the n8n side and the integration becomes live.

| Blocker | What's needed | What the build does in the meantime |
|---|---|---|
| **n8n Drive webhook** | Set `N8N_ONBOARDING_DRIVE_WEBHOOK` in Supabase edge function env. The webhook should accept `{client_id, asset_id, kind, filename, signed_url, brand, drive_folder_name}`, create folder `EMM Clients/{brand} — {short}/{Images|Voice|Files|Generated}/`, idempotently upsert the file, and return `{ok:true, drive_file_id}`. | The edge function returns `pending` and writes `drive_sync_status='failed'` with a clear `error_message="onboarding-drive-sync webhook not configured"`. Admin view surfaces this. |
| **ElevenLabs API key** | `ELEVENLABS_API_KEY` in edge function env, once we move from staging to generation. | Voice assets reach `ready_for_processing`; no API call attempted. |
| **Higgsfield API key** | `HIGGSFIELD_API_KEY` in edge function env. | Image set reaches `ready_for_processing`; no API call attempted. |

