# Call Centre — Phase 4 Decision Preparation Register

**Status:** Decision-support document only. No code, schema, UI, API, or configuration was modified. No priorities, recommendations, or implementation plan are included. The Owner Decision columns are intentionally blank.
**Inputs:** `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_1_SCREEN_INVENTORY.md`, `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_2_DATA_EXPOSURE.md` (corrected), `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_3_COMPLETENESS_GAP_REGISTER.md` (corrected)
**Date:** 2026-10-03
**Implementation status update (2026-10-03):** `DEC-CUST-01`, `DEC-CUST-02`, and `DEC-CUST-03` have been implemented and deployed per `docs/SESSION_13_1_CUSTOMER360_FUNCTIONAL_COMPLETION.md`, verified against the production deployment (API-level creation/status-update/isolation checks, and a post-deployment correction to both Activity/Diary placement and an interaction-drill-down authorization bug). This is a status note only — it does not assign an Owner Decision disposition to any row below; those remain blank as this document requires.

---

## 1. Purpose

Phases 1–3 established, in order: what every screen currently does, how much of the underlying backend/API capability reaches each screen, and a complete material-gap register classified by type.

This document does not add new findings. It regroups the Phase 3 evidence into a manageable set of explicit decisions the project owner can make, using the five dispositions below. **No disposition is assigned in this document** — every Owner Decision cell is left blank.

- **DO NOW** — complete in the next development cycle.
- **KEEP FOR LATER** — valid, but deliberately outside the immediate cycle.
- **DO NOT NEED** — should not be pursued merely because it exists in the architecture or UI.
- **EXTERNAL DEPENDENCY** — depends on an upstream API/provider change, not ordinary Call Centre development.
- **ALREADY COMPLETE / NO ACTION** — no material development decision required.

---

## 2. Current product position

The product's working core (Dashboard, Live View, Call Logs/Detail, Chat Logs/Detail, Customers/Customer360, Campaigns, Interaction Quality, WhatsApp/Formatting, AI Agents, Analytics/Ratio Explorer) is real and functioning. Its outstanding items fall into three qualitatively different buckets, each requiring a different kind of owner decision:

1. **Exposure/integration decisions** — capability already built that could be surfaced or wired up without new backend work (Decision Groups A and B).
2. **Upstream-dependent decisions** — capability that cannot be completed by Call Centre development alone (Decision Group C).
3. **Scope decisions** — whether placeholder modules and one architectural consolidation remain part of the product at all (Decision Groups D and E).

A fourth category — Phase 3 items that were already classified as deliberately deferred or internal — requires no owner decision and is listed separately (§9) so it is not mistaken for unfinished work.

---

## 3. Master Decision Register

| Decision ID | Area | Decision to Make | What Already Exists | What Is Missing / Inconsistent | Owner Decision | Notes |
|---|---|---|---|---|---|---|
| DEC-CUST-01 | Customer360 | How much of the already-fetched Customer aggregate/interaction data should be represented in Customer Detail? | `channels`, `authSummary`, `latestAgentId/DisplayName` on the customer record; `recordingAvailable`/`escalationTrigger` per interaction row — all fetched into the page's own data object today | ~~None of these five fields are currently rendered~~ **IMPLEMENTED (Session 13.1)** — all five now rendered in Customer Detail | | See `docs/SESSION_13_1_CUSTOMER360_FUNCTIONAL_COMPLETION.md` |
| DEC-CUST-02 | Customer360 | Should Customer Activity/Diary become part of the operational Customer360 experience? | Full create+list API against a real `customer_activities` table (note/instruction/task/reminder/appointment, campaign/interaction cross-links); a status-update RPC exists one layer below the API | ~~Zero frontend consumer; status-update has no API route either~~ **IMPLEMENTED (Session 13.1)** — create/list/status-update all wired and verified; delete remains genuinely absent (no layer supports it); activity authorization scoping residual limitation documented, not resolved | | See `docs/SESSION_13_1_CUSTOMER360_FUNCTIONAL_COMPLETION.md` |
| DEC-CUST-03 | Customer360 / Campaigns / Chat | Should proven but unused customer-identity relationships be exposed as navigation? | `campaign_targets.customer_id` (real, non-optional FK, already on every target row); `chat_sessions.customer_id` (used only to derive a label) | ~~Neither is used as a clickable link to Customer360~~ **IMPLEMENTED (Session 13.1)** — Campaign target→Customer360, Chat session→Customer360, and Initiate Call→Call Detail navigation all added and verified | | See `docs/SESSION_13_1_CUSTOMER360_FUNCTIONAL_COMPLETION.md` |
| DEC-CHAT-01 | Chat Logs | Should already-available chat session metadata be shown in Chat Logs? | `chat_sessions.campaign_id`/`campaign_target_id` (real, populated, unread by the API route); `is_trial` (real, functional internally) | ~~Neither reaches the Chat Logs screen~~ **IMPLEMENTED (Session 13.2)** — both now exposed in Chat Logs and Chat Session Detail | | See `docs/SESSION_13_2_INTERACTION_DATA_INTEGRITY.md` |
| DEC-AGENT-01 | AI Agents | Should Agent Detail represent the agent's `contract` object with the same richness it already has in Campaign Configuration, and should that same contract govern direct-entry interaction points (Initiate Call, Chat Console)? | The same real `contract` object (status, description, expected fields, outcome codes) is fetched by Agent Detail | ~~Agent Detail renders only a 1-line "Contract source" label; Initiate Call sends only `{to_phone_number, agent_id}` regardless of the selected agent's declared inputs~~ **IMPLEMENTED (Session 13.3)** — Agent Detail now renders full Expected Inputs/Expected Outcomes/Output Fields; Initiate Call renders a dynamic, contract-driven Agent Inputs form (shared `AgentContractInputs` component) with required-field gating and declared-field-only payload construction; Chat Console's lack of contract-input support in the real Chat API is explicitly documented as an external dependency, not fabricated | | See `docs/SESSION_13_3_AGENT_DETAIL_CONTRACT_EXPOSURE.md` |
| DEC-CAMP-01 | Campaigns | Should Campaign Detail/History expose legacy result-rule data and full configuration-version history? | 10 rows of legacy `campaign_result_rules` across 5 campaigns, fetched and unread; full `campaign_configuration_versions` snapshot chain, fetched, only the active version's id used | ~~Neither is surfaced; Campaign History shows only an event summary, not a version diff~~ **IMPLEMENTED (Session 13.4)** — new read-only Configuration History view: current-vs-superseded versions, a deterministic structural diff between consecutive versions, execution provenance in the Agent Result dialog, and a separately labeled Legacy Result Rules section (confirmed still functionally governs Generic Call Result) | | See `docs/SESSION_13_4_CAMPAIGN_CONFIGURATION_HISTORY_EXPOSURE.md` |
| DEC-WA-01 | WhatsApp / Formatting | Should the real, shared `session_id` be used to group WhatsApp conversations and link Formatting Hub rows back to their originating conversation? | `whatsapp_messages.session_id` (real, populated); `vapi_response_logs.session_id` uses the identical value, confirmed via the Edge Function call site | WhatsApp Hub shows one flat message stream; Formatting Hub has no click-through to the originating conversation | | |
| DEC-CHAT-02 | Chat / Customer360 | Should the chat-to-Customer360 materialization path and the chat per-turn-metadata data path be corrected? | `chat_sessions` carries real values for several fields; per-turn AI metadata exists and is wired in the UI | ~~`chatInteractionSource.ts` hardcodes campaign/outcome/sentiment/escalation/duration/direction to null regardless of source data; per-turn metadata structurally undefined on the live path~~ **PART A IMPLEMENTED (Session 13.2)** — campaignName and durationSeconds now genuinely mapped; outcome/sentimentScore/escalationTrigger/direction confirmed to have no compatible source and correctly remain null (not a gap). **PART B: application data-path already correct / upstream capability unavailable** — traced end-to-end; the live Chat API transcript endpoint genuinely has no per-turn metadata field, and the app already leaves it undefined rather than fabricating it; no code change was needed | | See `docs/SESSION_13_2_INTERACTION_DATA_INTEGRITY.md` |
| DEC-CALL-01 | Call Logs / Call Detail | Should the fields the Call mapper currently drops be preserved in the application data model and/or displayed? | `actual_outcome_code/name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context` are present on the backend response | ~~`callsMapper.ts` drops all of them before the `Interaction` type is built~~ **IMPLEMENTED (Session 13.2)** — all six preserved in the normalized model; actualOutcomeCode/actualOutcomeName/structuredOutputs exposed in a new "Agent Outcome" section when genuinely populated; isBankCustomer/transcriptDocId/context preserved model-only | | See `docs/SESSION_13_2_INTERACTION_DATA_INTEGRITY.md` |
| DEC-LIVE-01 | Live View | Should Live View's own hand-rolled detail dialog be reconciled with the shared `InteractionDetailDialog` used elsewhere? | The shared dialog already renders FCR, Authenticated, Escalation trigger, Campaign name, Summary/tags, Recording, searchable transcript, and a 60s-cap refresh UI | ~~Live View's separate dialog omits all of these for the same underlying data~~ **IMPLEMENTED (Session 13.5)** — Live View now uses the shared `InteractionDetailDialog` directly (stable id-based selection, live-match-or-one-shot-fallback resolution); the duplicate hand-built dialog and its `call.analysis.*` usage are removed | | See `docs/SESSION_13_5_LIVE_VIEW_DETAIL_CONVERGENCE.md` |
| DEC-RATIO-01 | Ratio Explorer | Should two existing data-correctness issues in Ratio Explorer be corrected? | A real per-ratio implementation exists for the ratios in question | ~~`callPopulationProvider.ts` hardcodes `channel: 'voice'` despite the DTO supporting chat, making drill-through voice-only in practice; 3 of 30 ratios have a real field but incomplete eligibility logic~~ **IMPLEMENTED (Session 13.6)** — channel finding: the provider is genuinely Voice-only (no Chat population source exists anywhere), `channel: 'voice'` was accurate, not a misclassification; a real drill-through identity bug found during inspection (broken call_id search with a dangerous wrong-row fallback) was fixed. Eligibility: authentication_success_rate implemented (was null-vs-value attempted signal, previously unwired); completion_rate and avoidable_escalation_rate confirmed to still genuinely lack usable data/taxonomy and remain unavailable, not forced. Baseline corrected from "30" to the real count, 31 | | See `docs/SESSION_13_6_RATIO_EXPLORER_DATA_CORRECTNESS.md` |
| DEC-WA-02 | WhatsApp Hub | Should the "Connected to Sandbox" status indicator be corrected or removed? | — | No health-check or connection-status data source of any kind exists in the schema backing this indicator | | This is a UI-without-backend finding, not an exposure gap |
| DEC-CALL-02 | Call Logs / Call Detail | Should any of the Voice API's missing capabilities be pursued with the upstream provider? | Current mapper/UI already use everything the API provides for these | No server-side filtering (agent/FCR/authenticated/campaign); no full-history export, only page aggregation; no per-turn sentiment/confidence on the transcript endpoint; no confirmed per-call latency source | | External dependency — cannot be resolved by Call Centre code changes alone |
| DEC-CHAT-03 | Chat / Interaction Quality | Should the Chat API's missing sentiment/FCR fields be pursued with the upstream provider? | — | The Chat API itself does not return sentiment or FCR fields at all | | External dependency |
| DEC-RATIO-02 | Ratio Explorer | Should the 17 backend-gap ratios, or the 6 Trace/telemetry-dependent ratios, be pursued via a future data/API integration? | Ratio registry already defines all 31 ratios (corrected from a prior "30" count — see DEC-RATIO-01, Session 13.6) and classifies their implementation state | 17 of 31 have no underlying data at any layer; 6 are explicitly deferred pending a future Interaction Trace API | | The 17 and the 6 are distinct dependency groups and should not be conflated. NOT implemented — explicitly out of scope for Session 13.6. |
| DEC-AUTH-01 | Authentication | Does real application authentication belong in the Call Centre product scope? | Protected-route mechanics work end-to-end; Supabase `auth.*` schema (16 tables) is fully provisioned in the main project | Credential verification is a single hardcoded literal; no server-side session check exists | | |
| DEC-USER-01 | User Management | Is User Management/RBAC part of the intended Call Centre product? | — (no verified Call Centre capability) | No general role/permission table exists in the main project; `role_customer360_access` is narrowly Customer360-scoped only | | A `user_roles`-named table observed only in the legacy WhatsApp project's generated types is historical/unverified and must not be read as an existing backend |
| DEC-NPS-01 | NPS | Is NPS Campaign functionality part of the intended product? | — | No channel column on `campaigns`, no NPS classification codes, anywhere | | Screen currently self-discloses non-persistence |
| DEC-ORCH-01 | Orchestrator | Is Orchestrator genuinely part of the Call Centre product scope? | — (no verified Call Centre capability) | No backing tables anywhere in the current application's architecture | | Historical `orchestrator_*` definitions observed only in the legacy WhatsApp project's generated types are unverified and must not be read as an existing backend |
| DEC-REPORT-01 | Reports | Does the product require a dedicated Reports module beyond Analytics/Ratio Explorer? | Analytics/Ratio Explorer already provide real cross-channel reporting | Reports screen is a static generator with no report-generation infrastructure; not in navigation | | |
| DEC-SETTINGS-01 | Settings | Do the four placeholder Settings tabs (beyond Appearance) belong in product scope? | Appearance (theme) is real and persisted | The other four tabs are static fields; Save is a no-op; no settings/config table exists anywhere | | |
| DEC-WA-03 | Architecture | Confirm whether the previously agreed WhatsApp/Formatting Supabase consolidation remains in the immediate completion scope or is deferred | A legacy, limited WhatsApp/Formatting Supabase project currently backs the live WhatsApp integration; a consolidation decision into the main project's `call_center` ownership boundary was already agreed in principle | No migration has been executed; current evidence does not show any consolidation work performed | | This is a scheduling confirmation of an existing direction, not a new design decision |

---

## 4. Existing Product Completion Decisions (Group A)

### Customer360 information exposure — DEC-CUST-01
What already exists: `channels` (array of channels used), `authSummary` (`everAuthenticated`/`lastAuthenticatedAt`), and `latestAgentId`/`latestAgentDisplayName` are real columns on the `customers` table, correctly mapped by the repository layer into the API response, and fetched in full by Customer Detail's own data hook. `recordingAvailable` and `escalationTrigger` are real per-row columns on `customer_interactions`, mapped the same way, fetched by the interaction-history hook. Where it currently stops: in every case, the component itself never destructures these fields — the data is already sitting in the object the screen holds, one rendering step away. Current function affected: Customer Detail's identity/summary presentation and its Interaction History table.

### Customer Activity / Diary — DEC-CUST-02
What already exists: a complete, validated `GET`/`POST ?action=activities` API route against a real `customer_activities` table supporting five activity types (note, instruction, task, reminder, appointment), with optional links to a campaign, campaign target, or interaction. A `call_center_activity_update_status` RPC and a matching repository method exist one layer below the API. Where it stops: no file anywhere in the frontend imports or calls any of this; the status-update capability isn't even reachable via the API route dispatch; no delete capability exists at any layer; activity authorization scoping is explicitly flagged as an open question in the route's own code comment. This is treated as its own decision, separate from the field-level items above, because it introduces an actual user workflow (recording and tracking customer-related work items) rather than merely displaying an existing fact.

### Customer navigation / relationship exposure — DEC-CUST-03
Consolidated proven relationships: `campaign_targets.customer_id` is a real, non-nullable foreign key already present (non-optional) on every campaign target row the frontend receives — the strongest unexposed linkage found in the whole audit. `chat_sessions.customer_id` is used today only to derive a text label on Chat Logs, never as a navigable identifier. Initiate Call's `call_sid` already correlates to Call Detail via the same `call_sid === call_id` mechanism proven elsewhere (Campaign reconciliation), but this screen builds no link to it. Current function affected: Campaign Detail's target rows, Chat Logs' session rows, and Initiate Call's post-trigger status all currently present an identity/correlation as inert information rather than a link.

### Agent Contract exposure — DEC-AGENT-01
The same real `contract` object — a live `status`, `description`, `expected_input_fields`, `expected_outcomes`, and `output_fields` set, confirmed populated for sampled agents — is already fetched by Agent Detail. It is already rendered richly in Create Campaign and Campaign Configuration. On Agent Detail itself, it is reduced to a single "Contract source: partner_api" label.

### WhatsApp / Formatting relationship exposure — DEC-WA-01
`whatsapp_messages.session_id` is real and populated per conversation (upserted onto `whatsapp_sessions` keyed by phone number). `vapi_response_logs.session_id` uses the identical value, confirmed via the Edge Function call site that generates both. Currently, WhatsApp Hub presents all messages as one flat stream regardless of session, and Formatting Hub shows a truncated `session_id` per log row with no way to reach the conversation that produced it.

*(No UI implementation is prescribed for any of the above — only the existing capability and where it currently stops.)*

---

## 5. Correctness & Consistency Decisions (Group B)

### Chat → Customer360 materialization — DEC-CHAT-02 (part 1)
`chatInteractionSource.ts`'s row mapper hardcodes `campaignName: null, outcome: null, sentimentScore: null, escalationTrigger: null, durationSeconds: null, direction: null` for every chat-sourced interaction that reaches Customer360's Interaction History — this happens unconditionally, regardless of whether the source `chat_sessions` row actually holds these values. This is a data-path defect (the application loses information it already has), not a missing-data problem.

### Chat per-turn metadata fallback — DEC-CHAT-02 (part 2)
Per-turn AI metadata (`dataSource`/`confidence`/etc.) is wired into the Chat Detail UI, but is structurally `undefined` whenever the live (dominant) data path succeeds. It is only populated via the local-fallback branch, for turns sent through this app's own Chat Console — meaning most real chat sessions never show this metadata even though the capability exists in code.

### Call mapper — DEC-CALL-01
Real, backend-provided fields (`actual_outcome_code`/`actual_outcome_name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context`) are dropped by `callsMapper.ts` before the application's own `Interaction` type is constructed. Two separable questions apply here: whether these fields should be **preserved in the application's data model** (so they exist on the `Interaction` type even if unused today), and independently, whether they should then be **displayed to the user**. The audit does not assume the answer to either is yes.

### Live View interaction detail — DEC-LIVE-01
Live View uses its own, separately implemented detail dialog rather than the shared `InteractionDetailDialog` used by Dashboard, Call Logs, Customer Detail, and Campaign Detail. The shared dialog already renders FCR, Authenticated, Escalation trigger, Campaign name, Call Summary/tags, Recording playback, a searchable transcript, and a 60-second-cap live-polling refresh indicator — Live View's dialog provides none of these for the same underlying interaction data.

### Ratio channel consistency — DEC-RATIO-01
`callPopulationProvider.ts` hardcodes `channel: 'voice' as const` on every row it supplies to Ratio Explorer's drill-through, even though the underlying DTO type (`RatioInteractionRefDto`) supports both `'voice'` and `'chat'`. In practice, drill-through is voice-only despite the data model being channel-agnostic. Separately, 3 of the registered ratios have a real underlying field but incomplete eligibility logic, producing incomplete or partially-correct values rather than a clean implemented/not-implemented split.

**IMPLEMENTED (Session 13.6).** The channel hardcode was found to be accurate, not a bug — `callPopulationProvider.ts` is the only `AggregationProvider` implementation and its sole population source is the Voice call-data API; no Chat population source exists anywhere in the repository. A real, unrelated drill-through bug was found and fixed during this inspection (the interaction lookup used a search parameter that can never match a call id, with a fallback that risked silently showing an unrelated interaction). Of the 3 ratios with incomplete eligibility, one (`authentication_success_rate`) was successfully implemented using the real `was_authenticated` tri-state field; the other two (`completion_rate`, `avoidable_escalation_rate`) were re-confirmed to genuinely lack usable data/taxonomy and remain unavailable. The registry's total ratio count was also corrected from the previously-stated "30" to the real count, **31**. See `docs/SESSION_13_6_RATIO_EXPLORER_DATA_CORRECTNESS.md`.

### WhatsApp connection-status indicator — DEC-WA-02
WhatsApp Hub's "Connected to Sandbox" status badge is static JSX. No health-check table, connection-status column, or equivalent capability exists anywhere in the schema that could back it. The badge may not reflect any real connection state.

---

## 6. Upstream/API Dependency Decisions (Group C)

### Voice API — DEC-CALL-02
Capabilities that do not exist in the external Voice Partner API today, confirmed genuinely absent rather than merely unused by the frontend: server-side filtering by agent, FCR, authenticated status, or campaign; a true full-history export (only page-by-page aggregation is currently possible); per-turn sentiment/confidence on the live session-transcript endpoint; and a confirmed source for per-call latency. None of these can be added by changing this repository alone.

### Chat API — DEC-CHAT-03
The external Chat API does not return sentiment or FCR fields at all — a channel-structural limitation, not an application oversight. Pursuing this would require an upstream API change.

### Ratio backend-data and telemetry dependencies — DEC-RATIO-02
Of the Ratio registry's 30 defined ratios, 16 have no underlying data at any layer — genuinely backend-gap, not merely unexposed. A separate group of 6 ratios is explicitly deferred pending a future Interaction Trace API, per existing design documentation, and should be tracked as a distinct dependency group from the 16 (the 6 have a named future dependency; the 16 currently have none identified). Any decision to pursue either group, or a broader Per-Call Metrics/Trace API integration, is recorded here as a potential external-dependency decision — the audit does not recommend proceeding.

---

## 7. Placeholder Module Scope Decisions (Group D)

### Real Authentication — DEC-AUTH-01
Current situation: the protected-route redirect mechanics work correctly end-to-end; credential verification itself is a single hardcoded literal compared client-side; Supabase's `auth.*` schema (16 tables) is fully provisioned in the main project with 0 rows and is entirely bypassed. **Question for the owner:** does real application authentication belong in the Call Centre product scope?

### User Management — DEC-USER-01
Current Call Centre User Management is placeholder/unimplemented — 2 hardcoded users, a hardcoded permission matrix, inert buttons. No general role/permission table exists in the main project (`role_customer360_access` is narrowly Customer360-scoped and must not be read as a general RBAC backend). A `user_roles`-named table observed only in the legacy WhatsApp Supabase project's generated types was never verified live and is not treated as an existing backend. **Question for the owner:** is User Management/RBAC part of the intended Call Centre product?

### NPS — DEC-NPS-01
NPS Campaigns is a placeholder screen (self-disclosed non-persistence banner) with no dedicated backend — no channel column on `campaigns`, no NPS classification codes anywhere. **Question for the owner:** is NPS Campaign functionality part of the intended product, or should the placeholder remain outside scope?

### Orchestrator — DEC-ORCH-01
Current Call Centre Orchestrator (Flow Library, Flow Editor, Integrations) is placeholder/unimplemented, with no verified backing tables anywhere in the current application's architecture. Historical `orchestrator_*`-named definitions observed only in the legacy WhatsApp Supabase project's generated types were never verified via live access and must not be read as evidence of an existing Call Centre Orchestrator backend. **Question for the owner:** is Orchestrator genuinely part of the Call Centre product scope?

### Reports — DEC-REPORT-01
Reports is not in navigation, is a static generator with fabricated stats, and has no report-generation infrastructure of any kind, while Analytics and Ratio Explorer already provide real cross-channel reporting. **Question for the owner:** does the product require a dedicated Reports module beyond Analytics/Ratio Explorer?

### Settings — DEC-SETTINGS-01
Appearance (theme toggle) is real and persisted via `ThemeContext`/localStorage. The other four tabs are static fields with a no-op Save and no backing settings/config table anywhere in either Supabase project. **Question for the owner:** do those four configuration functions genuinely belong in product scope?

---

## 8. Legacy WhatsApp Supabase Consolidation (Group E) — DEC-WA-03

Record of the existing architectural direction:
- A legacy, limited WhatsApp/Formatting Supabase project exists, separate from the main project that hosts the `call_center` schema.
- The current live WhatsApp integration (`whatsapp_messages`, `whatsapp_sessions`, `vapi_response_logs`, WhatsApp Edge Functions) runs against this legacy project today.
- An architectural direction already exists, agreed prior to this audit: Call Centre-relevant WhatsApp/Formatting persistence from the legacy project is intended to be consolidated into the main Supabase project, under the Call Centre ownership boundary (the `call_center` schema where appropriate).
- No evidence in this audit indicates that migration has been executed.

**Owner decision to prepare:** confirm whether the previously agreed WhatsApp/Formatting Supabase consolidation remains in the immediate completion scope or is deferred. This document does not redesign the migration.

---

## 9. Intentionally Deferred / Internal Items (Group F) — no owner decision required unless noted

| Item | Why Phase 3 did not treat it as ordinary unfinished work | Owner decision already captured elsewhere? |
|---|---|---|
| Duplicate `call.analysis.*` field | Confirmed via live-sample comparison to always duplicate other already-shown fields; deliberately dropped from the shared Call Detail dialog | No — Live View's inconsistent retention of the same field is captured as DEC-LIVE-01 |
| Campaign follow-up automatic execution (`campaign_followups`) | A complete write pipe exists with zero callers; explicitly documented in prior session notes as an intentional scope decision, not an oversight | No |
| `targetCount` join discrepancy | Root-caused precisely (a join difference between RPCs); self-disclosed in code; 0 currently-orphaned targets in the live environment — a known, harmless mechanism, not an accidental missing feature | No |
| Campaign Analytics' lack of role/category scoping | Explicit, deliberate, in-code policy, not a discovered oversight | No |
| 6 Trace/telemetry-dependent ratios | Explicitly deferred in existing design documentation pending a future Interaction Trace API | Yes — tracked as part of DEC-RATIO-02 (Group C) regarding whether to pursue that future integration |
| QA composite-score / reviewer workflow | The current screen was previously rebuilt specifically to remove a prior fabricated score; explicit in-code statement that no manual-review backend exists | No |
| Reconciliation/backfill watermark (`customer_aggregation_state`) | Internal job-coordination state, not a customer-facing fact; Phase 3 classified it as a backend/system capability with no demonstrated UI requirement | No |
| Identity-merge machinery (`customer_merge_log` + RPC) | Administrative data-hygiene capability, never exercised; same classification as above | No |
| Raw `interaction_events` telemetry infrastructure | Internal technical-event capture with no producer or consumer; relevant only to possible future Conversation Quality work, not any current screen's stated purpose | No |
| Raw `campaign_configuration_versions` storage mechanism itself | The storage/versioning mechanism is internal provenance; its *content* not being diffed/surfaced is already captured as part of DEC-CAMP-01 — the storage mechanism itself is not | No |

---

## 10. Residual Evidence Questions

| Evidence Question | Why It Matters | How It Can Be Resolved | Product Decision Blocked? |
|---|---|---|---|
| Does Customer360's materialization into `customer_interactions` silently drop chat rows for scoped roles, the way Chat Logs' own role-scoped cap does? | Determines whether Customer360's Interaction History is complete for scoped roles or has the same page-sample limitation found elsewhere | Direct tracing of the materialization job's internal row-selection logic under a scoped role — not yet performed below the table/column level | No — DEC-CUST-01/DEC-CHAT-02 can proceed on current evidence; this would only refine understanding of Customer360's chat completeness |
| Which API route, if any, reads `customer_external_identities` (1 real row)? | Determines whether this table is live-but-unused or genuinely orphaned | A direct trace from the table through `src/server/` — not yet performed | No |
| What is the live row count and RLS state of the legacy WhatsApp Supabase project's `orchestrator_*` and `user_roles`-named tables (and the unrelated chat-trace/KB tables observed in the same generated types)? | Determines whether these historical definitions are current, live, and owned by any active system at all, which is a precondition for ever treating them as relevant to Call Centre scope | A live query against that project — this session's Supabase MCP tooling is scoped to the main project only | Yes — DEC-USER-01 and DEC-ORCH-01 are scope questions the owner can answer without this information (the current, verified Call Centre application has no such capability either way); this question only matters if the owner later wants to evaluate whether those historical objects are worth investigating further |

None of these are converted into product decisions; they remain open evidence questions.

---

## 11. No Decision Required Register

| Finding | Why No Decision Is Required |
|---|---|
| Dashboard | Phase 3: COMPLETE FOR CURRENT PURPOSE — no material gap found |
| Chat Console | Phase 3: COMPLETE FOR CURRENT PURPOSE |
| Customers (list) | Phase 3: COMPLETE FOR CURRENT PURPOSE |
| Initiate Call's core dialing path | Genuinely live end-to-end, including the documented upstream 200-on-failure fix. (Its one gap — the `call_sid` → Call Detail correlation, Gap ID LIVE-02 — is a real decision item, consolidated into DEC-CUST-03 in §12, not listed here) |
| Outbound Campaigns, Create Campaign, Campaign Configuration, Target Actions, Add Targets | Phase 3: COMPLETE FOR CURRENT PURPOSE for all five — no material gap found against stated purpose |
| Structured Agent Outcomes in Agent Result | Confirmed fully represented (`classifyStructuredOutputs` loops every real key) — no gap |
| Analytics (global voice aggregate) | Confirmed a correct, unmodified proxy of the external API with no Supabase aggregate possible for this path — nothing to decide |
| 5 fully implemented ratios (`fcr`, `escalation_rate`, `aht`, `resolution_rate`, `successful_resolution_time`) | Genuinely complete and correct at the individual-ratio level |
| WhatsApp Authenticate | Phase 3: COMPLETE FOR CURRENT PURPOSE — real, fully wired authentication gate |
| WhatsApp login-link generation | Confirmed generated in-repo by the `whatsapp-webhook` Edge Function (corrects a Phase 1 assumption) — fully exposed, no gap |

---

## 12. Phase 3 Gap → Decision traceability

| Decision ID | Phase 3 Gap IDs |
|---|---|
| DEC-CUST-01 | CUST-02, CUST-03 |
| DEC-CUST-02 | CUST-01 |
| DEC-CUST-03 | CUST-04, CHAT-03, LIVE-02 |
| DEC-CHAT-01 | CHAT-01, CHAT-02 |
| DEC-AGENT-01 | AGENT-01 |
| DEC-CAMP-01 | CAMP-01, CAMP-02 |
| DEC-WA-01 | WA-01, WA-03 |
| DEC-CHAT-02 | CUST-05, CHAT-04 |
| DEC-CALL-01 | CALL-01 |
| DEC-LIVE-01 | LIVE-01 |
| DEC-RATIO-01 | RATIO-01, RATIO-03 |
| DEC-WA-02 | WA-02 |
| DEC-CALL-02 | CALL-02, CALL-03, CALL-04, QA-01 |
| DEC-CHAT-03 | QA-02 |
| DEC-RATIO-02 | AN-01 (+ the 6 telemetry-dependent ratios noted qualitatively in Phase 2/3, not individually gap-ID'd) |
| DEC-AUTH-01 | (placeholder-module finding, not a gap-register row) |
| DEC-USER-01 | (placeholder-module finding, not a gap-register row) |
| DEC-NPS-01 | (placeholder-module finding, not a gap-register row) |
| DEC-ORCH-01 | (placeholder-module finding, not a gap-register row) |
| DEC-REPORT-01 | (placeholder-module finding, not a gap-register row) |
| DEC-SETTINGS-01 | (placeholder-module finding, not a gap-register row) |
| DEC-WA-03 | (architectural consolidation decision, not a gap-register row) |

Every Phase 3 Gap ID in the register (CUST-01–05, CALL-01–04, CHAT-01–04, CAMP-01–02, LIVE-01–02, QA-01–02, AN-01, RATIO-01–03, AGENT-01, WA-01–03 — 27 IDs in total) is accounted for above, either as a named decision or as an explicit note explaining its consolidation.

---

## 13. Owner Decision Worksheet

| Decision | DO NOW | KEEP FOR LATER | DO NOT NEED | EXTERNAL DEPENDENCY | Notes |
|---|---|---|---|---|---|
| DEC-CUST-01 — Customer360 aggregate/interaction field exposure | | | | | IMPLEMENTED (Session 13.1) |
| DEC-CUST-02 — Customer Activity/Diary | | | | | IMPLEMENTED (Session 13.1) — delete remains out of scope (no backend support) |
| DEC-CUST-03 — Customer navigation/relationship exposure | | | | | IMPLEMENTED (Session 13.1) |
| DEC-CHAT-01 — Chat Logs session-metadata exposure | | | | | IMPLEMENTED (Session 13.2) |
| DEC-AGENT-01 — Agent Contract exposure parity | | | | | IMPLEMENTED (Session 13.3) — Agent Detail + Initiate Call; Chat Console's limitation is EXTERNAL DEPENDENCY (real Chat API has no agent_inputs mechanism) |
| DEC-CAMP-01 — Campaign historical/configuration exposure | | | | | IMPLEMENTED (Session 13.4) — Legacy Result Rules portion exposed (confirmed still functionally active), not revived as the current model |
| DEC-WA-01 — WhatsApp/Formatting session-relationship exposure | | | | | |
| DEC-CHAT-02 — Chat→Customer360 materialization & per-turn metadata | | | | | Part A IMPLEMENTED; Part B application-path already correct / upstream unavailable (Session 13.2) |
| DEC-CALL-01 — Call mapper dropped fields | | | | | IMPLEMENTED (Session 13.2) |
| DEC-LIVE-01 — Live View interaction-detail consistency | | | | | IMPLEMENTED (Session 13.5) |
| DEC-RATIO-01 — Ratio Explorer data-correctness issues | | | | | IMPLEMENTED (Session 13.6) — DEC-RATIO-02 (16 backend-gap, 6 telemetry ratios) explicitly NOT touched |
| DEC-WA-02 — WhatsApp connection-status indicator | | | | | |
| DEC-CALL-02 — Voice API upstream capability gaps | | | | | |
| DEC-CHAT-03 — Chat API upstream capability gaps | | | | | |
| DEC-RATIO-02 — Ratio backend-data & telemetry dependencies | | | | | |
| DEC-AUTH-01 — Real Authentication scope | | | | | |
| DEC-USER-01 — User Management/RBAC scope | | | | | |
| DEC-NPS-01 — NPS scope | | | | | |
| DEC-ORCH-01 — Orchestrator scope | | | | | |
| DEC-REPORT-01 — Reports module scope | | | | | |
| DEC-SETTINGS-01 — Settings placeholder-tab scope | | | | | |
| DEC-WA-03 — Legacy WhatsApp Supabase consolidation scheduling | | | | | |

---

## Completion report

- **Phase 3 gaps considered:** 27 (all Gap IDs in the corrected Phase 3 register)
- **Consolidated owner decisions:** 22 total — 15 covering Decision Groups A–C (exposure/integration and upstream-dependency, consolidating the material gaps), 6 placeholder-module scope decisions (Group D), and 1 architectural consolidation decision (Group E). Groups A–C alone consolidate the gap-register rows into 15 decisions, within the audit's 12–18 guidance for gap consolidation; the 6 mandatory placeholder-scope cards and 1 consolidation card are additional per the prompt's explicit instruction to create one card each for those qualitatively distinct scope questions.
- **Placeholder-module scope decisions:** 6 (Authentication, User Management, NPS, Orchestrator, Reports, Settings)
- **External-dependency decisions:** 3 (DEC-CALL-02, DEC-CHAT-03, DEC-RATIO-02)
- **Findings moved to No Decision Required:** 10
- **Residual evidence questions:** 3
- **Document path:** `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`

No owner decision has been made in this document. No implementation planning has begun. **Stopping here** — the project owner (and, per this task's framing, the project owner together with ChatGPT) will make these decisions next.
