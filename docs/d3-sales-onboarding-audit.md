# RIVE D3 Sales Playbook & Onboarding — Repo Audit

**Source:** `DIVIDE_DEVELOP_DISRUPT.docx` — "RIVE D3 — Two-Week Divide Phase Sales Playbook" (Divide → Develop → Disrupt).
**Audited against:** `gfunnel-tech/glide-marketing-hub` @ `claude/glide-business-module-audit-osgl3z`.
**Companion to:** `docs/ctv-module-audit.md`.
**Audit date:** 2026-08-31.

---

## Headline: this is a second, incompatible sales motion

The CTV business module (§9) describes a **productized Glide funnel** — ads → landing page → GHL booking →
HubSpot pipeline → Stripe checkout for setup fee + first month → intake form → n8n/ClickUp fulfillment.
Low-touch, self-serve-shaped, priced on a published tier table.

The D3 playbook describes the **opposite motion**: relationship-led outreach with no packages or pricing
mentioned, a 30-minute mutual-qualification discovery, four days of research, a human strategy session, a
bespoke deck, an internal quality gate, a point-of-view reveal, and only then a commercial conversation —
a standardized retainer *plus* a custom production investment closed on MSA/SOW with a ~30% deposit and a
9–12 month payment schedule.

Both are legitimate; they belong to different wings (Glide performance vs. RIVE brand-first). But they are
**not variants of one pipeline** — different objects, different stages, different money mechanics, different
artifacts. Any CRM decision has to serve both. See decision D7.

**The repo supports neither.** There is no agency-side sales pipeline of any kind. Zero hits for
`prospect`, `proposal` (as an object), `MSA`, `SOW`, `deposit`, `e-signature`, `payment schedule`.

---

## 1. The structural finding: everything is keyed to a client, not a prospect

This is the single constraint that shapes the whole build.

`public.clients.id` is a `number` (SERIAL), and effectively every operational object in the repo hangs off it:
`client_notes` (which is where tasks live, `kind: "note" | "task"`), `client_media_assets`, `client_consents`,
`client_audit_artifacts`, `ai_pending_actions`, `ai_insights`, `leads`, `lead_scores`, `campaigns`,
`client_guarantees`, `portal_users`, `client_invites`.

Every CRM-shaped object in the system models **the client's leads** — `leads`, `lead_scores`, `ghl_contacts`,
`ghl_opportunities`, `ghl_pipelines` — never **the agency's own prospects**. A RIVE prospect on Day 0 is not
a client and has no row anywhere.

Two viable shapes, and this needs deciding before anything else is built (D8):

- **Prospects as `clients` rows in pre-sale statuses.** The `client_status` enum already carries `NEW` and
  `PENDING_APPROVAL`; `client_status_phases` is a configurable phase table with `sort_order` and per-phase
  `webhook_url`. Adding D3 phases lights up tasks, notes, `ai_context`, audit artifacts and the ClickUp list
  binding for free. Cheapest path by a wide margin. Cost: "client" stops meaning "paying client" — reporting,
  billing scans and status crons all need a filter, and `compute_client_status` / `auto_classify_new_clients`
  would need to leave pre-sale rows alone.
- **A separate `prospects` object.** Clean semantics, but every reusable subsystem above is `client_id`-typed
  and would need a parallel path or a polymorphic key.

Recommendation: the phase-based approach, with an explicit `lifecycle` discriminator on `clients` so pre-sale
rows are excluded from billing, KPI rollups and status automation by default.

---

## 2. Day-by-day audit

| Day | What the playbook does | System need | Status | Repo evidence |
|---|---|---|---|---|
| 0 | Target account list: company, decision-maker, relationship owner, warmest path, pipeline stage | Prospect/account object | ❌ Missing | No prospect object; zero `prospect` hits |
| 0 | Enter prospect into CRM; schedule Divide Discovery | Agency pipeline + calendar | ❌ Missing | `Calendar.tsx` renders GHL appointments via `ghl-appointments-sync` — the *client's* calendar, not RIVE's sales calendar |
| 0 | Prepare Founder meeting brief | Pre-meeting brief generation | ⚠️ Partial | `morning-brief`, `client-trend-brief-send`, `useMorningBrief` are a working brief-generation pattern — wrong subject, right machinery |
| 0 | AI fills a predefined prospect research template | Template-driven research | ⚠️ Partial | `client-audit-generate` is the exact pattern (see §3). `operations/Research.tsx` is a stub — three cards marked "Coming Soon", locked |
| 1 | Discovery: 4 fixed question areas | Structured discovery capture | ❌ Missing | Nothing captures structured discovery answers |
| 1 | Creative Courage: 1–5 risk scale + "what would stop you choosing a five?" | Scored qualification field driving downstream creative | ❌ Missing | `lead_score_rule_sets` (versioned weights, `grade_thresholds`, `breakdown`, A–D grades) is a close structural analog — but scores the client's inbound leads, not prospect risk appetite |
| 2–4 | Four intelligence workflows: Competitive, Customer, Revenue, Category — template in, template out | Typed research templates + per-prospect runs | ❌ Missing | Pattern exists (§3); the templates and runs do not |
| 5 | Human strategy session | Decision record | ❌ Missing | — |
| 6–8 | Build the Divide Deck — itself a RIVE product, standardized over time | Deck generation + versioning | ❌ Missing | `buildAuditPdf` / `buildReportPdf` are branded-document precedents, not decks. Gamma is connected as a session tool but is not a repo capability |
| 9 | Internal quality review — 9 gate questions, nothing client-facing ships unapproved | Human approval gate | ⚠️ Partial | `ai_pending_actions` + `ai_action_audit_log` + `PendingActionsPanel` is a real human-in-the-loop gate (see §4). `creative_approvals` is client-facing approval; this gate is internal |
| 10 | Divide Reveal — point-of-view presentation | Presentation delivery | ❌ Missing | — |
| 10 | Commitment question — strategic agreement *before* price | Stage gate separating belief from money | ❌ Missing | — |
| 11–14 | Retainer (standardized) | Recurring subscription billing for RIVE's own revenue | ❌ Missing | Stripe runs the other way: `stripe-client-*` reads the client's revenue, `rebill_*` bills ad spend back. `EarningsForecast` has hardcoded mock retainers |
| 11–14 | Custom production investment: estimate → ~30% deposit → 9–12 month schedule | Quote + deposit + milestone schedule | ❌ Missing | `rebill_invoices` (draft/sent/paid/void) is the nearest invoice object — ad-spend rebilling only |
| 11–14 | MSA, SOW, proposal administration | Contract + e-signature | ❌ Missing | Zero hits across the codebase |
| 11–14 | Brand Manager handoff: stage change, asset collection, scheduling, Develop kickoff | Onboarding handoff | ✅ Strong | See §5 |

---

## 3. The strongest reuse in the repo: `client-audit-generate`

The playbook's AI rule is explicit — *"AI does not start with a blank page. Every AI workflow works inside a
RIVE-created template. AI fills the template. It does not invent the format."*

`supabase/functions/client-audit-generate/index.ts` already implements exactly this shape:

> *"pulls every signal we hold, computes the hard numbers deterministically, has the model write the narrative
> on top of them, renders a branded PDF, and opens assigned tasks for each finding."*

Deterministic compute (`_shared/auditMetrics.ts`) → constrained LLM narrative (`_shared/deepseek.ts`) →
branded PDF (`_shared/auditPdf.ts`) → findings persisted to `client_audit_artifacts` (`findings`, `defects`,
`summary`, `tasks_created`) → tasks opened per finding.

That is template-in / template-out with human-owned structure, already working in production shape. The four
D3 intelligence workflows (S5) should be built on this pattern rather than as fresh AI calls — the difference
is the input (external market research rather than internal ad metrics) and the template registry (S6).

Note: it runs on Deepseek and Lovable AI keys, not Anthropic — worth confirming that's intentional for
research work where output quality is the product.

---

## 4. The AI governance the playbook demands already exists

*"Nothing client-facing leaves RIVE without human approval. No AI slop. No unchecked AI output."*

The repo has an implemented human-in-the-loop framework:

- `ai_pending_actions` — `proposed_by`, `reasoning`, `payload`, `approved_by`, `approved_at`, `status`, `result`
- `ai_action_audit_log` — actor kind, previous/new status, full payload and reasoning trail
- `client_ai_rules` — natural-language rules parsed to `parsed_spec`, per client
- UI: `PendingActionsPanel`, `AiRulesPanel`, `AiAuditLogPanel`

The Day 9 quality gate (S9) should extend this rather than introduce a second approval concept. The nine
review questions become gate criteria on a pending action whose payload is the deck.

---

## 5. Onboarding: the genuinely strong part

The Brand Manager's handoff list — CRM stage change, asset collection, scheduling, client communication,
Develop kickoff, internal handoff — is the best-served part of the whole playbook.

Already built:

- **Client activation.** `client_invites` + `redeem_client_invite` + `portal-provision` + `PortalAcceptInvite`
  — a working invite → portal-account → seeded-onboarding-row flow.
- **Asset collection.** `OnboardingWizard` with consent / info / images / voice / files steps, `client_media_assets`,
  a private `client-onboarding` bucket with per-client RLS, `client_consents` as an append-only consent log,
  and Drive mirroring via `onboarding-drive-sync` → n8n.
- **Stage machine.** `clients.status` (13 states), `client_status_phases` with per-phase `webhook_url`,
  `compute_client_status`, and the `Onboarding.tsx` kanban.
- **Continuous experience.** The portal (performance, leads, reports, approvals, creative, documents, billing,
  support) means the "prospect should never feel the handoff" requirement is well served once they convert.

The gap is contents, not machinery: the wizard captures mortgage-brand assets (there is an **NMLS #** field)
and voice-clone consent for AI avatar generation. Neither RIVE production onboarding nor CTV onboarding needs
that. This is the same finding as CTV gap G3 — one wizard, two wrong-shaped step sets, one fix.

Two blockers already documented in the repo's own `AUDIT.md` remain open and affect this directly:
`N8N_ONBOARDING_DRIVE_WEBHOOK` is unset (Drive sync writes `drive_sync_status='failed'`), and the
ElevenLabs/Higgsfield keys are absent so voice and image assets stall at `ready_for_processing`.

---

## 6. What we still need created

### P0 — nothing about the D3 motion can be run in-system without these

| # | Build | Note |
|---|---|---|
| S1 | **Prospect/account object** — company, decision-maker, relationship owner, warmest path, stage. | Blocked on D8. This is also CTV gap G12 — one object serves both motions. |
| S2 | **D3 pipeline stage machine** — Day 0 → Day 14 with real gates: discovery held, intelligence complete, QA passed, reveal held, commitment yes, closed. | Extend `client_status_phases`; per-phase `webhook_url` already exists for n8n triggers. |
| S3 | **Structured discovery capture** — the four areas and their fixed questions, persisted per prospect, feeding the research runs. | The questions are the schema; they are fully specified in the playbook. |
| S4 | **Creative Courage score** — 1–5 plus the blocker reasons from the follow-up question, as a first-class field that downstream creative and QA check against. | The playbook uses it as a gate twice ("does the recommendation match the client's stated risk appetite?"). |
| S10 | **Proposal / quote object** — estimated production investment, deposit %, schedule terms. | — |
| S11 | **MSA + SOW + e-signature.** | Vendor decision D9. Zero foundation. |
| S12 | **Deposit + payment-schedule billing** — ~30% up front, remainder across 9–12 months. | Milestone/schedule billing; `rebill_invoices` statuses are a usable precedent, the scheduling is not. |
| S13 | **Retainer subscription billing** — standardized, recurring, RIVE's own revenue. | Requires the same net-new Stripe direction as CTV gap G2. Build once, serve both. |

### P1 — required to run the process at quality and repeatably

| # | Build | Note |
|---|---|---|
| S5 | **Four intelligence workflows** — Competitive, Customer, Revenue, Category, each filling predefined fields. | Build on the `client-audit-generate` pattern (§3). Largest single piece of work here. |
| S6 | **Research template registry** — typed, versioned field definitions that the workflows fill. | This *is* the "template in, template out" rule made enforceable rather than aspirational. |
| S7 | **Prospect research brief** — the Day 0 pre-meeting brief for the Founder. | Reuse the brief-generation pattern from `morning-brief`. |
| S8 | **Divide Deck generation + versioning** — the deck is a product that should get better each engagement. | Decision D11 on tooling. Versioning is what makes "increasingly standardized" real. |
| S9 | **Internal QA gate** — the nine review questions as a blocking checklist before anything client-facing ships. | Extend `ai_pending_actions` (§4) rather than adding a second approval concept. |
| S14 | **Close → handoff checklist** — the Brand Manager's ten responsibilities as a tracked, assignable sequence. | `client_notes` tasks with `task_routing_rules` and the ClickUp binding already support this. |
| O1 | **Re-shape the onboarding wizard** — replace the mortgage/voice-clone step set; add a RIVE production step set and a CTV step set. | Same build as CTV gap G3. |
| O2 | **Develop kickoff transition** — the phase change from closed-won into production. | Rides S2. |

### P2

| # | Build |
|---|---|
| S15 | **Decision record for the Day 5 strategy session** — what the team concluded and why, so the deck's point of view is traceable. |
| S16 | **Deck outcome tracking** — which territories were proposed, which were accepted, feeding the standardization loop. |

---

## 7. Decisions that block the build

| # | Decision | Why it blocks |
|---|---|---|
| **D7** | **One CRM for two motions, or two?** *(supersedes D1)* | D1 asked HubSpot vs GHL for the CTV funnel. The real question is now larger: a productized checkout funnel and a 14-day consultative enterprise sale have different stages, objects and money mechanics. Decide whether one pipeline with two record types serves both, or the wings run separately. Everything in S1/S2/G12 depends on this. |
| **D8** | **Prospect as a `clients` row, or a new object?** | §1. Determines whether tasks, notes, AI context, artifacts and ClickUp bindings come free or need parallel plumbing. |
| **D9** | **Contract / e-signature vendor.** | S11 has zero foundation; the choice also shapes S10 and S12. |
| **D10** | **Does the Glide CTV sale use D3, or the productized funnel?** | The two documents describe incompatible motions. If CTV is meant to be sold consultatively, the CTV module's §9 sales system is the wrong spec. If they are deliberately separate, that should be stated — it doubles the sales-system build. |
| **D11** | **Deck tooling** — in-repo generation on the existing PDF pattern, or an external tool. | S8. |

---

## 8. Where the two audits converge

Four builds serve both wings. They should be built once, not twice.

| Shared build | CTV id | D3 id |
|---|---|---|
| Agency-side prospect object and pipeline | G12 | S1 + S2 |
| Stripe in the *selling* direction (checkout, subscriptions, invoicing) | G2 | S12 + S13 |
| Onboarding wizard re-shaped per offer type | G3 | O1 |
| Close → fulfillment orchestration and handoff | G13 | S14 + O2 |

Combined open build list across both documents: **18 CTV items + 16 D3/onboarding items, less 4 shared = 30 distinct builds**, against 11 blocking decisions.
