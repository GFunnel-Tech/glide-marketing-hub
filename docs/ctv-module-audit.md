# CTV Business Module — Repo Audit & Build List

**Source:** `CTV_Business_Module_1.docx` (GFunnel Business Module — Connected TV, "Streaming Revenue System"), dated June 2026, target launch **September 1**.
**Audited against:** `gfunnel-tech/glide-marketing-hub` @ `claude/glide-business-module-audit-osgl3z` (115 tables, 78 edge functions, 13 n8n workflows).
**Audit date:** 2026-08-31.
**Companion:** `docs/d3-sales-onboarding-audit.md` — audits the RIVE D3 sales playbook and the onboarding handoff. Four builds below (G2, G3, G12, G13) are shared with that audit and should be built once.

---

## Headline

**Nothing CTV-specific exists in this repo.** A case-sensitive search for `CTV`, and searches for
`SearchLight`, `ServiceTitan`, `HubSpot`, `Upwave`, `tvScientific`, `MNTN`, `Vibe.co`, `call tracking`,
`vanity URL` and `QR code` return **zero hits** across `src/`, `supabase/` and `workflows/`.

What the repo *does* have is a mature, general-purpose agency platform — Meta ads sync, GHL, client
portal, reporting engine, KPI/guarantee framework, first-party tracking collector, Stripe, n8n +
ClickUp orchestration. Roughly **60% of the plumbing the module needs already exists in a reusable
form**; the missing 40% is the entire part that makes CTV a *product* rather than a channel.

Target launch is **tomorrow**. Section 12 of the module recommends a paid pilot (one client, 60–90 days)
before full launch — on the current codebase, that pilot is the only realistic September action, and
even it needs the P0 list below built first.

---

## 1. Stack scorecard (module §10)

| # | Layer | Module's tool | Status | Repo evidence |
|---|---|---|---|---|
| 1 | Landing page | Lovable, Glide-branded | ❌ Missing | Public routes are `/auth`, `/portal/*`, `/client-portal/:id`, `/r/:token`, `/demo/gfunnel`. No offer/sales page. |
| 2 | Lead capture / booking | GoHighLevel | ✅ Have (infra) | 13 `ghl-*` edge functions, `ghl_contacts/opportunities/pipelines/appointments`, `ghl-webhook-inbound` |
| 3 | CRM pipeline | HubSpot | ❌ Missing | Zero references. Stack is GHL-native — see Decision D1. |
| 4 | Checkout | Stripe | ⚠️ Partial (wrong direction) | `stripe-client-*` reads the *client's* revenue; `agency-stripe-connect`; `rebill_*` bills ad spend. No product catalog, no setup-fee + subscription checkout. |
| 5 | Orchestration | n8n + ClickUp | ⚠️ Partial | `src/lib/api.ts` posts to `apihub.gfunnel.com/webhook/{slug}`; `workflows/09-clickup-task-creation.json`; `integration_configs.clickup_api_token` |
| 6 | Creative | RIVE (S/A/B) | ⚠️ Partial | `ai-creative-generate`, `meta-ad-generate`, `AdCreator`, `creative_approvals`, `client_media_assets` — all static/Meta. No video spot pipeline, no S/A/B tier field. |
| 7 | Media buying | Vibe / tvScientific / MNTN | ❌ Missing | `src/lib/adChannels/types.ts`: `AdChannel = "meta" \| "google" \| "tiktok" \| "linkedin"`; only `meta.ts` implemented, rest is `stub.ts`. |
| 8 | Call tracking | Per-campaign numbers | ❌ Missing | No calls table, no telephony provider anywhere. |
| 9 | Revenue attribution | SearchLight | ❌ Missing | No revenue-attribution table of any kind. |
| 10 | Brand lift | Upwave | ❌ Missing | — |
| 11 | CRM / ops | ServiceTitan | ❌ Missing | Client-side CRM integrations today: GHL, Meta, Stripe. |
| 12 | Reporting | Unified ROAS dashboard | ⚠️ Partial | Strong engine (`report-generate`, `client_reports`, `report_templates`, `PublicReport`), but ROAS has no revenue feed and no CTV funnel metrics. |

**1 have · 4 partial · 7 missing.**

---

## 2. The attribution moat (module §5) — the largest gap

The module is explicit that attribution *is* the product. Every one of its five signal layers is unbuilt.

| Signal | Module spec | Status | Nearest existing foundation |
|---|---|---|---|
| Deterministic — call tracking | Unique tracking number per CTV campaign | ❌ Missing | Nothing. GHL holds contacts/appointments but no call records or number provisioning. |
| Deterministic — QR / vanity URL | Codes and vanity URLs in creative → dedicated UTM landing pages | ❌ Missing | `supabase/functions/track` + `tracking_containers` / `tracking_events` / `tracking_pixels` is a working first-party pageview+event collector with UTM-bearing `url` and free-form `properties`. It can measure those pages the day they exist. No QR generator, no vanity-URL redirector, no landing-page builder. |
| Probabilistic — household IP | CTV platform pixel → later web visits and calls | ❌ Missing | `tracking_events.ip_hash` is already captured — the raw material is there. No platform postback ingestion, no match job. |
| Revenue truth | SearchLight ↔ ServiceTitan, source → booked job → revenue | ❌ Missing | Only revenue in the system is `stripe_charges` (the client's own Stripe). `leads.lead_outcome` has `closed_won` but carries **no deal value**. |
| Brand lift | Upwave (optional upsell) | ❌ Missing | — |
| Integration glue | n8n unifying postbacks, calls, GHL, ServiceTitan, SearchLight | ❌ Missing | n8n substrate and 13 exported workflows exist; none of these pipelines do. |

Consequence: `kpiGlossary.roas` is defined (`Revenue ÷ Spend`, benchmark 2.0×) but **has no revenue input**.
The dashboard the offer promises — *spend → households reached → calls and visits → booked jobs → revenue* —
has zero of its five stages instrumented for CTV.

---

## 3. What is genuinely reusable

These are real assets — the CTV build should extend them, not restart.

- **Reporting engine.** `report-generate` / `report-deliver` / `reports-schedule-cron`, `client_reports`
  (PDF + `share_token`), `report_templates.sections`, public `/r/:token`, portal reports tab. A CTV report is a
  new template + new metrics, not a new engine.
- **KPI framework.** `kpiGlossary`, `custom_kpis` + `FormulaBuilder`, `client_kpi_overrides`,
  `v_client_kpi_snapshot`, `KPIStrip`, `custom-kpi-evaluate`. CTV funnel metrics can be defined here.
- **Guarantee framework.** `guarantee_templates` / `client_guarantees` / `guaranteeEvaluator` with
  `duration_days` and `on_track|at_risk|met|failed`. Closest existing thing to the 14-day guarantee — but see gap G7.
- **Tracking collector.** First-party, cookieless-ish, IP-hashed, pixel-injecting. Directly useful for
  vanity-URL landing pages.
- **Orchestration substrate.** n8n webhook client + ClickUp task creation + `task_routing_rules` + tasks/SLA cron.
- **Client lifecycle.** `clients.status` (13 states), `client_status_phases`, `compute_client_status`,
  onboarding kanban, portal, `client_embeds` / `workspace_embed_tabs` (could embed a CTV platform dashboard as a stopgap).
- **Onboarding wizard.** `OnboardingWizard` + `portal_onboarding` + `client_media_assets` + private
  `client-onboarding` bucket + `client_consents`. Solid shell — wrong contents (see gap G3).

---

## 4. What we still need created

Ordered so the **P0 block is exactly what a 60–90 day paid pilot requires**.

### P0 — pilot-blocking (nothing about CTV can be sold or delivered without these)

| # | Build | Where it plugs in |
|---|---|---|
| G1 | **CTV offer landing page** — Glide-branded, the promise from §3, tier table from §7, booking CTA. | New public route; instrument with the existing `track` container. |
| G2 | **Productized checkout** — Stripe products/prices for Launch / Growth / Scale (setup fee + monthly), checkout session, `order.paid` webhook → provisioning. | New `stripe-offer-checkout` + `stripe-offer-webhook` edge functions; new `ctv_orders` table. Do **not** overload `stripe-client-*` (opposite direction of money). |
| G3 | **CTV intake form** — business details, ServiceTitan access, target market/geo, service areas, spend tier, offer, brand assets. | Extend `OnboardingWizard` with a CTV step set; today's steps capture mortgage-brand assets (there is an `NMLS #` field) and voice-clone consent. |
| G4 | **Call tracking** — vendor selection, per-campaign number provisioning, inbound call → `ctv_calls` → client match. | New `ctv_calls` table + `calltracking-webhook` edge function + n8n pipeline. No foundation exists. |
| G5 | **Vanity URL + QR service** — short-link redirector with UTM stamping, QR image generation, per-campaign dedicated landing pages. | Redirect edge function + `ctv_links` table; measurement rides the existing `track` collector. |
| G6 | **CTV channel adapter + spend ingestion** — a `ctv` member of `AdChannel`, an adapter for the chosen platform, and a daily insights sync (spend, impressions, households reached) analogous to `meta_insights_daily`. | `src/lib/adChannels/ctv.ts`, `ctv_accounts` + `ctv_insights_daily`, `ctv-sync` edge function. |
| G7 | **Fulfillment-milestone guarantee** — "ROAS dashboard live and tracking booked jobs within 14 days of launch, or setup fee refunded." | New criterion type in `guaranteeTypes.ts` (today's metrics are all outcome-based: leads/appointments/deals/roas), a 14-day SLA clock, and a refund action. The framework is right; the criterion type is missing. |
| G8 | **Unified ROAS dashboard v1** — the five-stage funnel: spend → households reached → calls & visits → booked jobs → revenue. | New CTV report template + KPI definitions + a dashboard surface. Engine exists; metrics and template do not. |

### P1 — required before the offer scales past the pilot

| # | Build | Note |
|---|---|---|
| G9 | **SearchLight integration** — the revenue backbone. Per-client onboarding, source → booked job → revenue sync. | Module §12 already lists "SearchLight onboarding and per-client integration setup" as an open item. Contract and API access are prerequisites. |
| G10 | **ServiceTitan integration** — booked-job and revenue data for the beachhead vertical. | May arrive via SearchLight rather than direct; confirm before building twice. |
| G11 | **Household-IP probabilistic matching** — platform pixel postback ingestion + match job against `tracking_events.ip_hash` and `ctv_calls`. | This is the piece competitors don't do; it is also the piece with the most modelling risk. |
| G12 | **CRM pipeline for Glide's own sales** — deal stages lead → closed for the CTV offer itself. | Depends on D1. Every CRM object in the repo today models *the client's* leads, not Glide's. |
| G13 | **Order → fulfillment orchestration** — n8n flow firing the three parallel ClickUp tracks from §8 (creative / buying / attribution) on order paid, with a fulfillment stage machine and the 14-day clock. | `workflows/09-clickup-task-creation.json` is a single-task webhook; this needs a real pipeline. |
| G14 | **Video spot pipeline** — script → storyboard → edit → client approval, with an S/A/B tier field and spot versioning. | `creative_approvals` + `PortalApprovals` are the approval surface; asset model is static-image-shaped. |
| G15 | **Tier / product catalog + MRR** — Launch / Growth / Scale as first-class records so pricing, upsells and recurring revenue are tracked. | Nothing models Glide's own product line today. |

### P2 — upsell and polish

| # | Build |
|---|---|
| G16 | **Upwave brand-lift integration** — optional top-of-funnel add-on (§6). |
| G17 | **Media markup handling** — pass-through spend with optional Glide markup (§7). `rebill_configs` already does markup maths for ad spend and is the natural place to extend. |
| G18 | **Multi-market / multi-location rollout** — named upsell path in §7. |

---

## 5. Decisions that block the build

| # | Decision | Why it blocks |
|---|---|---|
| D1 | **HubSpot, or GHL/internal for Glide's own CRM?** *(superseded by D7 in the D3 audit — the CRM must now serve two different sales motions)* | §9/§10 name HubSpot; the repo has deep GHL wiring and zero HubSpot. Adopting HubSpot means a net-new integration surface (auth, sync, webhooks, mapping) for one pipeline. This changes G12 substantially. |
| D2 | **Which buying platform first?** | §12 lists this as open. G6's adapter is platform-specific — Vibe, tvScientific and MNTN have materially different APIs and attribution surfaces. Picking one unblocks G6; picking none stalls it. |
| D3 | **Branding: EMM or Glide?** | The wizard, workflows, and theme are EMM-branded throughout (`EMM_THEME`, `EMM — …` workflow names, and `AUDIT.md` states branding is EMM-only client-facing). The module requires Glide-branded surfaces with GFunnel silent. Multi-brand theming needs a decision before G1/G3. |
| D4 | **Call-tracking vendor.** | G4 cannot start without it. Also determines whether call data flows via SearchLight or direct. |
| D5 | **SearchLight commercial access.** | G9 and, transitively, the entire revenue half of G8. |
| D6 | **Client-facing product name.** | §3 lists it open; blocks G1 copy and G15. |

---

## 6. Risk note on the timeline

Module §13's build sequence is: lock offer/pricing → landing page → sales+checkout → fulfillment automation
→ ad creative → paid pilot (60–90 days) → launch September 1. Steps 2 through 5 are unbuilt as of today,
and the pilot the module itself recommends has a 60–90 day floor. A September 1 *full* launch is not
reachable from this codebase. A September pilot **is** reachable if P0 is scoped to a single client and a
single buying platform — and the module's own recommendation (paid pilot, fixed scope, one client) is
precisely the right shape for that.

The principal risk the module names — media strategy and creative judgment not being absorbed by
automation — is unchanged by anything in this repo, and stays a human-owned lane.
