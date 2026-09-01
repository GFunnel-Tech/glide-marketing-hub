# Scope of Work — Glide CTV Product & RIVE D3 Sales System

**Client:** GFunnel / Glide / RIVE
**Repository:** `gfunnel-tech/glide-marketing-hub`
**Branch:** `claude/glide-business-module-audit-osgl3z` · [PR #1](https://github.com/GFunnel-Tech/glide-marketing-hub/pull/1)
**Version:** 1.0 · 2026-08-31
**Source documents:** `CTV_Business_Module_1.docx`, `DIVIDE_DEVELOP_DISRUPT.docx`
**Supporting audits:** `docs/ctv-module-audit.md`, `docs/d3-sales-onboarding-audit.md`

---

## 1. Executive summary

This document scopes the build required to operationalise two business documents against the existing
`glide-marketing-hub` platform: the **Connected TV business module** (a productized Glide offering) and the
**RIVE D3 Divide-phase sales playbook** (a fourteen-day consultative sales motion).

Both documents describe processes that are, today, entirely manual. The repository is a mature agency
platform — Meta ads, GoHighLevel, client portal, reporting engine, KPI and guarantee frameworks, first-party
tracking, Stripe, n8n and ClickUp orchestration — but it contains **no CTV-specific code and no agency-side
sales pipeline of any kind**.

The work is scoped as **38 work items across 6 workstreams**, gated by **11 decisions** that must be resolved
before or during Phase 0.

### The three findings that shape this scope

1. **There are two incompatible sales motions, not one.** The CTV module describes a low-touch productized
   funnel; D3 describes a high-touch consultative sale with no pricing until day ten. They share a customer
   base boundary but almost no system surface. Both must be built, or one must be formally descoped.
2. **Nothing models a prospect.** Every operational object in the repository is keyed to `clients.id`, and
   every CRM-shaped object models *the client's* leads rather than *the agency's* prospects. This single
   constraint gates both motions and is the first item on the critical path.
3. **The CTV offer's core promise depends on a vendor that is not yet contracted.** The offer sells measured
   brand media — revenue, not impressions. Revenue truth comes from SearchLight. Until that relationship
   exists, the product can be built and instrumented but its central claim can only be approximated.

---

## 2. Scope boundaries

### 2.1 In scope

- All application, database, edge-function and workflow changes required to run both sales motions and to
  deliver, measure and report the CTV product.
- Integration work against third-party platforms named in the source documents, subject to the client
  securing commercial access (see §9).
- Reconfiguration of existing subsystems (onboarding wizard, guarantee framework, reporting engine, KPI
  framework, approval framework) to serve the new offers.
- Remediation of two integration blockers already documented in the repository's own `AUDIT.md`.

### 2.2 Out of scope

- **Media strategy and creative judgment.** What audience, what offer, what the spot says. The CTV module
  names this as its principal risk and it is explicitly a human-owned lane, not a system deliverable.
- **Building ad infrastructure or a programmatic trading desk.** The module is explicit that the buying
  engine is rented, not built.
- **Production of the CTV spots themselves.** RIVE's creative output is a service, not a deliverable of this
  build; the build delivers the pipeline that manages it.
- **Migration of existing mortgage-vertical clients** off the current onboarding step set. The legacy path
  is retained; only new offer types get new step sets.
- **Commercial negotiation** with SearchLight, ServiceTitan, Upwave, the call-tracking vendor, the CTV
  buying platform, or the e-signature vendor.
- **Backfill of historical CTV data.** There is none.

### 2.3 Assumptions

- The client secures API access and commercial terms for each named vendor before the corresponding work
  item begins. Vendor-dependent items are marked in §6.
- Supabase remains the platform of record; n8n remains the orchestration layer; ClickUp remains the
  fulfillment task surface.
- The existing workspace and client-scoping model (`workspace_members`, RLS helpers, `can_access_client`)
  is retained and extended rather than replaced.
- Lovable remains in the loop as an editing surface, so schema changes must be applied in a way that keeps
  the generated `src/integrations/supabase/types.ts` authoritative.
- No pre-existing production CTV campaigns need to be imported.

---

## 3. Current state

Condensed from the two audits. Full evidence in the companion documents.

### 3.1 CTV module — stack scorecard (module §10)

| Layer | Specified | State |
|---|---|---|
| Landing page | Lovable, Glide-branded | Missing |
| Lead capture / booking | GoHighLevel | **Built** — 13 edge functions, contacts/opportunities/pipelines/appointments |
| CRM pipeline | HubSpot | Missing — zero references |
| Checkout | Stripe | Partial — exists, but runs the opposite direction |
| Orchestration | n8n + ClickUp | Partial — single-task webhook, not a pipeline |
| Creative | RIVE S/A/B | Partial — static and Meta-shaped |
| Media buying | Vibe / tvScientific / MNTN | Missing — `AdChannel` covers meta, google, tiktok, linkedin only |
| Call tracking | Per-campaign numbers | Missing — no calls table, no telephony anywhere |
| Revenue attribution | SearchLight | Missing |
| Brand lift | Upwave | Missing |
| CRM / ops | ServiceTitan | Missing |
| Reporting | Unified ROAS dashboard | Partial — strong engine, no revenue feed, no CTV metrics |

**1 built · 4 partial · 7 missing.** All five attribution signal layers are unbuilt.

### 3.2 D3 playbook — 16 steps audited

**1 supported · 3 partial · 12 missing.** The one supported step is the Brand Manager handoff. The three
partial steps are the pre-meeting brief, template-driven research, and the internal quality gate.

### 3.3 Assets that materially reduce this scope

| Asset | Why it matters |
|---|---|
| `client-audit-generate` | Already implements deterministic-compute → constrained-narrative → branded-PDF → tasks-per-finding. This is the playbook's "template in, template out" rule, working. The four intelligence workflows are built on it. |
| `ai_pending_actions` + `ai_action_audit_log` | A working human-in-the-loop approval framework with proposer, reasoning, approver and full audit trail. The Day 9 quality gate extends this. |
| Reporting engine | `report-generate` / `report-deliver` / `reports-schedule-cron`, `client_reports` with PDF and share tokens, templated sections, public route. A CTV report is a template, not an engine. |
| KPI framework | `kpiGlossary`, `custom_kpis` with a formula builder, per-client overrides, snapshot views. CTV funnel metrics are definitions, not new machinery. |
| Guarantee framework | `guarantee_templates` / `client_guarantees` / evaluator with duration and status transitions. Needs one new criterion type. |
| Tracking collector | First-party, IP-hashed, pixel-injecting, UTM-carrying. Directly serves vanity-URL landing pages and supplies the raw material for household matching. |
| Onboarding & handoff | Invite → provision → portal → asset capture with consent logging and Drive mirroring. Machinery is right; step contents are wrong. |
| Client lifecycle | 13 statuses, configurable phases with per-phase webhooks, kanban. The basis for both pipeline stage machines. |

---

## 4. Solution architecture

### 4.1 Shared commercial core

Both motions converge on one commercial core and diverge above it:

- **Shared:** the prospect and account model, the phase machinery, selling-direction Stripe, the onboarding
  and handoff flow, and the fulfillment orchestration.
- **RIVE-specific:** structured discovery, the creative-courage score, the research template registry and
  intelligence workflows, the Divide Deck, the quality gate, proposals, contracts and milestone billing.
- **Glide/CTV-specific:** the offer landing page, productized checkout tiers, the CTV channel adapter and
  spend sync, call tracking, vanity URLs and QR, household matching, revenue integrations, the ROAS
  dashboard, and the fulfillment guarantee.

### 4.2 Prospect model — the foundational decision

`clients.id` is a number and effectively every operational object hangs off it. Two shapes were considered:

**Recommended — prospects as `clients` rows with a lifecycle discriminator.** Add `clients.lifecycle`
(`prospect` | `client` | `churned`) plus account fields. D3 and CTV phases are seeded into the existing
`client_status_phases`. Tasks, notes, AI context, research artifacts, approvals and the ClickUp binding all
work immediately.

*Cost:* "client" stops meaning "paying client". Billing scans, KPI rollups, churn detection, `compute_client_status`
and `auto_classify_new_clients` must all exclude pre-sale rows. The discriminator makes that exclusion the
default rather than a filter people must remember.

**Alternative — a separate `prospects` table.** Cleaner semantics, but every reusable subsystem above is
`client_id`-typed and would need a parallel path or a polymorphic key, forfeiting most of the reuse.

### 4.3 Attribution architecture

The CTV attribution model stitches four signal classes into one revenue view:

1. **Deterministic — calls.** A unique tracking number per campaign, inbound webhook to `ctv_calls`,
   matched to campaign and client.
2. **Deterministic — QR and vanity URLs.** Short links stamping UTMs into dedicated campaign landing pages,
   measured by the existing first-party collector.
3. **Probabilistic — household IP.** Platform pixel exposures joined to subsequent web visits and calls
   within a configurable window, carrying a confidence score and labelled as modelled.
4. **Revenue truth.** SearchLight ties marketing source to booked jobs and actual revenue, integrated with
   ServiceTitan.

n8n unifies platform postbacks, call tracking, GHL, ServiceTitan and SearchLight into the ROAS dashboard.
The dashboard must visually and textually distinguish deterministic from modelled contribution — the module's
own "honest framing" requirement, and a contractual risk if omitted.

---

## 5. Workstreams

| WS | Name | Items | Character |
|---|---|---|---|
| WS1 | Commercial Core | 8 | Shared. Prospects, pipelines, catalog, selling-direction money. |
| WS2 | D3 Sales Enablement | 9 | RIVE. Discovery, research, deck, quality gate. |
| WS3 | Onboarding & Handoff | 5 | Shared. Intake, checklist, orchestration, config remediation. |
| WS4 | CTV Attribution & Activation | 9 | Glide. The moat and the media layer. |
| WS5 | Measurement & Reporting | 4 | Glide. Funnel metrics, dashboard, report, guarantee. |
| WS6 | Creative Production | 3 | RIVE ↔ Glide. Spot pipeline, tiering, lane handoff. |

**Sizing scale.** S ≤ 3 days · M = 1–2 weeks · L = 2–4 weeks · XL = 4+ weeks or vendor-gated. These are
relative sizings for sequencing, not a commercial quote.

---

## 6. Work items

### WS1 — Commercial Core

---

#### C1 · Prospect & account model — **L**
Introduce agency-side prospects so a company can exist in the system before it is a paying client.

**Deliverables.** `clients.lifecycle` discriminator; account fields (decision-maker, relationship owner,
warmest path to introduction, source); exclusion of pre-sale rows from billing scans, KPI rollups, churn
detection, `compute_client_status` and `auto_classify_new_clients`; prospect list and record UI.
**Acceptance.** A prospect can be created with no ad account, no Stripe connection and no portal user; it
appears in no portfolio KPI, billing scan or status cron; converting to client preserves every note, task
and artifact attached during the sale.
**Depends on.** D7, D8. **Reuses.** `clients`, `client_notes`, `client_status_phases`.
**Consolidates.** CTV G12, D3 S1.

---

#### C2 · Pipeline stage machines — **M**
Two configured stage sets on shared phase machinery: RIVE D3 (Day 0 → 14) and Glide CTV (productized funnel).

**Deliverables.** Dedicated `pipelines` and `pipeline_stages` tables; both stage sets seeded with ordering,
day labels, exit criteria and a per-stage webhook; `pipeline_id` / `pipeline_stage_id` / `stage_entered_at`
on `clients`; a board view per pipeline.
**Acceptance.** Moving a prospect through D3 stages fires the configured n8n webhook per stage; a stage with
unmet exit criteria is blocked with a stated reason; the two pipelines render and operate independently.
**Depends on.** C1. **Reuses.** `update_updated_at_column`, the workspace RLS helpers, `Onboarding.tsx` kanban
patterns. **Consolidates.** D3 S2.

> **Design correction (2026-09-01).** This item originally proposed extending `client_status_phases`.
> Inspection of that table shows it is keyed by `status_key` against the `client_status` enum — GREEN,
> LAUNCHING, LEARNING — and several keys are auto-managed by `compute_client_status`. Those are client
> *health* states, not sale stages. Overloading it would mean adding fourteen sales stages to a health enum
> and teaching the health automation to ignore them. Dedicated tables are cheaper and keep both concepts
> intact; the per-stage webhook idea carries over unchanged.

---

#### C3 · Product & tier catalog + MRR — **M**
First-class records for what the business sells: CTV Launch / Growth / Scale, the RIVE Brand Leadership
retainer, and production line items.

**Deliverables.** `products` and `product_prices` tables linked to Stripe price IDs; `subscriptions`; an MRR
rollup view.
**Acceptance.** The landing-page tier table renders from the catalog; a price change requires no deploy;
the MRR view reconciles to Stripe.
**Depends on.** D6 (product name). **Consolidates.** CTV G15.

---

#### C4 · Selling-direction Stripe — **L**
The missing money direction: Glide and RIVE charging their own customers. Distinct from `stripe-client-*`
(reads the client's revenue) and `rebill_*` (bills ad spend back).

**Deliverables.** `stripe-offer-checkout` edge function creating a session for setup fee plus subscription;
`stripe-offer-webhook` handling checkout completion, invoice payment and subscription lifecycle; `orders`
and `order_line_items`; an idempotent provisioning trigger.
**Acceptance.** A test purchase of CTV Growth creates an order, starts a subscription, charges setup plus
first month, and fires provisioning exactly once even when the webhook is replayed.
**Depends on.** C3, D7. **Consolidates.** CTV G2, D3 S13.

---

#### C5 · Proposal & quote object — **M**
For the D3 custom production investment, which by design cannot be priced from a table.

**Deliverables.** `proposals` (prospect, scope narrative, line items, estimated total, deposit percentage,
schedule terms, status, version); a proposal builder; PDF render on the existing branded-document pattern;
share token for client viewing.
**Acceptance.** A proposal can be versioned, sent by link, viewed by the prospect and accepted; acceptance
advances the pipeline stage.
**Depends on.** C1, C2. **Consolidates.** D3 S10.

---

#### C6 · MSA, SOW & e-signature — **L** *(vendor-gated)*
**Deliverables.** Vendor integration per D9; `contracts` table (kind, status, signed_at, signer, document URL,
linked proposal); send-for-signature action; completion webhook; countersignature flow.
**Acceptance.** MSA and SOW can be sent, signed and stored; completion advances the pipeline and unlocks
deposit invoicing.
**Depends on.** D9, C5. **Consolidates.** D3 S11.

---

#### C7 · Deposit & payment-schedule billing — **L**
**Deliverables.** `payment_schedules` and `payment_milestones`; deposit invoice raised on contract signature
(default 30%); remaining balance spread across a configurable term (default 9–12 months); dunning; a schedule
view on the client record.
**Acceptance.** Accepting a $120,000 production proposal at 30% over 12 months generates a $36,000 deposit
invoice and twelve scheduled invoices totalling $84,000; a missed payment raises an alert.
**Depends on.** C4, C6. **Consolidates.** D3 S12.

---

#### C8 · Media markup & pass-through — **S**
**Deliverables.** Extend `rebill_configs` to cover CTV platform spend; per-client markup percentage;
pass-through versus marked-up flag on invoices.
**Acceptance.** CTV spend appears on the client invoice at the configured markup, or as pass-through when set.
**Depends on.** A4. **Reuses.** `rebill_configs`, `rebill-generate-invoice`. **Consolidates.** CTV G17.

---

### WS2 — D3 Sales Enablement

---

#### R1 · Structured discovery capture — **M**
The four Discovery Areas and their fixed questions, captured live and persisted as structured data.

**Deliverables.** `discovery_sessions` and `discovery_answers`; the question set seeded verbatim from the
playbook (The Business, Revenue Levers, Ideal Customer Profile, Competitive Landscape); a keyboard-first
capture UI usable inside a thirty-minute call; answers exposed as inputs to the research workflows.
**Acceptance.** A Founder completes all four areas during a live thirty-minute call; answers are retrievable
as discrete fields rather than a free-text blob; each intelligence workflow can read them as input.
**Depends on.** C1. **Consolidates.** D3 S3.

---

#### R2 · Creative Courage score — **S**
**Deliverables.** Score (1–5), the blockers surfaced by "what would stop you choosing a five?", verbatim note,
captured-by and captured-at; the five scale definitions rendered in the capture UI; surfaced on the prospect
record and inside the quality gate.
**Acceptance.** The score is required before a prospect exits Discovery; the Day 9 gate displays it beside the
recommendation and blocks release if it is unset.
**Depends on.** R1. **Reuses.** the versioned, breakdown-carrying pattern from `lead_score_rule_sets`.
**Consolidates.** D3 S4.

---

#### R3 · Research template registry — **M**
The mechanism that makes "template in, template out" enforceable rather than aspirational.

**Deliverables.** `research_templates` (key, version, name, typed field definitions, enabled) and
`research_runs` (prospect, template, version, status, filled fields, source citations, model, error); the
four templates seeded with the exact fields the playbook specifies; an admin UI so templates change without
a deploy.
**Acceptance.** A run can write only fields declared in its template version; a model response with extra or
missing fields fails validation with a stated reason; template edits are versioned and historical runs stay
readable against the version that produced them.
**Depends on.** none — can start in Phase 1. **Consolidates.** D3 S6.

---

#### R4 · Four intelligence workflows — **XL**
The largest single build. Competitive, Customer, Revenue and Category intelligence, each filling its
registered template.

**Deliverables.** A `research-generate` edge function on the `client-audit-generate` pattern — gather inputs
(discovery answers plus external research), make a constrained model call bound to the template schema,
validate and write to `research_runs` with source citations, and enter the human review queue; per-template
prompt assets; failure and retry handling.
**Acceptance.** For a test prospect all four templates fill with schema-valid fields carrying source
citations; no run writes an unregistered field; every run passes through the approval queue before it can be
used in a deck.
**Depends on.** R3, R1, D12. **Reuses.** `client-audit-generate`, `_shared/auditMetrics.ts` and
`_shared/auditPdf.ts` patterns, `client_audit_artifacts` shape. **Consolidates.** D3 S5.

---

#### R5 · Prospect research brief — **S**
**Deliverables.** A `prospect-brief` function producing the Day 0 pre-meeting brief — company overview,
leadership, products and services, known competitors, existing brand presence, recent developments — into a
registered template; delivered to the Founder ahead of the meeting.
**Acceptance.** A brief generates from a company name and domain, fills only registered fields, and is
available before the scheduled Discovery meeting.
**Depends on.** R3. **Reuses.** `morning-brief`, `client-trend-brief-send`. **Consolidates.** D3 S7.

---

#### R6 · Divide Deck generation & versioning — **L**
**Deliverables.** `decks` and `deck_versions`; a section model matching the playbook's required content —
what we heard, what we learned, the market, the customer, competitors, where competitors converge, the white
space, the capability verdict, the territory, and the opening of a narrative; assembly from research runs,
discovery and the strategy record; explicit locked-state Develop and Disrupt slides; export per D11.
**Acceptance.** A deck assembles with every required section present; versions are retained and diffable;
export is blocked until the quality gate passes.
**Depends on.** R4, R8, D11. **Consolidates.** D3 S8.

---

#### R7 · Internal quality gate — **M**
The Day 9 review as a blocking gate on the existing approval framework.

**Deliverables.** A `deck_release` action type on `ai_pending_actions`; the nine gate questions as required
checklist items with role assignment (Founder/Brand Director final approval, Creative Director on creative
quality, Strategist on research integrity, Brand Manager on completeness); export blocked until all pass;
dissent recorded.
**Acceptance.** No deck reaches a client surface without four named approvals; the question *"could another
agency have generated essentially the same deck?"* is required and a yes blocks release; every decision lands
in `ai_action_audit_log`.
**Depends on.** R6, R2. **Reuses.** `ai_pending_actions`, `ai_action_audit_log`, `PendingActionsPanel`.
**Consolidates.** D3 S9.

---

#### R8 · Strategy session decision record — **S**
**Deliverables.** `strategy_records` capturing the Day 5 conclusions — can they win, what they do
exceptionally, where the category is crowded, where the white space is, what they should stand for, what they
could own, what competitors would struggle to copy, whether the risk level matches stated appetite, and the
narrative territory — attributed and dated, linked to the deck.
**Acceptance.** Every deck links back to the strategy record that produced its point of view; the record is
required before deck build begins.
**Depends on.** R4. **Consolidates.** D3 S15.

---

#### R9 · Deck outcome tracking — **S**
**Deliverables.** Outcome fields on `deck_versions` — territory proposed, client reaction, accepted or
declined, the commitment answer, closed or lost, and reason; a cross-engagement rollup of which territory
shapes convert.
**Acceptance.** After a Reveal the outcome is recorded and appears in a view spanning engagements.
**Depends on.** R6. **Consolidates.** D3 S16.

---

### WS3 — Onboarding & Handoff

---

#### H1 · Multi-offer onboarding wizard — **L**
Re-shape the wizard from one hardcoded mortgage/voice-clone step set to per-offer step sets.

**Deliverables.** An `onboarding_step_sets` configuration mapping offer type to ordered steps and required
fields; existing generic steps (consent, files, images, voice) retained as optional modules; a **CTV step
set** (business details, ServiceTitan access, target market and geography, service areas, spend tier, the
offer, brand assets, call-tracking preferences); a **RIVE production step set** (brand assets, stakeholders
and approvers, production logistics, existing footage and photography, likeness and legal); mortgage-specific
fields including NMLS removed from the default path.
**Acceptance.** A CTV client and a RIVE production client each see only their own steps; the legacy mortgage
set remains available to existing clients; step flags persist and the wizard resumes at the first incomplete
step.
**Depends on.** C1. **Reuses.** `OnboardingWizard`, `portal_onboarding`, `client_media_assets`,
`client_consents`, the private `client-onboarding` bucket. **Consolidates.** CTV G3, D3 O1.

---

#### H2 · Close-to-handoff checklist — **M**
The Brand Manager's ten responsibilities as tracked, assignable work.

**Deliverables.** A templated task sequence — CRM stage change, proposal administration, MSA, SOW,
deposit and invoice coordination, asset collection, scheduling, client communication, Develop kickoff,
internal handoff — instantiated on closed-won, routed to owners, mirrored to ClickUp.
**Acceptance.** Closing a deal opens the full checklist assigned to the correct owners; the pipeline cannot
reach a delivering state with blocking items open.
**Depends on.** C2, H4. **Reuses.** `client_notes` (kind = task), `task_routing_rules`,
`clients.clickup_list_id`, `09-clickup-task-creation.json`. **Consolidates.** D3 S14.

---

#### H3 · Delivery kickoff transition — **S**
**Deliverables.** The closed-won to delivery transition for both motions — RIVE Develop kickoff, CTV build
start — firing the phase webhook and starting the applicable SLA clocks.
**Acceptance.** The transition fires once, is idempotent under replay, and starts the CTV fourteen-day
guarantee clock where applicable.
**Depends on.** C2, H2, M4. **Consolidates.** D3 O2.

---

#### H4 · Order → fulfillment orchestration — **L**
The module's §8 three parallel tracks.

**Deliverables.** An n8n workflow triggered by C4's provisioning webhook, opening three ClickUp task groups —
creative (the RIVE spot), buying (platform setup, geography and audience targeting), attribution (call
tracking, landing page, pixel, ServiceTitan, SearchLight) — with dependencies and owners; status write-back
to the client record.
**Acceptance.** A paid CTV order produces all three task groups within one minute; task completion writes
back and advances the fulfillment stage; webhook redelivery does not duplicate tasks.
**Depends on.** C4, C2. **Consolidates.** CTV G13.

---

#### H5 · Environment & integration config remediation — **S**
Close the two blockers the repository's own `AUDIT.md` already documents.

**Deliverables.** Set `N8N_ONBOARDING_DRIVE_WEBHOOK` and build the n8n Drive-sync flow it expects — folder
convention, idempotent upsert, returns a Drive file id; decide and set `ELEVENLABS_API_KEY` and
`HIGGSFIELD_API_KEY` or formally descope voice and avatar processing; verify the `retry_drive_sync` path.
**Acceptance.** An uploaded onboarding asset reaches `drive_sync_status = 'synced'` with a real Drive file
id; no asset sits indefinitely at `ready_for_processing` without a stated reason.
**Depends on.** none — can start immediately.

---

### WS4 — CTV Attribution & Activation

---

#### A1 · CTV offer landing page — **M**
**Deliverables.** A Glide-branded public route carrying the module's §3 promise and positioning; the tier
table rendered from the C3 catalog; a booking CTA into GoHighLevel; a tracking container installed; dedicated
UTM-tagged variants per demand source.
**Acceptance.** The page converts to a booked call recorded against a prospect; pageviews and conversions
appear in `tracking_events`; tier content changes without a deploy.
**Depends on.** C3, D6, brand decision. **Reuses.** `track`, `tracking_containers`, GHL booking.
**Consolidates.** CTV G1.

---

#### A2 · Call tracking — **L** *(vendor-gated)*
**Deliverables.** Vendor integration per D4; per-campaign number provisioning and release; `ctv_calls`
(number, campaign, caller, duration, recording URL, disposition, matched client, matched lead); an inbound
webhook; number-pool management; matching to campaign and client.
**Acceptance.** A call to a CTV campaign number creates an attributed row within one minute; numbers can be
provisioned and released per campaign; call volume appears in the dashboard funnel.
**Depends on.** D4, A4. **Consolidates.** CTV G4.

---

#### A3 · Vanity URL & QR service — **M**
**Deliverables.** `ctv_links` (slug, target, campaign, UTM parameters, QR asset path); a redirect function
stamping UTMs; QR generation at broadcast and print resolution; per-campaign dedicated landing pages;
attribution through the existing collector.
**Acceptance.** A QR scanned from a spot lands on the campaign page with UTMs intact and produces an
attributable event; the same slug works as a spoken vanity URL.
**Depends on.** A1. **Reuses.** `track`, `tracking_containers`. **Consolidates.** CTV G5.

---

#### A4 · CTV channel adapter & spend sync — **L**
**Deliverables.** `ctv` added to `AdChannel`; `src/lib/adChannels/ctv.ts` implementing `ChannelAdapter` for
the platform chosen in D2; `ctv_accounts` and `ctv_insights_daily` (spend, impressions, households reached,
completed views, frequency); a `ctv-sync` edge function on a daily cron; account-to-client mapping.
**Acceptance.** Daily spend and households reached land for a live campaign and reconcile to the platform UI
within an agreed tolerance; the adapter honestly reports which operations it supports.
**Depends on.** D2. **Reuses.** the `ChannelAdapter` interface, `meta-sync` and `meta_insights_daily`
patterns, `ClientAccountMapper`. **Consolidates.** CTV G6.

---

#### A5 · Household-IP probabilistic matching — **XL**
**Deliverables.** Platform pixel and postback ingestion; `ctv_exposures` (hashed household IP, campaign,
exposure time); a match job joining exposures to `tracking_events.ip_hash` and to `ctv_calls` within a
configurable lookback; confidence scoring; modelled-contribution output explicitly labelled as such.
**Acceptance.** Matched visits and calls carry a confidence score and a stated lookback window; the dashboard
labels this contribution as modelled and never as deterministic.
**Depends on.** A4, A2, A3. **Risk.** Highest modelling risk in the scope; the module's honest-framing
requirement applies directly here. **Consolidates.** CTV G11.

---

#### A6 · SearchLight integration — **L** *(vendor-gated)*
**Deliverables.** Per-client onboarding flow; a `searchlight_connections` record; source → booked job →
revenue sync into `ctv_revenue_attribution`; a reconciliation job; connection-health surfacing.
**Acceptance.** Booked jobs and revenue attributed to the CTV source appear against the client and feed ROAS;
a broken connection raises an alert rather than silently reporting zero revenue.
**Depends on.** D5. **Consolidates.** CTV G9.

---

#### A7 · ServiceTitan integration — **L**
**Deliverables.** Either a direct integration or a confirmed passthrough via SearchLight — this must be
settled before building, to avoid building the same pipe twice; job and revenue ingestion; client mapping.
**Acceptance.** Booked-job counts reconcile with the client's ServiceTitan for a test period.
**Depends on.** A6 (confirm overlap first). **Consolidates.** CTV G10.

---

#### A8 · Upwave brand lift — **M**
**Deliverables.** An optional per-client add-on; study configuration; result ingestion; a brand-lift report
section, sold and billed separately.
**Acceptance.** A client with the add-on sees brand-lift results alongside revenue; clients without it see no
trace of the feature.
**Depends on.** A4, C3. **Consolidates.** CTV G16.

---

#### A9 · Multi-market rollout — **M**
**Deliverables.** Multiple markets per client, each with its own campaigns, tracking numbers and links;
combined roll-up plus per-market breakdown across the funnel and the report.
**Acceptance.** A two-market client shows both a combined and a per-market funnel with correctly segregated
numbers and links.
**Depends on.** A2, A3, A4, M2. **Consolidates.** CTV G18.

---

### WS5 — Measurement & Reporting

---

#### M1 · CTV KPI definitions & funnel metrics — **M**
**Deliverables.** Added to `kpiGlossary` and `custom_kpis` — households reached, completed view rate, cost
per household, calls per thousand households, visit rate, booked jobs, cost per booked job, revenue per
booked job, and CTV ROAS (modelled), plus incrementality where the platform supports it; the revenue source
finally wired so `roas` has an input.
**Acceptance.** Every stage of the promised funnel has a defined, computable metric with a stated formula and
source; `roas` computes from real revenue rather than returning null.
**Depends on.** A4, A6. **Reuses.** `kpiGlossary`, `custom_kpis`, `FormulaBuilder`, `custom-kpi-evaluate`.

---

#### M2 · Unified ROAS dashboard — **L**
The offer's central deliverable: *spend → households reached → calls and visits → booked jobs → revenue*.

**Deliverables.** The five-stage funnel view with deterministic and modelled contribution visually separated;
an agency view and a client-portal view; date-range control; per-market breakdown hooks.
**Acceptance.** The dashboard renders the full funnel for a live client; modelled contribution is visually
and textually distinguished from deterministic; the client-facing view carries the honest-framing language
from module §5.
**Depends on.** M1, A2, A3, A5. **Reuses.** `KPIStrip`, `v_client_kpi_snapshot`, the portal performance
surface. **Consolidates.** CTV G8.

---

#### M3 · CTV report template & delivery — **M**
**Deliverables.** A CTV entry in `report_templates` with the funnel sections and commentary; monthly
generation and delivery through the existing engine; public share link.
**Acceptance.** A monthly CTV report generates as a branded PDF, delivers to the configured recipients, and
is viewable at its share token.
**Depends on.** M2. **Reuses.** `report-generate`, `report-deliver`, `reports-schedule-cron`,
`client_reports`, `PublicReport`.

---

#### M4 · Fulfillment-milestone guarantee — **M**
The fourteen-day guarantee, which the current outcome-based evaluator cannot express.

**Deliverables.** A `fulfillment_milestone` criterion type in `guaranteeTypes.ts` and the evaluator; the
milestone defined as "ROAS dashboard live and tracking booked jobs"; a fourteen-day clock started by H3;
automatic status transition; breach opening a refund task and alerting the owner; a CTV guarantee template.
**Acceptance.** Launching a CTV client starts a visible fourteen-day clock; the guarantee auto-marks met when
the dashboard is live and tracking booked jobs; a breach opens a setup-fee refund task and notifies the owner.
**Depends on.** M2, H3, C4. **Reuses.** `guarantee_templates`, `client_guarantees`, `guaranteeEvaluator`,
`guarantee_evaluations`, `GuaranteeBuilder`. **Consolidates.** CTV G7.

---

### WS6 — Creative Production

---

#### V1 · Video spot pipeline — **L**
**Deliverables.** `spots` and `spot_versions`; a stage model — brief, script, storyboard, production, edit,
client approval, delivered — with per-stage assets and owners; client approval through the portal.
**Acceptance.** A spot moves through every stage with assets and approvals recorded; the approved cut is the
asset handed to the buying platform.
**Depends on.** H4. **Reuses.** `creative_approvals`, `PortalApprovals`, `client_media_assets`.
**Consolidates.** CTV G14.

---

#### V2 · S/A/B tier grading — **S**
**Deliverables.** A tier field on spots and creative carrying RIVE's definition — how striking, memorable and
bold the idea is, not what it cost; required at brief and at final review; tier-distribution reporting.
**Acceptance.** No spot reaches delivery without a tier; C and D tiers are not selectable for RIVE-produced
work, per the module's §2 constraint.
**Depends on.** V1.

---

#### V3 · RIVE ↔ Glide creative handoff — **M**
The module's §11 lane boundary made operational.

**Deliverables.** A handoff object carrying the brief, the creative-courage score, the approved cut and the
delivery specs; access scoping so RIVE sees creative and approvals but not media budget or client billing.
**Acceptance.** A spot brief reaches RIVE with strategy and courage score attached; the finished cut returns
to the Glide campaign without either party operating outside its stated lane.
**Depends on.** V1, C1.

---

## 7. Phasing & critical path

### 7.1 Phases

| Phase | Focus | Items |
|---|---|---|
| **0** | Decisions & vendor access — no code | D1–D12 resolved; vendor contracts and API access secured |
| **1** | Commercial core | C1, C2, C3, C4, R3, H5 |
| **2** | Sell — two parallel tracks | *RIVE:* R1, R2, R5, R4, R8 · *CTV:* A1, C5, C6, C7 |
| **3** | Onboard & orchestrate | H1, H4, H2, H3 |
| **4** | CTV pilot instrumentation | A4, A2, A3, M1, M2, M4 |
| **5** | Revenue truth & quality | A6, A7, A5, M3, R6, R7, V1, V2 |
| **6** | Extend | A8, A9, C8, R9, V3 |

Phases overlap. Phase 2's two tracks are independent of each other and can run concurrently with different
people. Phase 4 can begin as soon as D2 resolves and C1/C2 land — it does not wait on Phase 3.

### 7.2 Critical path to a CTV pilot

The module recommends a paid pilot — one client, 60–90 days, fixed scope — before full launch. The shortest
chain that makes a pilot deliverable:

```
D7, D8 ──▶ C1 ──▶ C2 ──┬──▶ C4 ──▶ H1 ──▶ H4        (sell it and onboard it)
                       │
D2 ─────────▶ A4 ──────┼──▶ M1 ──▶ M2 ──▶ M4        (measure it and guarantee it)
                       │
D4 ─────────▶ A2 ──────┤
             A3 ───────┘
```

**The longest chain is revenue truth:** `D5 (SearchLight access) → A6 → M1 → M2 → M4`. The guarantee and the
offer's central claim both terminate here. Every week that D5 is unresolved moves the pilot end date by a
week — which makes it the single highest-leverage decision in this document.

### 7.3 Timeline reality

The CTV module's stated launch date is September 1. As of this document that is immediate, and Phase 0 has
not begun. A full launch on that date is not reachable. A **pilot** is reachable on a realistic schedule if
Phase 0 decisions are taken promptly and the pilot is scoped to one client, one market and one buying
platform — which is precisely the shape the module's own §12 recommends.

---

## 8. Decision register

Eleven decisions gate this scope. The first three block everything.

| # | Decision | Blocks | Owner |
|---|---|---|---|
| **D7** | One CRM for two motions, or two? *(supersedes the earlier D1)* | C1, C2, C4 — and therefore all of WS1 | Leadership |
| **D8** | Prospect as a `clients` row with a lifecycle flag, or a separate object? | C1, and the reuse economics of every downstream item | Engineering + Leadership |
| **D10** | Does the Glide CTV sale use D3, or the productized funnel? | Whether WS2 and WS4's sales surface are both needed. If CTV is sold consultatively, the module's §9 is the wrong spec | Leadership |
| **D2** | Which buying platform first — Vibe, tvScientific or MNTN? | A4, and transitively A2, A5, M1, M2 | Media |
| **D4** | Call-tracking vendor | A2 | Media + Engineering |
| **D5** | SearchLight commercial access | A6 → M1 → M2 → M4. **The longest chain in the scope** | Leadership |
| **D9** | Contract and e-signature vendor | C6, and the shape of C5 and C7 | Operations |
| **D11** | Deck tooling — in-repo generation or external | R6 | Creative |
| **D6** | Client-facing product name | C3, A1 | Brand |
| **D3-brand** | EMM or Glide branding for client-facing surfaces | A1, H1 — the repo is EMM-branded throughout | Brand |
| **D12** | Model provider for research workflows | R4, R5. The repo runs Deepseek and Lovable keys; for research, output quality *is* the product | Engineering |

---

## 9. Prerequisites the client must supply

| Prerequisite | Gates | Notes |
|---|---|---|
| CTV buying platform account and API credentials | A4 | Per D2 |
| Call-tracking vendor account, number pool, API access | A2 | Per D4 |
| SearchLight contract and API access | A6 | Longest chain |
| ServiceTitan access per client | A7, H1 | Collected at intake |
| E-signature vendor account | C6 | Per D9 |
| Upwave contract | A8 | Only if the upsell is sold |
| Stripe products configured in the live account | C3, C4 | Or authority for the build to create them |
| Google Drive credentials in n8n | H5 | Already-documented blocker |
| ElevenLabs / Higgsfield keys, or a descope decision | H5 | Already-documented blocker |
| A named pilot client | Phase 4 | Home services, ServiceTitan-native, per module §4 |

---

## 10. Roles & lanes

From the module's §11 and the playbook's role assignments. The build must respect these boundaries — V3 makes
one of them enforceable in software.

| Party | Owns | Does not own |
|---|---|---|
| **RIVE** | The CTV spot and all creative to S/A/B standard; the D3 point of view, deck and strategic judgment | Media strategy, campaign operation, the CTV client relationship |
| **Glide** | The CTV product — selling it, running it, the client relationship, budget, campaign operation, reporting. The offer is a Glide line and is Glide-branded | Creative quality judgments |
| **GFunnel** | Attribution, automation, dashboards, integrations. Silent, behind the brand | Media strategy, creative judgment beyond operating the systems |

Within the D3 motion: the **Founder / Sales Lead** owns the relationship, the opening frame and the
commercial conversation; the **Brand Manager** owns the account list, CRM hygiene, and the entire close-to-
delivery handoff; the **Strategist** owns research integrity; the **Creative Director** owns creative quality;
**AI** fills templates and never invents format or strategy.

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **SearchLight access is delayed or refused** | The offer's central claim — revenue, not impressions — cannot be substantiated. M1, M2 and M4 all degrade | Resolve D5 in Phase 0. If refused, the fallback is deterministic-only attribution (calls, QR, vanity URLs) with the revenue stage explicitly marked unavailable — and the offer's positioning must change accordingly |
| **Probabilistic attribution is challenged by a client** | Reputational and contractual exposure | A5 and M2 both require modelled contribution to be labelled as modelled. The module's honest-framing language is a build requirement, not a nicety |
| **Two sales motions are both built and neither is used** | Wasted capacity | D10 resolved in Phase 0; if CTV is sold consultatively, descope the productized funnel rather than building both |
| **Prospect model chosen wrongly (D8)** | Expensive rework across every downstream item | Decide before C1 starts; the lifecycle-discriminator approach is reversible into a separate object, not the other way round |
| **Media strategy and creative judgment stay unautomatable** | Named by the module as its principal risk | Out of scope by design. The build supports the judgment (courage score, strategy record, QA gate) without attempting to replace it |
| **The 14-day guarantee is breached at scale** | Direct refund liability | M4 makes the clock visible from day one and H4 parallelises the three fulfillment tracks so the dashboard does not wait on creative |
| **Lovable and direct schema edits diverge** | Type drift, broken builds | Apply schema changes so the generated types file stays authoritative; agree a single change path before Phase 1 |
| **EMM/Glide branding unresolved** | A1 and H1 build the wrong surface | D3-brand in Phase 0 |

---

## 12. Definition of done

A work item is complete when all of the following hold:

1. Its stated acceptance criteria pass against a live environment, not a fixture.
2. Schema changes are reflected in `src/integrations/supabase/types.ts` and the app builds clean.
3. Row-level security is applied on every new table, consistent with the existing workspace and client
   scoping helpers.
4. Any new edge function follows the established pattern — CORS headers, anon versus service-role split,
   explicit auth check.
5. Webhook-driven items are idempotent under replay.
6. Client-facing surfaces respect the branding decision from D3-brand.
7. Anything AI-generated and client-facing passes through the approval framework before release.

The engagement is complete when a pilot client can be sold, onboarded, launched, measured and reported on
end to end — and the fourteen-day guarantee can be evaluated automatically against a live dashboard.

---

## 13. Change control

This scope is derived from two source documents and eleven open decisions. Resolving a decision may add,
remove or reshape work items. Material changes — a new integration, a changed sales motion, a vendor
substitution — are handled as a scope amendment with revised sizing rather than absorbed silently.

The two audit documents remain the evidence base for every claim about current state; if a finding is
contested, the audits cite the file paths.
