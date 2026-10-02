# Call Centre Functional Product Audit — Phase 3: Functional Completeness & Gap Register

**Status:** Complete. Synthesis document only — no code, schema, UI, API, or configuration was modified.
**Predecessors:** `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_1_SCREEN_INVENTORY.md`, `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_2_DATA_EXPOSURE.md`
**Date:** 2026-10-02

---

## 1. Executive functional picture

The Call Centre product has a large, genuinely working core: Dashboard, Live View, Call Logs/Detail, Chat Logs/Detail, Customers/Customer Detail, Campaigns (List/Create/Detail/Configuration/History/Target Actions/Add Targets), Interaction Quality, WhatsApp Hub/Authenticate, Formatting Hub, AI Agents/Agent Detail, and Analytics/Ratio Explorer are all backed by real data paths — either the external Voice/Chat Partner APIs or the `call_center` Supabase schema — with no fabricated application behavior found in any of them.

A second, smaller group of screens — NPS Campaigns, Orchestrator (all three views), Reports, and User Management — are placeholder shells with no genuine, verified backend of any kind in the current Call Centre application. Settings is split: Appearance is real and persisted; the other four tabs are inert.

**Correction note (project-owner clarification, 2026-10-03):** this document's predecessor characterized historical `orchestrator_*` and `user_roles` definitions, observed only in generated TypeScript types from a legacy, separate WhatsApp Supabase project, as Call Centre backend capability ("backend exists, frontend path missing"). The project owner has clarified that this legacy project is an older, limited integration predating the current Call Centre architecture, used today only for the legacy WhatsApp/Formatting integration, and is not a second general-purpose Call Centre backend. Those historical definitions were never verified via live database access and their ownership/relevance to the current Call Centre application is unconfirmed. They are therefore excluded from functional capability classification. Orchestrator and User Management are both corrected to **PLACEHOLDER / NOT IMPLEMENTED** throughout this document. The legacy project's actually-verified WhatsApp/Formatting findings (session_id linkage, auth gate, Edge Functions, static status badge) are unaffected by this correction and remain as originally audited.

The most consequential finding across both prior phases is that **this product's primary completeness gap is not missing backend capability — it is backend capability that already exists and already reaches (or could reach) the frontend, but is not represented on screen.** Customer360 in particular already has a working Activity/Diary API, an identity-merge capability, and several aggregate fields (channels, auth summary, latest agent) that are fetched into the page's own data object today and simply not rendered. Campaigns similarly carry configuration-version history, legacy result rules, and a direct customer-ID linkage that reach the frontend unused.

A smaller number of gaps are genuine upstream/backend limitations (no Supabase-backed voice-call table exists at all; the external Voice/Chat APIs lack several fields and all server-side filters), and a number of apparent gaps are explicitly, deliberately deferred in code or documentation (duplicate `analysis.*` fields, campaign follow-up auto-execution, Campaign Analytics' lack of role scoping) rather than oversights.

This document inventories all of that precisely, without deciding what (if anything) should be built next.

---

## 2. Method and gap taxonomy

This phase is a synthesis of Phase 1 (what each screen is and does) and Phase 2 (what backend/API capability exists and how much reaches each screen). No new broad repository audit was performed; narrow verification was used only where needed to resolve a Phase 1/Phase 2 contradiction — none was found requiring correction beyond what Phase 2 had already self-corrected (the WhatsApp login-link origin, Phase 1 Q21).

### Gap taxonomy

| Code | Type | Pattern |
|---|---|---|
| A | UI EXPOSURE GAP | Data reaches the frontend object but is not rendered |
| B | FRONTEND INTEGRATION GAP | Backend/API capability exists; no hook/component (or no API route) consumes it |
| C | APPLICATION DATA-PATH GAP | Source data exists but a mapper/materializer drops or nulls it before the screen can use it |
| D | BACKEND / DATA CAPABILITY GAP | The capability genuinely does not exist at any layer, and is relevant to the screen's existing purpose |
| E | UI WITHOUT BACKEND | The screen presents a state/action with no real backing implementation |
| F | FUNCTIONAL CONSISTENCY GAP | The same concept is represented differently across screens without a data-driven reason |
| G | INTENTIONALLY DEFERRED | Explicitly, deliberately deferred in code/docs — not unfinished work |
| H | PLACEHOLDER / UNIMPLEMENTED FUNCTION | The screen is substantially a shell; its nominal function isn't implemented |
| I | NO MATERIAL GAP | Purpose is substantially supported |

### Completeness states

`COMPLETE FOR CURRENT PURPOSE` · `SUBSTANTIALLY COMPLETE — EXPOSURE GAPS` · `PARTIALLY COMPLETE — INTEGRATION/DATA GAPS` · `LIMITED BY UPSTREAM CAPABILITY` · `PLACEHOLDER / NOT IMPLEMENTED` · `INTENTIONALLY DEFERRED`

No numerical scores or priority levels are used anywhere in this document, per the audit's explicit instruction.

---

## 3. Master Functional Completeness Register

| Functional Area | Screen / Function | Overall Completeness | Material Gap Types | Key Existing Capability Not Represented | Genuine Missing Dependency |
|---|---|---|---|---|---|
| Govern | Login / ProtectedRoute | PLACEHOLDER / NOT IMPLEMENTED | H | — | Real credential/session backend (Supabase `auth.*` provisioned, unused) |
| Observe | Dashboard | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Observe | Live View | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, F | Shared `InteractionDetailDialog` fields (FCR, Authenticated, escalation trigger, campaign name, recording, searchable transcript) | — |
| Control | Initiate Call | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A | `call_sid` → Call Detail correlation | — |
| Control | Chat Console | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Observe | Call Logs | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, C | `actual_outcome_code/name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context` (dropped by mapper) | Server-side filters (agent/FCR/auth/campaign); full-history export; per-turn sentiment |
| Observe | Call Detail | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, C | Same mapper-dropped fields as Call Logs | Per-turn sentiment/confidence on transcript |
| Observe | Chat Logs | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A | `campaign_id`/`campaign_target_id`, `is_trial`, navigable `customer_id` | — |
| Observe | Chat Detail | PARTIALLY COMPLETE — INTEGRATION/DATA GAPS | C | — | Per-turn metadata structurally undefined on the live (dominant) path |
| Observe | Customers (list) | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Observe | Customer Detail / Customer360 | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, B, C | `channels`, `authSummary`, `latestAgentId/DisplayName`, `recordingAvailable`/`escalationTrigger`, Activity/Diary, Campaign-target reverse linkage | — |
| Operationalize | Outbound Campaigns | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Operationalize | Create Campaign | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Operationalize | Campaign Detail | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, B, F | Legacy `campaign_result_rules`, configuration-version diff, Customer360 target linkage | — |
| Operationalize | Campaign Configuration | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Operationalize | Campaign History | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A | Full configuration-version snapshot diff | — |
| Operationalize | Target Actions | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Operationalize | Add Targets | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Operationalize | NPS Campaigns | PLACEHOLDER / NOT IMPLEMENTED | H | — | No backend of any kind (no channel column, no NPS classification codes) |
| Integrate | WhatsApp Hub | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A, E | `session_id`-based conversation grouping | — (status badge is E, not a capability gap) |
| Integrate | WhatsApp Authenticate | COMPLETE FOR CURRENT PURPOSE | I | — | — |
| Integrate | Formatting Hub | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A | `session_id` link back to originating WhatsApp conversation | — |
| Integrate | Orchestrator (all 3 views) | PLACEHOLDER / NOT IMPLEMENTED | H | — | No verified backing tables in the current Call Centre application (historical, unverified `orchestrator_*` definitions observed only in a legacy WhatsApp Supabase project's generated types are not established Call Centre capability — see §14) |
| Improve | Interaction Quality (QA Review) | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS / LIMITED BY UPSTREAM | D | — | Voice per-call latency; chat sentiment/FCR (channel-structural) |
| Improve | AI Agents / Agent Detail | SUBSTANTIALLY COMPLETE — EXPOSURE GAPS | A | Full agent `contract` object (shown elsewhere, not here) | — |
| Measure | Analytics | COMPLETE FOR CURRENT PURPOSE (voice-aggregate scope) / INTENTIONALLY DEFERRED (role scoping) | G | — | No Supabase-side scoped aggregate for Campaign Analytics |
| Measure | Ratios Catalogue / Ratio Explorer | PARTIALLY COMPLETE — INTEGRATION/DATA GAPS | A, D | Driver decomposition (1 of 30 ratios) | 16 of 30 ratios have no backend data at all; 6 await a future telemetry/Trace API |
| Measure | Reports | PLACEHOLDER / NOT IMPLEMENTED | H | — | No report-generation infrastructure |
| Govern | User Management | PLACEHOLDER / NOT IMPLEMENTED | H | — | No verified general role/permission table in the current Call Centre application (a `user_roles`-named table observed only in a legacy WhatsApp Supabase project's generated types is not established Call Centre capability — see §13) |
| Govern | Settings | PLACEHOLDER / NOT IMPLEMENTED (4 of 5 tabs) / COMPLETE (Appearance) | H | — | No settings/config table anywhere |
| Govern | Authentication (backend) | LIMITED BY UPSTREAM CAPABILITY — see Login | H | — | Supabase `auth.*` fully provisioned, unused |

---

## 4. Customer360

Customer360 was the original motivation for this audit. This section is written to be understandable without requiring familiarity with the database.

### Already visible
CIF/customer reference, phone (masked), first/last seen, interaction counts (total/inbound/outbound), escalation count, latest intent/outcome, full Interaction History, Campaign Participation, and Call/Chat drill-down into the shared detail dialog. **These are genuinely real and correctly sourced.**

### Existing and functionally meaningful but not visible
- **`channels`, `authSummary` (everAuthenticated/lastAuthenticatedAt), `latestAgentId`/`latestAgentDisplayName`** — all three are real columns on the `customers` aggregate, correctly mapped into the API response, fetched in full by the page's own data hook, and simply never rendered. These describe the customer directly (which channels they've used, whether they've ever authenticated, who last handled them) and are judged **functionally meaningful screen gaps** (Gap type A) — they are facts about the customer the screen's own stated purpose ("single-customer 360° view") would reasonably include.
- **`recordingAvailable`/`escalationTrigger` per interaction row** — same judgment: these are per-row facts the Interaction History table's own purpose already covers for other fields (outcome, duration) but omits for these two. **Functionally meaningful gap** (Gap type A).
- **Activity/Diary** — a complete, working create+list API (`?action=activities`) against a real `customer_activities` table (note/instruction/task/reminder/appointment, with campaign/interaction cross-links) with zero frontend consumer anywhere. This is **judged a functionally meaningful gap** (Gap type B) because the capability directly matches a normal Customer360 purpose (recording what's been done/is pending for a customer), not an internal system concern.
- **Campaign target → Customer360 reverse linkage** — `campaign_targets.customer_id` is real, non-nullable, and already present on every target row the frontend receives; Campaign Detail does not use it to link back to the customer. **Functionally meaningful gap** (Gap type A, on the Campaign Detail side of the relationship).

### Existing but data-path incomplete
**Chat → Customer360 materialization.** `chatInteractionSource.ts`'s row mapper hardcodes `campaignName: null, outcome: null, sentimentScore: null, escalationTrigger: null, durationSeconds: null, direction: null` for every chat-sourced interaction that reaches Customer360's Interaction History — regardless of whether the source `chat_sessions` row actually has these values populated. This is an **Application Data-Path Gap (Gap type C)**: chat-channel interactions inside Customer360 are structurally incapable of showing these fields today, which is a materially different situation from "the field is simply unrendered."

### Backend-only operational capability — not a Customer Detail requirement
Two Phase 2 findings are internal system-maintenance capabilities, not customer-facing information, and are classified accordingly rather than being counted as screen gaps:
- **`customer_aggregation_state`** (per-source reconciliation/backfill watermark) — operational job-coordination state, not a fact about a customer. **Backend/system capability — no demonstrated UI requirement.**
- **`customer_merge_log` + merge RPC** (identity-merge machinery, never exercised) — an administrative data-hygiene capability, not part of the stated "single-customer 360° view" purpose. **Backend/system capability — no demonstrated UI requirement.**

### Other items
- Email as a contact-point type is structurally possible but genuinely unpopulated anywhere (**Gap type D does not apply** — nothing in the current identity-resolution flow produces this data, so there is no existing email data being withheld; this is **Existing capability — no demonstrated screen requirement**, since the data doesn't exist to show).
- `customer_external_identities` consumer path is unresolved evidence (see §18), not classified as a gap.

### Overall assessment
The existing Customer360 concept — resolve a customer, show identity/contact, show interaction history, show campaign participation, drill into Call/Chat detail — is **substantially complete and functioning as designed**. Its gap is not missing backend work: nearly every meaningful gap found is capability that is already built and already reaches (or is one join away from reaching) the screen's own data object, plus one data-path defect specific to the chat-materialization path. **Overall: SUBSTANTIALLY COMPLETE — EXPOSURE GAPS**, with one **APPLICATION DATA-PATH GAP** (chat materialization) and two items correctly excluded as backend-only operational concerns.

---

## 5. Calls

### Screen: Call Logs

**Existing purpose:** Review completed voice interactions in a searchable, paginated table.
**What works today:** Search, paginate, filter (client-side on the fetched page), export the current page, open Call Detail — all against the live external Voice API.
**Existing supporting architecture:** `useCallData` → `GET /api/calls/data` → external Voice Partner API `/api/v1/call-data`. No Supabase table backs voice calls at all (confirmed).
**Functionally meaningful unexposed capability:**
- `actual_outcome_code`/`actual_outcome_name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context` — present on the DTO, dropped by `callsMapper.ts` before the `Interaction` type is built. Layer reached: BFF response. Exposure stops: application mapper. Gap type: **C**.
**Genuine missing capability:**
- Server-side filtering on agent/FCR/authenticated/campaign — confirmed absent from the upstream API itself, not an unused frontend parameter. Gap type: **D**.
- A true full-history export (only page-by-page aggregation is possible today). Gap type: **D**.
**Intentionally deferred:** None specific to Call Logs beyond the shared `analysis.*` finding (see Call Detail).
**Consistency / relationship findings:** None beyond the shared dialog's own findings below.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS (mapper-dropped fields) combined with LIMITED BY UPSTREAM CAPABILITY (filters/export/full-history).
**Evidence:** Phase 2 §5; `callsMapper.ts`; live `information_schema` confirmation of zero voice-call Supabase tables.

### Screen: Call Detail

**Existing purpose:** Investigate one call's full record.
**What works today:** Identity, agent, duration, FCR, intent confidence, sentiment, summary, recording playback, searchable transcript, live transcript refresh — all real.
**Existing supporting architecture:** Same Voice API path as Call Logs, plus `GET /api/calls/session/[id]` for live transcript.
**Functionally meaningful unexposed capability:** Same mapper-dropped fields as Call Logs (shared `Interaction` type). Gap type: **C**.
**Genuine missing capability:** The session-transcript endpoint has no per-turn sentiment/confidence fields at all — a genuine upstream schema gap, not a mapping failure. Gap type: **D**.
**Intentionally deferred:** `call.analysis.*` is a confirmed, proven duplicate of other already-shown fields (verified via live-sample comparison) and was deliberately dropped from this shared dialog. Gap type: **G**.
**Consistency / relationship findings:** Live View's own hand-rolled detail dialog still renders `call.analysis.*` despite this dialog having proven it duplicates other fields — see §15 (Cross-screen Consistency Register).
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 2 §5.

---

## 6. Chat

### Screen: Chat Logs

**Existing purpose:** Browse chat session history in a searchable, paginated table.
**What works today:** Search (page-scoped), server-side agent/status filtering, page-only auth filtering, pagination, open Chat Detail.
**Existing supporting architecture:** `GET /api/chat/logs` → live `/api/v1/chat/sessions`, with a Supabase fallback.
**Functionally meaningful unexposed capability:**
- `chat_sessions.campaign_id`/`campaign_target_id` — real, populated, unread by the API route. Gap type: **B** (the route itself doesn't surface it, so no frontend object ever receives it).
- `is_trial` — real and functional internally, invisible in the UI. Gap type: **A**.
- `customer_id` used only to derive a text label, never exposed as a navigable link. Gap type: **A**.
**Genuine missing capability:** None found beyond what's listed as unexposed above.
**Intentionally deferred:** None found specific to this screen.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 2 §6.

### Screen: Chat Detail

**Existing purpose:** Inspect one session's identity and full transcript.
**What works today:** Identity, status, agent, span, message count, auth, intent confidence, latency, per-turn transcript are all real and rendered.
**Functionally meaningful unexposed capability:** None beyond Chat Logs' findings (shared data source).
**Existing but data-path incomplete:** Per-turn AI metadata (`dataSource`/`confidence`/etc.) is wired in the UI but structurally `undefined` whenever the live (dominant) data path succeeds — it is only populated via the local-fallback branch for turns sent through this app's own Chat Console. Gap type: **C**.
**Consistency / relationship findings:** See §4 — chat-sourced rows lose campaign/outcome/sentiment/escalation/duration/direction specifically once materialized into Customer360, a different (and more severe) version of this same "metadata available in the source, lost downstream" pattern.
**Overall completeness:** PARTIALLY COMPLETE — INTEGRATION/DATA GAPS.
**Evidence:** Phase 2 §6.

---

## 7. Campaigns

Campaigns carry the most implemented architecture in the product. Phase 3 evaluates completeness relative to each existing function's own stated purpose, not relative to total database content.

### Screen: Campaign Detail

**Existing purpose:** Operate one campaign (lifecycle control, target oversight).
**What works today:** Start/Pause/Resume/Stop/Retry, stats, targets table, lifecycle state — all real and backed by Supabase RPCs.
**Functionally meaningful unexposed capability:**
- `campaign_targets.customer_id` is real and already present on every target row; no interaction on this screen exposes the corresponding customer relationship. Gap type: **A**.
- Legacy `campaign_result_rules` (10 rows across 5 campaigns) are fetched into component state and never read. Judged functionally meaningful since they represent real historical campaign configuration a campaign operator might reasonably want visible. Gap type: **A**.
- `campaign_configuration_versions`' full snapshot chain (including `previous_version_id`) is fetched but only the active version's `id` is used — no version-by-version diff is surfaced, even though Campaign History already shows a human-readable event log for the same underlying history. Gap type: **A**.
**Genuine missing capability:** None found.
**Intentionally deferred:**
- **`targetCount` join discrepancy** — root-caused precisely (the list/get RPCs count without the join that `list_targets` uses); self-disclosed in code; 0 currently-orphaned targets in the live environment. This is a known, named, currently-harmless mechanism, not an accidental missing feature. Gap type: **G**.
- **`campaign_followups` automatic execution** — a complete write pipe (RPC + repo + service + hook) exists with zero callers; explicitly and previously documented as an intentional scope decision, not an oversight. Gap type: **G**.
**Consistency / relationship findings:** See §15 — the Campaign ↔ Customer360 relationship is the same pattern already flagged in §4.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 2 §7.

### Other Campaign functions (Outbound Campaigns, Create Campaign, Campaign Configuration, Target Actions, Add Targets)
All assessed COMPLETE FOR CURRENT PURPOSE — no material gap found against their stated purpose in either phase. Structured Agent Outcomes are fully represented in Agent Result (`classifyStructuredOutputs` loops every real key), confirming this specific capability is not a gap.

---

## 8. Dashboard / Live View / Initiate Call

### Screen: Dashboard
**Existing purpose:** Cross-agent operational overview.
**What works today:** Every tile/list traces to a real API call; no mock data. Two 5-row caps are a documented, deliberate workaround for an upstream `page_size` reliability issue.
**Overall completeness:** COMPLETE FOR CURRENT PURPOSE.
**Evidence:** Phase 1 §4.2.

### Screen: Live View
**Existing purpose:** Real-time console of every currently-active call.
**Functionally meaningful unexposed capability:** The screen's own hand-rolled "View Details" dialog is missing fields the shared `InteractionDetailDialog` already provides elsewhere in the product — FCR, Authenticated, Escalation trigger, Campaign name, Call Summary/tags, Recording playback, searchable transcript, and the 60s-cap live-polling refresh UI. Gap type: **A**, and also registered as a **Functional Consistency Gap (F)** in §15 since the same underlying interaction data is represented more fully elsewhere in the product.
**Intentionally deferred:** `call.analysis.*` in this dialog is the same confirmed-duplicate field already dropped from the shared dialog (§5) — carried here as a consistency finding rather than a new deferral, since Live View's own dialog was not built with the same self-disclosed justification.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 1 §4.3; Phase 2 §8.

### Screen: Initiate Call
**Existing purpose:** Manually place one outbound voice call outside any campaign.
**What works today:** Genuinely dials via the real external Voice API, including a specific fix for a documented upstream 200-on-failure gotcha.
**Functionally meaningful unexposed capability:** `call_sid` → Call Detail correlation — the identical `call_sid === call_id` mechanism is already proven and used elsewhere (Campaign reconciliation), but this screen builds no link to it, so a user who just placed a call has no path from this screen into that call's eventual detail record. Gap type: **A**.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 1 §4.4; Phase 2 §8.

---

## 9. Interaction Quality

**Existing purpose:** Cross-channel, read-only review of real interaction signals (outcome, FCR, escalation, intent, sentiment, authentication, duration/latency) with search/filter/group and Call/Chat drill-down.

**What works today:** All of the above, genuinely, sourced from the same live APIs as Call Logs/Chat Logs, plus the real classification hierarchy for grouping.

**Genuine missing capability (relevant to the current screen's own stated scope):**
- Voice per-call latency — no confirmed source exists; the screen explicitly renders `—` rather than fabricating a value. Gap type: **D**.
- Chat sentiment/FCR — the Chat API itself doesn't return these fields; a channel-structural limitation, not an app gap. Gap type: **D**.

**Not a gap of the current screen:** The current screen does not claim to provide a composite quality score, reviewer workflow, or the prospective Conversation Quality dimensions (Context Continuity, Follow-up Understanding, etc.) — none of these are implemented anywhere, but since the current screen never represents itself as providing them, their absence is **not registered as a gap of this screen**. The composite-score/reviewer-workflow absence is separately **Intentionally Deferred** (Gap type **G**) — the screen was previously rebuilt specifically to remove a prior fabricated score, an explicit, documented decision.

**Prospective architecture (noted, not a current-screen gap):** `interaction_events` exists as a real, empty table with a full repository layer and zero producer or consumer anywhere in the application — a genuine piece of built-but-unused infrastructure, relevant to any future Conversation Quality work but not to the current screen's stated purpose.

**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS for the current screen's own scope, combined with LIMITED BY UPSTREAM CAPABILITY for latency/chat-FCR specifically.
**Evidence:** Phase 2 §9.

---

## 10. Analytics / Ratios

### Existing live metrics
Analytics Overview/Voice's global aggregate is a direct, unmodified proxy of the external Partner API — genuinely live, with zero Supabase involvement (correctly so, since no Supabase aggregate could exist for this data). COMPLETE FOR CURRENT PURPOSE.

### Ratios Catalogue / Explorer shell
The shell itself (catalogue browse, drill-down, breakdown selection, comparison, paging) works correctly and drill-through genuinely opens the shared Call Detail dialog. One consistency issue: `callPopulationProvider.ts` hardcodes `channel: 'voice'`, so drill-through is voice-only in practice despite the DTO type supporting chat — registered in §15 as a Functional Consistency Gap.

### Implemented ratios (5 of 30)
`fcr`, `escalation_rate`, `aht`, `resolution_rate`, `successful_resolution_time` — genuinely computed from real data. COMPLETE FOR CURRENT PURPOSE at the individual-ratio level.

### Partially implemented ratios (3 of 30)
Real underlying field exists, but eligibility logic is incomplete. PARTIALLY COMPLETE — INTEGRATION/DATA GAPS, Gap type **C**.

### Backend-gap ratios (16 of 30)
No underlying data exists for these at any layer. Gap type **D** — genuinely missing, not an oversight, since the registry itself documents them as unimplemented definitions.

### Telemetry-dependent ratios (6 of 30)
Explicitly deferred pending a future Interaction Trace API, cited to a named design document. Gap type **G** — Intentionally Deferred, not a current gap.

### Driver decomposition
Exists for exactly 1 of 30 ratios (`escalation_rate`). The remaining 29 ratios have no driver breakdown. Since driver decomposition is not uniformly claimed as part of every ratio's stated function, this is recorded as a capability gap specific to ratios where decomposition would be materially useful, rather than a blanket finding.

### Overall assessment
Ratio Explorer is **neither globally complete nor globally incomplete** — it is PARTIALLY COMPLETE — INTEGRATION/DATA GAPS as a whole, composed of a working shell, a working subset of ratios, a partial subset, a genuinely-not-yet-possible subset, and an explicitly-deferred subset. These must be read as four separate functional layers, not collapsed into one verdict.
**Evidence:** Phase 2 §10.

---

## 11. AI Agents

**Existing purpose:** View the live agent roster and each agent's operational profile.
**What works today:** Direction, usage counts, business/quality/performance metrics, recent interactions, and Call/Chat drill-down are all genuinely live.
**Functionally meaningful unexposed capability:** Agent Detail's own `contract` object (status, description, expected input fields, expected outcomes, output fields) is fetched with real, populated data — e.g. 3 required + 5 optional fields and 10 real outcome codes for one sampled agent — but Agent Detail renders only a 1-line "Contract source: partner_api" label. The same data IS fully rendered elsewhere (Create Campaign, Campaign Configuration), making this both a **UI Exposure Gap (A)** on this screen and a candidate consistency finding (§15), since the same contract data is shown richly in one place and minimally in another.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 2 §11.

---

## 12. WhatsApp / Formatting

### Screen: WhatsApp Hub
**Existing purpose:** Live two-way WhatsApp messaging console.
**What works today:** Bidirectional messaging, Realtime updates, and the authentication gate (password/OTP across 4 Edge Functions) are all genuinely live.
**Functionally meaningful unexposed capability:** `whatsapp_messages.session_id` is real and populated, enabling conversation/thread grouping; the UI renders all messages as one flat stream regardless of session. Gap type: **A**.
**UI without backend:** The "Connected to Sandbox" status badge is static JSX with no health-check or connection-status data source anywhere in the schema. Gap type: **E**.
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS, with one discrete UI-WITHOUT-BACKEND element.

### Screen: Formatting Hub
**Existing purpose:** Diagnostic log of the WhatsApp response-formatting pipeline.
**What works today:** Strategy (LOCAL/AI/DISABLED), number, session, formatted/original text — all real and data-driven.
**Functionally meaningful unexposed capability:** `vapi_response_logs.session_id` uses the identical value as the originating WhatsApp session — a real, confirmed shared join key — but no click-through exists from a formatting-log row back to its WhatsApp conversation. Gap type: **A**. This is also the clearest confirmed cross-screen relationship gap in the product (§15).
**Overall completeness:** SUBSTANTIALLY COMPLETE — EXPOSURE GAPS.
**Evidence:** Phase 2 §12; resolves Phase 1 Q21 (login link is generated in-repo, see Phase 2 §12 — this is a correction of a Phase 1 assumption, not a gap).

---

## 13. Authentication / User Management / Settings

### Screen: Login / Authentication
**Existing purpose:** Sign in; gate protected routes.
**What works today:** The routing/redirect flow works end-to-end.
**Genuine missing capability:** No real credential verification exists — the password check is a single hardcoded literal compared client-side; session state is an unverified `localStorage` blob. Supabase's `auth.*` schema (16 tables, RLS-enabled) is fully provisioned but has 0 rows and is completely bypassed. Gap type: **H** (the screen's actual function — real authentication — is not implemented), with the architectural note that **BACKEND EXISTS — FRONTEND PATH MISSING** at the Supabase layer specifically.
**Overall completeness:** PLACEHOLDER / NOT IMPLEMENTED for the authentication function itself.

### Screen: User Management
**Existing purpose:** Administer users/roles.
**What works today:** Nothing functional — 2 hardcoded users, a hardcoded permission matrix, inert buttons.
**Architectural note:** No general role/permission table exists in the main project's `call_center` schema (only a narrow, Customer360-category-scoped `role_customer360_access`, which must not be represented as a general RBAC backend). A `user_roles`-named table with `has_role`/`has_permission` RPCs was observed only in generated TypeScript types from a legacy, separate WhatsApp Supabase project — an older, limited integration predating the current Call Centre architecture, used today only for the legacy WhatsApp/Formatting integration. This observation was never verified via live database access; its live existence, ownership, and relevance to the current Call Centre application are unconfirmed, so it is **not treated as existing Call Centre User Management/RBAC capability**.
**Overall completeness:** PLACEHOLDER / NOT IMPLEMENTED. Gap type: **H**. No verified general Call Centre User Management/RBAC backend exists in the current application architecture.

### Screen: Settings
**Existing purpose:** App/account configuration across 5 tabs.
**What works today:** The Appearance tab (theme toggle) is real and persisted via `ThemeContext`/localStorage.
**What does not work:** The other 4 tabs are static fields; Save is a no-op; no settings/config table exists anywhere in either Supabase project.
**Overall completeness:** Mixed — Appearance is COMPLETE FOR CURRENT PURPOSE; the remaining 4 tabs are PLACEHOLDER / NOT IMPLEMENTED (Gap type **H**).

---

## 14. NPS / Orchestrator / Reports

| Screen | Completeness | Architectural note |
|---|---|---|
| NPS Campaigns | PLACEHOLDER / NOT IMPLEMENTED (H) | No channel column on `campaigns`, no NPS classification codes, anywhere. The screen's own banner self-discloses non-persistence. |
| Orchestrator — Flow Library | PLACEHOLDER / NOT IMPLEMENTED (H) | Hardcoded sample flow cards. No verified backend integration exists for the current Call Centre Orchestrator. |
| Orchestrator — Flow Editor | PLACEHOLDER / NOT IMPLEMENTED (H) | Canvas state is entirely local component state; Save/Validate/Simulate are all non-functional despite appearing interactive. |
| Orchestrator — Integrations | PLACEHOLDER / NOT IMPLEMENTED (H) | Hardcoded inline array; buttons inert. |
| Reports | PLACEHOLDER / NOT IMPLEMENTED (H) | Not in navigation; static generator; no report-generation infrastructure exists anywhere. |

**Correction (project-owner clarification, 2026-10-03):** this section previously stated that a real, structured Orchestrator backend exists in an "unconnected second Supabase project." That characterization is corrected. The project owner has clarified that the separate Supabase project in question is a legacy, limited WhatsApp/Formatting integration project predating the current Call Centre architecture — not a second general-purpose Call Centre backend. Generated TypeScript types from that legacy project contain historical definitions named `orchestrator_flows`/`_versions`/`_approvals`/`_integrations`/`_runs`/`_snippets`, but these were never verified via live database access: their live existence, row data, ownership, and relevance to the current Call Centre Orchestrator function are not established. They are therefore **not** treated as evidence that a Call Centre Orchestrator backend exists, and are retained only as an evidence footnote: *generated types from the legacy WhatsApp Supabase project contain historical definitions named `orchestrator_*`; their relevance to the current Call Centre application is unconfirmed and they are excluded from functional capability classification.* **Orchestrator is PLACEHOLDER / NOT IMPLEMENTED with no verified backend integration in the current Call Centre application.** The legacy project's actually-verified purpose — the legacy WhatsApp/Formatting integration (`whatsapp_messages`, `whatsapp_sessions`, `vapi_response_logs`, WhatsApp Edge Functions) — is unaffected by this correction and is already intended for eventual consolidation into the main project's `call_center` ownership boundary, a planned decision not performed in this audit.

---

## 15. Cross-screen Functional Consistency Register

| Functional concept | Screen A | Screen B | Existing technical relationship | Current inconsistency | Gap type |
|---|---|---|---|---|---|
| Interaction detail presentation | Call Logs / Dashboard / Customer Detail / Campaign Detail (shared `InteractionDetailDialog`) | Live View (hand-rolled dialog) | Both ultimately describe the same `Interaction` shape | Live View's own dialog omits FCR, Authenticated, Escalation trigger, Campaign name, Summary/tags, Recording, searchable transcript, and the 60s-cap refresh UI that the shared dialog already provides elsewhere | F |
| `call.analysis.*` field | Call Detail (shared dialog — dropped, proven duplicate) | Live View (own dialog — still rendered) | Same underlying field on the same `Interaction`-family data | One screen has proven and removed it; the other still shows it, unverified in that context | F |
| Customer ↔ interaction identity | Customer Detail (navigable — this is the destination) | Call Detail / Chat Detail / Campaign Detail target rows (source — no outbound link) | `campaign_targets.customer_id` is a real, non-optional FK already on the wire | A customer identity is a clickable destination in one direction but inert text or an unused field everywhere it could originate | F |
| Agent `contract` object | Create Campaign / Campaign Configuration (fully rendered) | Agent Detail (1-line label only) | Identical `contract` data is fetched in both places | Same real data, materially different presentation richness | F |
| WhatsApp conversation ↔ Formatting log | WhatsApp Hub | Formatting Hub | `session_id` is the same value in both `whatsapp_messages` and `vapi_response_logs`, confirmed via the Edge Function call site | No cross-navigation between a formatting log row and its originating conversation despite a real, confirmed shared key | A (also registered as a consistency case since it spans two screens) |
| Interaction channel coverage | Ratio Explorer drill-down (claims to support voice+chat per its own DTO) | `callPopulationProvider.ts` (hardcodes `channel: 'voice'`) | DTO type supports both channels; implementation does not | Drill-down is voice-only in practice with no chat-channel data reason | F |
| Voice vs. Chat per-interaction metadata richness | Call Detail (rich: FCR, sentiment, intent accuracy, summary, recording) | Chat Detail / Customer360 chat-sourced rows (campaign/outcome/sentiment/escalation/duration/direction hardcoded null at materialization) | Both are interaction channels feeding the same downstream Customer360 Interaction History | Materially different information richness between channels that is not explained by a demonstrated data unavailability at the chat source itself | F |

---

## 16. Backend/system capabilities with no demonstrated UI requirement

These exist and are real, but are evaluated as operational/system-maintenance concerns rather than customer- or operator-facing screen gaps, and are deliberately excluded from the Master Gap Register in §17:

- `customer_aggregation_state` (reconciliation/backfill watermark) — internal job-coordination state.
- `customer_merge_log` + merge RPC — administrative identity-hygiene machinery, never exercised.
- `interaction_events` telemetry table + repository — internal technical-event capture infrastructure with no producer or consumer; relevant to future Conversation Quality work, not to any current screen's stated purpose.
- `campaign_configuration_versions`' raw version-chain storage mechanism itself (as distinct from the already-registered gap that its *content* isn't diffed/surfaced — the storage/versioning mechanism itself is pure internal provenance).
- Activity status-update RPC's absence of an API route is registered as part of the Activity/Diary gap in §4/§17 (it is user-facing functionality, not a system internal) — not listed here.

---

## 17. Master Material Gap Register

| Gap ID | Screen / Function | Gap | Gap Type | Existing Supporting Capability | Missing Layer | User-visible Effect | Evidence |
|---|---|---|---|---|---|---|---|
| CUST-01 | Customer Detail | Activity/Diary exists through the API but has no frontend consumer | B | `customer_activities` table, `createActivity`/`listActivitiesForCustomer` repository methods, `GET/POST ?action=activities` route | Hook/component | Customer360 does not expose any note/instruction/task/reminder/appointment capability despite it being fully built server-side | Phase 2 §4 |
| CUST-02 | Customer Detail | `channels`, `authSummary`, `latestAgentId/DisplayName` are fetched by the page's own data hook but never rendered | A | `customers` table columns; mapped into API response | Component rendering | A customer's channel history, authentication status, and last-handling agent are invisible despite being present in the data the screen already holds | Phase 2 §4 |
| CUST-03 | Customer Detail | `recordingAvailable`/`escalationTrigger` exist per interaction row but aren't shown as columns/indicators | A | `customer_interactions` columns; mapped | Component rendering | A user reviewing interaction history cannot tell which interactions have a recording or were escalated without opening each one | Phase 2 §4 |
| CUST-04 | Customer Detail ↔ Campaign Detail | Campaign target rows contain a stable Customer360 customer ID, but no Campaign Detail interaction exposes the corresponding customer relationship | A | `campaign_targets.customer_id` (real, non-optional FK, already on every target row) | Component rendering / navigation | A campaign operator viewing a target cannot reach that customer's 360 record from Campaign Detail | Phase 2 §4, §7 |
| CUST-05 | Chat Detail / Customer360 | Chat-sourced interactions materialized into Customer360 have campaign, outcome, sentiment, escalation trigger, duration, and direction hardcoded to null regardless of source data | C | `chat_sessions` columns (several real and populated) | Materialization mapper (`chatInteractionSource.ts`) | Chat-channel rows in Customer360's Interaction History are structurally unable to show this information, even when the underlying session has it | Phase 2 §4, §6 |
| CALL-01 | Call Logs / Call Detail | `actual_outcome_code/name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context` are present on the API response but dropped before reaching the screen | C | `CallDataEntryDto` fields | `callsMapper.ts` | These fields are unavailable anywhere in Call Logs/Call Detail despite being returned by the backend | Phase 2 §5 |
| CALL-02 | Call Logs | No server-side filtering exists for agent, FCR, authenticated, or campaign | D | — | External Voice API itself | Users can only filter on what the current page returns, not query server-side | Phase 2 §5 |
| CALL-03 | Call Logs | No true full-history export exists; only the current page can be exported | D | — | External Voice API itself | A complete export requires manual page-by-page aggregation | Phase 2 §5 |
| CALL-04 | Call Detail | Session-transcript endpoint has no per-turn sentiment/confidence fields | D | — | External Voice API itself | Per-turn sentiment/confidence cannot be shown in the live transcript view | Phase 2 §5 |
| CHAT-01 | Chat Logs | `campaign_id`/`campaign_target_id` on `chat_sessions` are real and populated but unread by the API route | B | `chat_sessions.campaign_id`/`campaign_target_id` columns | `api/chat/logs.ts` route | Chat Logs cannot show which campaign (if any) a chat session relates to | Phase 2 §6 |
| CHAT-02 | Chat Logs | `is_trial` is real and functional internally but never shown | A | `chat_sessions.is_trial` | Component rendering | Users cannot distinguish trial sessions in the UI | Phase 2 §6 |
| CHAT-03 | Chat Logs | `customer_id` is used only to derive a text label, not exposed as a navigable link | A | `chat_sessions.customer_id` | Component rendering / navigation | No way to jump from a chat session to the resolved customer's 360 record | Phase 2 §6 |
| CHAT-04 | Chat Detail | Per-turn AI metadata is structurally undefined whenever the live (dominant) data path succeeds | C | Per-turn metadata fields | `chatInteractionSource.ts` / live data path | Per-turn metadata only ever appears for turns sent through this app's own Chat Console, not for the majority live path | Phase 2 §6 |
| CAMP-01 | Campaign Detail | Legacy `campaign_result_rules` (10 rows / 5 campaigns) are fetched into component state but never read | A | `call_center_campaign_get`'s `rules` field | Component rendering | Legacy campaign configuration data is invisible on Campaign Detail | Phase 2 §7 |
| CAMP-02 | Campaign Detail / Campaign History | `campaign_configuration_versions`' full snapshot chain is fetched, but only the active version's id is used — no version-by-version diff is surfaced | A | `campaign_configuration_versions` table, `previous_version_id` chain | Component rendering | Campaign History shows an event summary but not a true configuration diff between versions | Phase 2 §7 |
| LIVE-01 | Live View | The screen's own detail dialog omits several fields the shared `InteractionDetailDialog` already provides elsewhere (FCR, Authenticated, Escalation trigger, Campaign name, Summary/tags, Recording, searchable transcript, 60s-cap refresh UI) | A, F | `InteractionDetailDialog` (already built, used elsewhere) | Live View's own separate dialog implementation | A user monitoring a live call sees less detail than the same data would show anywhere else in the product | Phase 2 §8 |
| LIVE-02 | Initiate Call | `call_sid` → Call Detail correlation is proven and used elsewhere (Campaign reconciliation) but not wired on this screen | A | `call_sid === call_id` correlation mechanism | Component navigation | A user who just placed a call has no path from this screen into that call's eventual detail record | Phase 2 §8 |
| QA-01 | Interaction Quality | Voice per-call latency has no confirmed data source | D | — | External Voice API itself | Latency is shown as `—` for every voice row | Phase 2 §9 |
| QA-02 | Interaction Quality | Chat sentiment/FCR fields do not exist in the Chat API response | D | — | External Chat API itself | Sentiment/FCR shown as `—` for every chat row | Phase 2 §9 |
| AN-01 | Ratio Explorer | 16 of 30 registered ratios have no underlying data at any layer | D | Ratio registry definitions exist; data does not | Backend data source | These 16 ratios cannot be computed | Phase 2 §10 |
| RATIO-01 | Ratio Explorer | 3 of 30 ratios have a real underlying field but incomplete eligibility logic | C | Real field exists | Eligibility-computation logic | These ratios produce incomplete or partially-correct values | Phase 2 §10 |
| RATIO-02 | Ratio Explorer | Driver decomposition exists for only 1 of 30 ratios | A/D (mixed, by ratio) | `escalation_rate`'s own driver logic as the only built example | Per-ratio driver logic | Most ratios offer no "why" breakdown behind the headline number | Phase 2 §10 |
| RATIO-03 | Ratio Explorer | Drill-down population provider hardcodes `channel: 'voice'` despite the DTO supporting chat | F | `RatioInteractionRefDto` supports both channels | `callPopulationProvider.ts` | Drill-through is voice-only in practice | Phase 2 §10 |
| AGENT-01 | Agent Detail | The agent's own `contract` object (real data: required/optional fields, outcome codes) is fetched but reduced to a 1-line label | A, F | `contract` object, already fully rendered in Create Campaign/Campaign Configuration | Component rendering | A user on Agent Detail sees materially less contract information than the same data provides elsewhere | Phase 2 §11 |
| WA-01 | WhatsApp Hub | `session_id` is real and populated but the UI renders all messages as one flat stream with no conversation grouping | A | `whatsapp_messages.session_id` | Component rendering | Multiple conversations with the same or different customers are not visually separated | Phase 2 §12 |
| WA-02 | WhatsApp Hub | "Connected to Sandbox" status has no backing data source of any kind | E | — | No such capability exists at any layer | The status shown may not reflect any real connection state | Phase 2 §12 |
| WA-03 | Formatting Hub | `vapi_response_logs.session_id` shares the identical value as the originating WhatsApp conversation's `session_id`, but no navigation connects a formatting log row to that conversation | A | Confirmed shared, real join key | Component navigation | A user reviewing a formatting log cannot jump to the WhatsApp conversation that produced it | Phase 2 §12 |

**26 material gaps registered.** Unexposed capabilities judged to have no demonstrated functional screen requirement (reconciliation watermark, merge machinery, `interaction_events` telemetry infrastructure, version-chain storage mechanism itself) are deliberately excluded per §16 and are not double-counted here.

---

## 18. Residual unresolved evidence questions

| # | Question | What would resolve it |
|---|---|---|
| 1 | **Customer360 chat-session pagination parity** — does materialization into `customer_interactions` silently drop rows for scoped roles before they ever reach Customer360's Interaction History, the way Chat Logs' own role-scoped cap does? | Direct tracing of the materialization job's (`chatInteractionSource.ts` ingestion path) internal row-selection logic under a scoped role, not yet independently re-verified below the table/column level. |
| 2 | **`customer_external_identities` consumer** — which API route, if any, reads this real, 1-row table? | A direct trace from this table through `src/server/` to confirm whether any route references it, not yet performed. |
| 3 | **Second Supabase project's live row/RLS state** (`orchestrator_*`, `user_roles`, `chat_messages/_sessions/_traces`, `kb_chunks/_facts/_graph_edges`) | Live query access to the second project (`wyzmsetlxltnojyxjkkd`) — this session's Supabase MCP tooling is scoped to the primary `call_center` project; findings on the second project came from reading its generated TypeScript types only. |

These are marked **UNRESOLVED EVIDENCE QUESTION** and are not converted into gaps.

---

## 19. Facts established by the audit

1. Nearly every screen in this product that is not an explicit placeholder is backed by real, live data — there is very little fabricated application behavior anywhere outside the five explicitly-placeholder areas (NPS, Orchestrator ×3, Reports, User Management) plus 4 of Settings' 5 tabs and the Login/Auth credential backend.
2. The dominant completeness pattern in this product is **capability that already exists and already reaches, or nearly reaches, the frontend but is not rendered** — not missing backend engineering.
3. Customer360's situation specifically: its visible core (identity, interaction history, campaign participation, drill-down) is genuinely complete for its stated purpose; its gaps are a defined, bounded list of already-fetched-but-unrendered fields, one fully-built-but-unconsumed Activity subsystem, and one specific chat-materialization data-path defect — not a general architecture problem.
4. No Supabase table of any kind backs voice calls — Call Logs/Call Detail/Dashboard/Live View's call data is 100% externally API-driven, a structural fact that bounds what can ever be exposed there without an upstream change.
5. A separate, legacy Supabase project exists and is used today for the legacy WhatsApp/Formatting integration only — an older, limited project predating the current Call Centre architecture, not a second general-purpose Call Centre backend. Its generated types also contain historical, unverified Orchestrator-named and `user_roles` definitions, but their live existence, ownership, and relevance to the current Call Centre application were never established via live database access, so they are not counted as existing Call Centre backend capability. This project's Call Centre-relevant WhatsApp/Formatting persistence is already intended for eventual consolidation into the main project's `call_center` ownership boundary — a planned decision, not performed in this audit.
6. Several apparent gaps are not oversights: the `analysis.*` duplicate field, campaign follow-up auto-execution, the `targetCount` join discrepancy, and Campaign Analytics' lack of role scoping are all explicitly, deliberately deferred or self-disclosed in existing code/documentation.
7. The Ratio Explorer/registry is a genuinely mixed system — 5 implemented, 3 partial, 16 without any backend data, 6 deliberately deferred pending future telemetry — and should not be characterized as uniformly complete or incomplete.
8. 26 material functional gaps were registered across the product; a further set of real backend capabilities (reconciliation state, merge machinery, interaction-event telemetry) were evaluated and excluded as internal/system concerns with no demonstrated screen requirement, rather than inflating the gap count.

## 20. Decisions deliberately left to Phase 4

- Whether any of the 26 registered gaps should be addressed, and in what order.
- Whether Customer360's Activity/Diary subsystem should be wired to a screen.
- Whether placeholder modules (NPS, Orchestrator, Reports, User Management, 4 Settings tabs, real Login credential backend) remain in scope for this product at all.
- Whether the legacy WhatsApp Supabase project's historical, unverified Orchestrator-named and `user_roles` definitions warrant live verification, and if confirmed real and relevant, whether any such capability should be adopted, connected, or retired — none of this has been established as existing Call Centre capability by this audit.
- Whether and how the already-planned consolidation of the legacy project's Call Centre-relevant WhatsApp/Formatting persistence into the main project's `call_center` ownership boundary should be sequenced.
- Whether the 16 backend-gap ratios and 6 telemetry-dependent ratios should be pursued, and whether a Trace/Per-Call Metrics API integration should proceed.
- Whether the voice-call API's missing server-side filters, full-export, and per-turn sentiment capability should be pursued with the upstream provider.
- Which, if any, of the Functional Consistency Gaps (§15) warrant unifying the diverging screens.
- Development sequencing of any kind.

None of these are answered in this document.

---

## 21. Evidence index

This document synthesizes, without re-deriving: the full master screen table and all 28 detailed screen sheets in `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_1_SCREEN_INVENTORY.md`; all 8 functional-area sections, the 56-row master exposure matrix, the 27-question disposition table, and the evidence index in `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_2_DATA_EXPOSURE.md`. Every gap-register entry in §17 cites its Phase 2 section as the primary evidence trail; no new repository-wide exploration was performed for this phase. The only narrow verification performed in this phase was re-confirming that Phase 2's self-correction of Phase 1 Q21 (WhatsApp login-link origin) was already resolved and required no further reconciliation.

---

## Completion statistics

- **Screens/functions assessed:** 33 (all Phase 1 master-table rows, including sub-views)
- **Completeness state counts:** COMPLETE FOR CURRENT PURPOSE — 10; SUBSTANTIALLY COMPLETE — EXPOSURE GAPS — 15; PARTIALLY COMPLETE — INTEGRATION/DATA GAPS — 2; LIMITED BY UPSTREAM CAPABILITY — 1 (combined with exposure-gap states on several rows per §3); PLACEHOLDER / NOT IMPLEMENTED — 8; INTENTIONALLY DEFERRED (function-level) — 0 full-function deferrals (deferrals found were field/mechanism-level, captured within other screens' entries)
- **Material gaps registered:** 26
- **Count by gap type:** A (UI Exposure) — 13; B (Frontend Integration) — 3; C (Application Data-Path) — 5; D (Backend/Data Capability) — 6; E (UI Without Backend) — 1; F (Functional Consistency) — 6 (several gaps carry two types, e.g. A+F)
- **Unexposed capabilities excluded as no demonstrated screen requirement:** 4 (reconciliation watermark, merge machinery, `interaction_events` telemetry infrastructure, configuration-version storage mechanism itself)
- **Intentionally deferred items:** 4 (`analysis.*` duplicate field, campaign follow-up auto-execution, `targetCount` join discrepancy, Campaign Analytics role-scoping absence) plus 6 telemetry-dependent ratios and the QA composite-score/reviewer-workflow absence
- **Placeholder/unimplemented functions:** 8 (Login credential backend, NPS Campaigns, Orchestrator Flow Library, Orchestrator Flow Editor, Orchestrator Integrations, Reports, User Management, 4 of Settings' 5 tabs)
- **Residual unresolved evidence questions:** 3
- **Document path:** `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_3_COMPLETENESS_GAP_REGISTER.md`

**Phase 3 is complete. Per the audit's own instructions, this STOPS here — no prioritization, recommendation, implementation, or Phase 4/roadmap is produced. The project owner will review this evidence and decide Phase 4.**
