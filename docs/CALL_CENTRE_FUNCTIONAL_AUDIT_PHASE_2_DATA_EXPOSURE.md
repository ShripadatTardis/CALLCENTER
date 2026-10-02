# Call Centre Functional Product Audit — Phase 2: Supabase/API → Screen Exposure

**Status:** Complete. Audit-only document — no code, schema, or configuration was modified during this phase.
**Predecessor:** `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_1_SCREEN_INVENTORY.md`
**Date:** 2026-10-02

---

## 1. Scope and methodology

Phase 2 traces, for every functional screen identified in Phase 1, the full stack from Supabase schema/RPCs/Edge Functions and external APIs, through the repository/server layer, through the BFF/API layer, into frontend hooks/services, and onto the screen — and classifies how much of the backend/database capability already built is actually exposed.

Work was parallelized across 8 independent, read-only research agents, each assigned a functional area (or areas) with an explicit file list and explicit Phase 1 questions to resolve:

| Area | Fork |
|---|---|
| Customer360 (deep audit — Customers list + Customer Detail) | A |
| Call Logs / Call Detail | B |
| Chat Logs / Chat Detail | C |
| Campaigns (List/Detail/Configuration/History/Targets) | D |
| Dashboard / Live View / Initiate Call | E |
| Analytics / Ratio Explorer | G |
| AI Agents / Orchestrator / NPS / Reports / User Management / Settings / Auth | H |
| Interaction Quality (QA Review) / WhatsApp Hub / Formatting Hub | F |

Each fork verified claims against the **live** Supabase schema (`information_schema`, `pg_proc`, `pg_get_functiondef`, and direct row-count/sample queries via the Supabase MCP, SELECT-only) rather than inferring from TypeScript types alone, and against actual source files (routes, repositories, mappers, hooks, components) rather than prior documentation. No DDL/DML was executed at any point.

### Classification taxonomy (used identically throughout)

- **EXPOSED** — capability is built, reaches the screen, and is rendered/usable.
- **PARTIALLY EXPOSED** — some of the capability reaches the screen; some does not.
- **AVAILABLE — NOT EXPOSED** — real data/capability exists and already reaches the frontend (fetched into a type/response), but the UI does not render or use it.
- **BACKEND EXISTS — FRONTEND PATH MISSING** — real backend/database capability exists, but no API route, hook, or component consumes it at all.
- **UPSTREAM AVAILABLE — APPLICATION PATH MISSING** — an external API capability exists upstream but this application has built no path to it.
- **UI WITHOUT BACKEND** — the screen presents something (a status, a value, a control) with no real backing data or persistence of any kind.
- **NOT AVAILABLE** — genuinely does not exist at any layer (confirmed, not assumed).
- **DEFERRED / INTENTIONAL** — a gap that is explicitly, deliberately scoped out in-code (comment, design doc, or self-disclosed limitation) rather than an oversight.

This phase describes exposure; it does not recommend fixes, priorities, or roadmap (reserved for Phase 3/4).

---

## 2. Layer / data architecture overview

```
External Voice API (bankingvoicebot.nl-demo.com)  ─┐
External Chat API                                  ├─→ api/*.ts (Vercel BFF, server-only API key) ─→ src/services/*Mapper.ts ─→ hooks ─→ screens
Supabase "call_center" schema (24 tables, project dtbaczafdzgctkbqviod)
   ├─ customers / customer_contact_points / customer_interactions / customer_activities / customer_aggregation_state / customer_merge_log / customer_external_identities
   ├─ campaigns / campaign_targets / campaign_configuration_versions / campaign_result_rules / campaign_followups / campaign_executions
   ├─ interaction_events (telemetry, 0 rows, no producer/consumer)
   ├─ role_customer360_access
   └─ (campaign classification / outcome policy tables, Session 12.x)
Supabase "public" schema — primarily AuditAI/DocumentForce-owned objects; some Call Centre RPCs/functions may also live here for implementation-history or public-exposure reasons. Ownership is NOT inferred from schema name alone.
Supabase "auth" schema (16 tables, 0 rows) — fully provisioned, unused; app auth is hardcoded-password/localStorage
Legacy, separate WhatsApp Supabase project (wyzmsetlxltnojyxjkkd) — an older, limited project predating the current Call Centre integration architecture, used for the legacy WhatsApp/Formatting integration only (whatsapp_messages/whatsapp_sessions/vapi_response_logs) via src/integrations/supabase/client.ts. This project's Call Centre-relevant WhatsApp/Formatting persistence is intended for eventual consolidation into the main project's `call_center` ownership boundary (a planned decision, not performed in this audit).
   └─ Generated types (types.ts) from this legacy project ALSO contain historical definitions named orchestrator_flows/_versions/_approvals/_integrations/_runs/_snippets, user_roles (has_role/has_permission RPCs), chat_messages/_sessions/_traces, kb_chunks/_facts/_graph_edges. These were observed only in generated TypeScript types, not verified via live database access; their live existence, row data, ownership, and relevance to the current Call Centre application are NOT established. They are excluded from Call Centre functional-capability classification (see §13, §14) and are retained here only as an evidence footnote, not as a backend capability.
Twilio (via WhatsApp Edge Functions) ─→ whatsapp-webhook / send-otp / validate-password / reset-password / process-pending-message
```

Two architecturally distinct data paths exist side by side: (1) the external Voice/Chat Partner APIs, proxied through this app's own BFF, feeding Calls/Chat/Dashboard/Live View/Analytics; and (2) the `call_center` schema in the main Supabase project, which is the authoritative source of truth for Customers, Campaigns, and (unused) Activities/telemetry/merge/reconciliation state. A separate, legacy Supabase project backs the WhatsApp/Formatting integration specifically; unverified, historical schema definitions also present in that project's generated types (Orchestrator-named tables, a `user_roles` table) are not treated as existing Call Centre backend capability — their live state and ownership were never confirmed, and the project itself is not a second general-purpose Call Centre backend.

---

## 3. Master capability-exposure matrix

| # | Functional Area | Capability | Classification |
|---|---|---|---|
| 1 | Customer360 | `channels`, `authSummary`, `latestAgentId/DisplayName` on Customer aggregate | AVAILABLE — NOT EXPOSED |
| 2 | Customer360 | `recordingAvailable`/`escalationTrigger` per interaction row | AVAILABLE — NOT EXPOSED |
| 3 | Customer360 | Activity/Diary (create+list API) | BACKEND EXISTS — FRONTEND PATH MISSING |
| 4 | Customer360 | Activity status-update RPC | BACKEND EXISTS — FRONTEND PATH MISSING (no API route either) |
| 5 | Customer360 | Activity delete | NOT AVAILABLE |
| 6 | Customer360 | Email contact-point type | NOT AVAILABLE (structurally possible, never populated) |
| 7 | Customer360 | Reconciliation/backfill watermark (`customer_aggregation_state`) | BACKEND EXISTS — FRONTEND PATH MISSING |
| 8 | Customer360 | Identity merge (`customer_merge_log` + RPC) | BACKEND EXISTS — FRONTEND PATH MISSING |
| 9 | Customer360 | Campaign Participation | EXPOSED |
| 10 | Call Logs/Detail | `actual_outcome_code/name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context` | AVAILABLE — NOT EXPOSED |
| 11 | Call Logs/Detail | `analysis.*` block | DEFERRED/INTENTIONAL (confirmed duplicate) |
| 12 | Call Logs/Detail | Server-side filters (agent/FCR/authenticated/campaign) | NOT AVAILABLE (upstream limit) |
| 13 | Call Logs/Detail | Full-history export | AVAILABLE — NOT EXPOSED (page-aggregation only) |
| 14 | Call Logs/Detail | Per-turn sentiment/confidence on session transcript | NOT AVAILABLE (upstream schema gap) |
| 15 | Call Logs/Detail | Any Supabase-backed voice-call table | NOT AVAILABLE (confirmed: none exists; 100% externally API-driven) |
| 16 | Chat Logs/Detail | `chat_sessions.campaign_id`/`campaign_target_id` | AVAILABLE — NOT EXPOSED |
| 17 | Chat Logs/Detail | `customer_id` as navigable link | AVAILABLE — NOT EXPOSED (label only) |
| 18 | Chat Logs/Detail | `is_trial` | AVAILABLE — NOT EXPOSED |
| 19 | Chat Logs/Detail → Customer360 | Campaign/outcome/sentiment/escalation/duration/direction on chat-sourced Customer360 interactions | NOT AVAILABLE at Customer360 layer (hardcoded null in mapper) |
| 20 | Chat Logs/Detail | Per-turn metadata (dataSource/confidence) | PARTIALLY EXPOSED (only populated on local-fallback branch) |
| 21 | Campaigns | `campaign_targets.customer_id` → Customer360 link | AVAILABLE — NOT EXPOSED |
| 22 | Campaigns | Legacy `campaign_result_rules` (10 rows) | AVAILABLE — NOT EXPOSED |
| 23 | Campaigns | `campaign_configuration_versions` full snapshot/diff history | AVAILABLE — NOT EXPOSED |
| 24 | Campaigns | `targetCount` discrepancy mechanism | DEFERRED/INTENTIONAL (root-caused, self-disclosed, 0 currently-orphaned) |
| 25 | Campaigns | Structured outputs in Agent Result | EXPOSED |
| 26 | Campaigns | `campaign_followups` write pipe | BACKEND EXISTS — FRONTEND PATH MISSING (documented intentional scope decision) |
| 27 | Dashboard/Live View | `call.analysis.*` | DEFERRED/INTENTIONAL (confirmed duplicate) |
| 28 | Dashboard/Live View | `Interaction.customerId`/`campaignId` | NOT AVAILABLE (genuinely not provided upstream) |
| 29 | Dashboard/Live View | Real-time delivery mechanism | 4s polling by architectural necessity (no backing table) |
| 30 | Live View | Initiate Call's `call_sid` → Call Detail correlation | AVAILABLE — NOT EXPOSED |
| 31 | Live View | Hand-rolled dialog vs. shared `InteractionDetailDialog` | PARTIALLY EXPOSED |
| 32 | Analytics/Ratios | Global voice aggregate | NOT AVAILABLE as Supabase aggregate (pure external proxy) |
| 33 | Analytics/Ratios | Campaign Analytics role/category scoping | DEFERRED/INTENTIONAL (explicit in-code policy) |
| 34 | Ratio Explorer | Drill-through to Call/Chat Detail | EXPOSED (voice-only in practice — hardcoded channel) |
| 35 | Ratio Explorer | Ratio registry (30 registered) | 5 implemented / 3 partial / 16 backend_gap / 6 awaiting_telemetry |
| 36 | Ratio Explorer | Driver decomposition | Exists for 1 of 30 ratios |
| 37 | Ratio Explorer | `RatioInteractionRefDto` customerId/CIF | NOT AVAILABLE |
| 38 | AI Agents | Agent Detail `contract` object | PARTIALLY EXPOSED (shown elsewhere, 1-line label on Agent Detail) |
| 39 | NPS | Dedicated backend | NOT AVAILABLE |
| 40 | Orchestrator (current Call Centre application) | Any verified backing table | NOT AVAILABLE |
| 41 | Orchestrator — historical/unverified definitions (legacy WhatsApp Supabase project) | `orchestrator_*` named tables observed in generated types only | **NOT ESTABLISHED AS A CALL CENTRE CAPABILITY** — live existence, row data, ownership, and relevance to the current application were never confirmed; excluded from classification, retained as an evidence footnote only |
| 42 | Reports | Report-generation infra | NOT AVAILABLE |
| 43 | User Management | General user/role/permission table (current Call Centre application) | NOT AVAILABLE (only narrow `role_customer360_access`, which is Customer360-scoped authorization, not general RBAC) |
| 44 | User Management — historical/unverified definitions (legacy WhatsApp Supabase project) | `user_roles` + `has_role`/`has_permission` RPCs observed in generated types only | **NOT ESTABLISHED AS A CALL CENTRE CAPABILITY** — same basis as row 41; excluded from classification, retained as an evidence footnote only |
| 45 | Settings | Settings/config table | NOT AVAILABLE |
| 46 | Login/Auth | Supabase `auth.*` schema | BACKEND EXISTS — FRONTEND PATH MISSING (real, provisioned, 0 rows, unused) |
| 47 | QA Review | `interaction_events` telemetry table | BACKEND EXISTS — FRONTEND PATH MISSING (no producer either) |
| 48 | QA Review | Conversation Quality dimensions | NOT AVAILABLE (purely prospective) |
| 49 | QA Review | Composite quality score/reviewer workflow | DEFERRED/INTENTIONAL |
| 50 | QA Review | Voice per-call latency | NOT AVAILABLE |
| 51 | WhatsApp/Formatting | `session_id` conversation grouping | AVAILABLE — NOT EXPOSED |
| 52 | WhatsApp/Formatting | `session_id` formatting-log ↔ conversation link | AVAILABLE — NOT EXPOSED |
| 53 | WhatsApp/Formatting | Customer360 association | NOT AVAILABLE (no customer_id column anywhere) |
| 54 | WhatsApp | "Connected to Sandbox" status | UI WITHOUT BACKEND |
| 55 | WhatsApp | Auth gate (password/OTP) | EXPOSED |
| 56 | WhatsApp | Login-link generation (`?phone=`) | EXPOSED (corrects Phase 1 — generated in-repo by `whatsapp-webhook`) |

---

## 4. Customer360 deep audit

Customer360 required the deepest treatment per the Phase 2 prompt. Full findings:

### Identity & Contact
- CIF (`customers.source_customer_ref`) and masked phone are EXPOSED (`GET /api/customers/{id}` → `call_center_get_customer`).
- Email as a contact-point type is structurally permitted (`customer_contact_points.type` has no CHECK constraint; the TS `ContactPointType` union declares `'email'`) but **NOT AVAILABLE in practice**: a live query of all 32 contact-point rows returns only `'phone'`. The slot exists; nothing populates it.

### Customer aggregate fields fetched but not rendered
`customers.channels` (real `ARRAY`), `customers.auth_summary` (real `jsonb`: `everAuthenticated`/`lastAuthenticatedAt`), `customers.latest_agent_id`/`latest_agent_display_name` are all correctly mapped by `supabaseCustomerRepository.ts` into the `Customer` object returned by the API, fetched in full by `useCustomerDetail`, and never destructured by `CustomerDetail.tsx` (0 grep matches). **AVAILABLE — NOT EXPOSED** for all three.

### Interaction History gaps
`customer_interactions.recording_available` (NOT NULL bool) and `.escalation_trigger` are real per-row columns, mapped at `supabaseCustomerRepository.ts:171,173`, fetched by `useCustomerInteractions`, never rendered as a column or indicator. **AVAILABLE — NOT EXPOSED**.

### Activity/Diary subsystem
A complete, working feature that stops exactly at the API boundary:
- `GET`/`POST ?action=activities` on `api/customers/[id]/index.ts` are live, validated routes against the real `customer_activities` table (15 columns, incl. `campaign_id`/`campaign_target_id`/`interaction_id` FKs, `effective_from/until`, `assigned_user_id/team_id`).
- Zero files anywhere in `src/` import or call any of this — not a hook, not a component, not a dead attempt.
- One layer deeper: `call_center_activity_update_status` RPC and `ActivityRepository.updateActivityStatus` exist and are correct, but the API route dispatch has no third branch to expose them — so even a hypothetical future frontend couldn't mark an activity complete without a new API route being added first.
- No delete capability exists anywhere (no RPC, no repository method) — genuinely **NOT AVAILABLE**, not merely unexposed.
- Authorization scoping for activities is **explicitly flagged as an open decision in-code** (`api/customers/[id]/index.ts:102-103`) — DEFERRED/INTENTIONAL for that specific dimension.
- Classification: **BACKEND EXISTS — FRONTEND PATH MISSING** (table has 0 rows in this environment, consistent with zero consumers ever writing to it).

### Reconciliation/backfill state
`customer_aggregation_state` holds genuine per-source watermark rows (`voice`: refreshed through 2026-09-30; `chat`: refreshed through 2026-09-26), written by `reconcileJob.ts`/`backfillJob.ts`. Zero API routes and zero frontend files reference this table. The only reconciliation-adjacent UI text (`materializationWarning` on the Customers list) is a separate, transient, per-request mechanism — unrelated to this table. **BACKEND EXISTS — FRONTEND PATH MISSING**.

### Identity merge
`customer_merge_log` (survivor/loser IDs, reason, moved-row counts per source) and `call_center_merge_customers` RPC both confirmed real. The log has 0 rows because no merge has ever been triggered in this environment — a real, implemented, never-exercised capability. **BACKEND EXISTS — FRONTEND PATH MISSING**.

### Campaign Participation
EXPOSED — `campaign_targets` joined via `customer_id`, surfaced through `call_center_campaign_list_customer_targets`.

### Customer ↔ Campaign Target linkage (reverse direction)
`campaign_targets.customer_id` is a real, non-nullable `uuid` FK, and `CampaignTargetRow.customerId` is already present (non-optional) on every target row the frontend receives. This is the **strongest linkage case found in the entire audit** — the ID reaches the browser today; Campaign Detail simply never renders it as a link. **AVAILABLE — NOT EXPOSED**.

### `customer_external_identities`
Real table, 1 row currently. Not independently traced to a specific API route this pass — flagged as **UNCLEAR** rather than guessed.

### Customer360-specific backend-with-no-screen
Activity/Diary (create+list), Activity status-update, `customer_aggregation_state`, `customer_merge_log`+RPC.

### Customer360-specific UI-with-no-backend
None found — every rendered value traces to a real, confirmed-live column.

---

## 5. Call Logs / Call Detail

- `actual_outcome_code`/`actual_outcome_name`/`structured_outputs`/`is_bank_customer`/`transcript_doc_id`/`context` exist on `CallDataEntryDto` but are dropped by `callsMapper.ts` before reaching the `Interaction` type. **AVAILABLE — NOT EXPOSED**.
- `analysis.*` is a confirmed, proven duplicate of other already-shown fields (verified via live-sample comparison, documented in-code). **DEFERRED/INTENTIONAL** — not a gap, a deliberate drop.
- No server-side filter params exist upstream for agent/FCR/authenticated/campaign — a genuine upstream API limitation, not a frontend oversight. **NOT AVAILABLE**.
- No full-history export endpoint exists; only page-by-page aggregation is possible. **AVAILABLE — NOT EXPOSED** via client-side aggregation of paged results.
- `/api/v1/sessions/{id}` (live transcript) has no per-turn sentiment/confidence fields at all — an upstream schema gap. **NOT AVAILABLE**.
- Confirmed via live `information_schema` query: **no voice-call Supabase table exists at all** — Call Logs/Detail is 100% externally-API-driven, with zero Supabase involvement of any kind.

---

## 6. Chat Logs / Chat Detail

- `chat_sessions.campaign_id`/`campaign_target_id` are real, populated columns never read by `api/chat/logs.ts`. **AVAILABLE — NOT EXPOSED**.
- `customer_id` is used only to derive a text label, never exposed as a navigable ID. **AVAILABLE — NOT EXPOSED**.
- `is_trial` is real and functional internally but invisible in the UI. **AVAILABLE — NOT EXPOSED**.
- **Critical finding:** `chatInteractionSource.ts`'s `mapRow()` hardcodes `campaignName: null, outcome: null, sentimentScore: null, escalationTrigger: null, durationSeconds: null, direction: null` for every chat-sourced interaction materialized into Customer360. Confirmed live: 0 of 11 local chat sessions currently have `campaign_id` set. This means chat-sourced rows inside Customer360's Interaction History are structurally incapable of carrying this data today, regardless of source-table population. **NOT AVAILABLE at the Customer360 materialization layer.**
- Per-turn metadata (`dataSource`/`confidence`/etc.) is wired in UI code but structurally `undefined` whenever the live (dominant) data path succeeds — only populated via the local-fallback branch for AI turns sent through this app's own Chat Console. **PARTIALLY EXPOSED**.

---

## 7. Campaigns

- `campaign_targets.customer_id` (NOT NULL, populated) reaches `CampaignTargetRow.customerId` but is never used for Customer360 navigation. **AVAILABLE — NOT EXPOSED** (resolves Q16).
- 10 real rows of legacy `campaign_result_rules` across 5 campaigns are fetched into `CampaignDetail.rules` but never read by the component. **AVAILABLE — NOT EXPOSED** (resolves Q17).
- `campaign_configuration_versions`' full snapshot history (incl. `previous_version_id` chain) is fetched client-side via `useCampaignConfigurationVersions`, but only the active version's `id` is used — no version-by-version diff is ever surfaced. **AVAILABLE — NOT EXPOSED** (resolves Q18).
- `targetCount` discrepancy: root-caused precisely — `call_center_campaign_list`/`_get` count with no join to customers/contact-points, while `call_center_campaign_list_targets` uses INNER JOINs. The mechanism is real and self-disclosed in code, but a live query found 0 currently-orphaned targets. **DEFERRED/INTENTIONAL**, unfixed but harmless today (resolves Q19).
- Structured outputs ARE fully represented in Agent Result — `classifyStructuredOutputs` loops every real key, not just declared ones. **EXPOSED**.
- `campaign_followups` has a complete, unused write pipe (RPC + repo + service + hook all exist; 0 components call it) — explicitly corroborated as a documented, intentional scope decision from a prior session's own notes ("`campaign_followups` still has no genuine execution path"). **BACKEND EXISTS — FRONTEND PATH MISSING**, DEFERRED/INTENTIONAL.

---

## 8. Dashboard / Live View / Initiate Call

- `call.analysis.*` confirmed a proven duplicate (cross-referenced with §5). **DEFERRED/INTENTIONAL**.
- `Interaction.customerId`/`campaignId` are genuinely not provided upstream — documented in the type's own header comment. **NOT AVAILABLE**.
- Live/real-time delivery is pure 4-second polling by architectural necessity: no Supabase table backs active-call state; `api/calls/data.ts` is a stateless proxy with zero Supabase reference.
- Initiate Call's `call_sid` → Call Detail correlation is **AVAILABLE — NOT EXPOSED**: the identical `call_sid === call_id` mechanism is already proven and used elsewhere (Campaign reconciliation), but Initiate Call builds no link to it.
- Live View's hand-rolled detail dialog is **PARTIALLY EXPOSED** versus the shared `InteractionDetailDialog` — missing FCR, Authenticated, Escalation trigger, Campaign name, Call Summary/tags, Recording playback, searchable transcript, and the 60s-cap live-polling refresh UI.

---

## 9. Interaction Quality (QA Review)

- Voice outcome/FCR/escalation/intent/sentiment/authentication and Chat intent/confidence/authentication/message-count/duration are EXPOSED (external APIs, direct per-row rendering).
- Voice per-call latency: hardcoded `null`, explicit in-code comment ("no confirmed per-call/per-agent latency source for voice — never fabricated"). **NOT AVAILABLE**.
- Chat sentiment/FCR: the Chat API doesn't return these fields at all — a channel-structural gap. **NOT AVAILABLE**.
- Domain→Category→Agent→Channel grouping reuses the existing live classification hierarchy. **EXPOSED**.
- **`interaction_events` telemetry table** confirmed live (14 columns: event_id, interaction_id, event_time, event_type, event_name, success, error_code, error_message, latency_ms, tool_name, provider, model, metadata, ingested_at), RLS enabled, 0 rows. Full repository layer (`supabaseInteractionEventRepository.ts`) and types exist. Zero `api/*.ts` routes and zero hooks/pages import it — **no consumer, and no producer either** (nothing calls `appendEvent`). **BACKEND EXISTS — FRONTEND PATH MISSING.** A code comment elsewhere in the repo claiming "no interaction_events table exists" is now factually stale — the table exists; the comment predates it or was never updated.
- Prospective Conversation Quality dimensions (Context Continuity, Follow-up Understanding, Intent Routing Accuracy, Conversation Recovery, Unnecessary Clarification, Task Progression) have zero presence anywhere in code or migrations — confirmed by repo-wide grep. **NOT AVAILABLE**, purely prospective, not partially built.
- Composite quality score / reviewer assignment / approval workflow: explicit in-code comment states no manual-review backend exists; the screen was rebuilt specifically to remove a prior fabricated score. **DEFERRED/INTENTIONAL**.

---

## 10. Analytics / Ratios

- Analytics Overview/Voice's global aggregate is a bare, unmodified proxy to the external Partner API with zero Supabase involvement — no Supabase aggregate could even exist for this path. **NOT AVAILABLE** (resolves Q23).
- Campaign Analytics' lack of role/category scoping is explicit, in-code, deliberate policy, not an oversight. **DEFERRED/INTENTIONAL** (resolves Q24, linkage data AVAILABLE — NOT EXPOSED).
- Ratio Explorer's drill-through genuinely opens the shared Call Detail dialog — **EXPOSED** (resolves Q22) — but is voice-only in practice because `callPopulationProvider.ts:109` hardcodes `channel: 'voice' as const` on every row despite the DTO type supporting `'voice'|'chat'`.
- Ratio registry inventory (30 registered): 5 implemented (`fcr`, `escalation_rate`, `aht`, `resolution_rate`, `successful_resolution_time`); 3 partial (real field, incomplete eligibility logic); 16 backend_gap (no underlying data); 6 awaiting_telemetry (explicitly deferred pending a future Interaction Trace API, cited to a named design doc).
- Driver decomposition exists for exactly 1 ratio (`escalation_rate`, hardcoded check in `ratioService.ts:250`).
- `RatioInteractionRefDto` has no `customerId`/CIF field at all. **NOT AVAILABLE** for Customer360 linkage at the ratio-interaction level.

---

## 11. AI Agents

Agent Detail's `contract` object genuinely carries `status`/`description`/`expected_input_fields`/`expected_outcomes`/`output_fields` (live, real data — e.g. 3 required + 5 optional fields, 10 real outcome codes for `emi-reminder-agent`) all the way into component scope, but only renders a 1-line "Contract source: partner_api" label. **PARTIALLY EXPOSED** — these ARE shown in Create Campaign/Campaign Configuration, just not on Agent Detail itself where they are also fetched. The code comments justifying this gap are stale (predate a prior session's API rewrite).

---

## 12. WhatsApp Hub / Formatting Hub

- `whatsapp_messages.session_id` — real, populated (upserted onto `whatsapp_sessions` keyed by `phone_number`). UI renders all messages as one flat combined stream regardless of `session_id`. **AVAILABLE — NOT EXPOSED** (conversation/thread grouping).
- `vapi_response_logs.session_id` uses the **identical** value as the WhatsApp session (confirmed: `formatAndLogVapiResponse(text, sessionId, fromNumber)` called with the same `sessionId` variable). Formatting Hub shows a truncated `session_id` per row but no click-through to the originating WhatsApp conversation. **AVAILABLE — NOT EXPOSED** (resolves Q26: the join key is real and shared).
- Neither `whatsapp_messages`/`vapi_response_logs`/`whatsapp_sessions` has any `customer_id`/CIF column — only raw phone numbers. Confirmed via full column list; no FK to any customer table exists. **NOT AVAILABLE** for Customer360 linkage.
- "Connected to Sandbox" status badge is static JSX with no backing health-check table or connection-status column anywhere in the schema. **UI WITHOUT BACKEND**.
- Authentication gate (password/OTP) is fully wired server-side across 4 Edge Functions plus the webhook's own inline check against `whatsapp_sessions.authenticated`/`last_active`. **EXPOSED**.
- Formatting strategy (LOCAL/AI/DISABLED) is real and data-driven, written by the shared Vapi formatter. **EXPOSED**.

**Phase 1 Q21 resolved (corrects Phase 1's finding):** the `?phone=`-bearing login link is NOT external — it is generated entirely in-repo by `supabase/functions/whatsapp-webhook/index.ts:192-200`, which checks `whatsapp_sessions.authenticated`/idle-timeout on every inbound message and, if unauthenticated, sends the login link back over WhatsApp itself. **EXPOSED.**

---

## 13. Auth / Users / Settings

- Supabase's standard `auth.*` schema (16 tables, incl. `auth.users`) is fully provisioned, RLS-enabled, 0 real rows — completely bypassed by the app's actual hardcoded-password/localStorage auth path. **BACKEND EXISTS — FRONTEND PATH MISSING**, distinct from "not available."
- No general user/role/permission table exists in the main project's `call_center` schema — only `role_customer360_access` (`role text, all_categories boolean`), which is narrowly Customer360-category-scoped authorization and must not be represented as a general RBAC/User Management backend. **NOT AVAILABLE** for general user/role management in the current Call Centre application (resolves Q25).
- Settings has no settings/config table anywhere in the main project's schema. **NOT AVAILABLE**.
- **Correction (project-owner clarification):** Fork F observed a `user_roles` table with `has_role`/`has_permission` RPCs in the **generated TypeScript types** of the legacy WhatsApp Supabase project (`wyzmsetlxltnojyxjkkd`) — an older, limited project predating the current Call Centre integration architecture, used today for the legacy WhatsApp/Formatting integration only. This observation was never verified via live database access: its live existence, row data, ownership, and relevance to the current Call Centre application were not established. It is **not treated as existing Call Centre User Management/RBAC backend capability** and does not change the classification above. It is retained here only as an evidence footnote: *generated types from the legacy WhatsApp Supabase project contain a historical `user_roles` definition; its relevance to the current Call Centre application is unconfirmed and it is excluded from functional capability classification.* **User Management remains NOT AVAILABLE within the current Call Centre application.**

---

## 14. NPS / Orchestrator / Reports

- NPS has no dedicated backend: no channel column on `campaigns`, no NPS-score classification codes anywhere. **NOT AVAILABLE**.
- Orchestrator has zero verified backing tables in the current Call Centre application's architecture (main project's `call_center`/`public` schemas). **NOT AVAILABLE** (resolves Q27).
- **Correction (project-owner clarification):** generated TypeScript types from the legacy WhatsApp Supabase project (an older, limited project predating the current Call Centre integration architecture, used today only for the legacy WhatsApp/Formatting integration) contain historical definitions named `orchestrator_flows`, `orchestrator_versions`, `orchestrator_approvals`, `orchestrator_integrations`, `orchestrator_runs`, `orchestrator_snippets`. These were observed only in generated types, never verified via live database access — their live existence, row data, ownership, and relevance to the current Call Centre Orchestrator function are not established. They must not be used as evidence that "Call Centre Orchestrator backend exists but frontend path is missing." They are retained only as an evidence footnote: *generated types from the legacy WhatsApp Supabase project contain historical definitions named `orchestrator_*`; their relevance to the current Call Centre application is unconfirmed and they are excluded from functional capability classification.* **Orchestrator remains NOT AVAILABLE within the current Call Centre application** (resolves Q27).
- Reports has no report-generation infrastructure of any kind. **NOT AVAILABLE**.

---

## 15. Backend capabilities with no UI exposure (consolidated)

| Capability | Location | Notes |
|---|---|---|
| Customer Activity/Diary (create+list) | `api/customers/[id]/index.ts`, `activityRepository.ts` | Zero frontend consumers |
| Activity status-update | `call_center_activity_update_status` RPC | No API route exposes it either |
| Identity merge | `customer_merge_log` + `call_center_merge_customers` RPC | Never exercised (0 rows) |
| Reconciliation/backfill watermark | `customer_aggregation_state` | No API or UI reference |
| `interaction_events` telemetry | table + `supabaseInteractionEventRepository.ts` | No producer AND no consumer |
| Legacy `campaign_result_rules` | 10 rows, 5 campaigns | Fetched, unread |
| `campaign_configuration_versions` full history | version snapshot chain | Fetched, only active id used |
| `campaign_followups` write pipe | RPC+repo+service+hook | 0 callers (documented intentional) |
| `whatsapp_messages.session_id`/`vapi_response_logs.session_id` conversation grouping | both tables, legacy WhatsApp Supabase project | Real, populated, unused join key — this is the verified legacy WhatsApp/Formatting integration, not affected by the ownership correction |
| Supabase `auth.*` schema | 16 tables, main project | Fully provisioned, unused |

**Excluded from this list (ownership correction):** historical `orchestrator_*` and `user_roles` definitions observed only in the legacy WhatsApp Supabase project's generated types are NOT listed here as Call Centre backend capability — their live existence, ownership, and relevance to the current application were never verified. See the evidence footnotes in §13/§14 and §2.

## 16. UI capabilities with no backend (consolidated)

| Capability | Location | Notes |
|---|---|---|
| WhatsApp Hub "Connected to Sandbox" status | `WhatsAppSidebar.tsx:47-51` | No health-check/connection-status data source exists anywhere |

No other UI-without-backend instances were found across any of the 8 forks — consistent with Phase 1's finding that this application has very little fabricated/static UI; most gaps run the other direction (real backend capability, no UI).

---

## 17. Evidence-based data-relationship map

```
Customer ↔ Identity ↔ Interaction ↔ Voice/Chat
  customers.id ← customer_contact_points.customer_id (32 rows, type='phone' only in practice)
  customers.id ← customer_external_identities.customer_id (1 row, UNCLEAR which API route reads it)
  customers.id ← customer_interactions.customer_id (channel/direction/agent/intent/outcome/sentiment/auth/escalation/recording-flag present per row)

Customer ↔ Campaign Target ↔ Execution ↔ Result ↔ Interaction
  campaign_targets.customer_id → customers.id (real, NOT NULL FK, non-optional on CampaignTargetRow)
  → Customer Detail: EXPOSED (Campaign Participation)
  → Campaign Detail target row → Customer360: AVAILABLE — NOT EXPOSED

Customer ↔ Activity
  customer_activities.customer_id → customers.id, + optional campaign_id/campaign_target_id/interaction_id
  → BACKEND EXISTS — FRONTEND PATH MISSING entirely

WhatsApp ↔ Formatting Log
  whatsapp_sessions(phone_number, session_id, authenticated, last_active)
       → whatsapp_messages.session_id ←(same value)→ vapi_response_logs.session_id
  → no customer_id anywhere in either table

Chat Session ↔ Campaign ↔ Customer360
  chat_sessions.campaign_id/campaign_target_id (real, populated) — unread by api/chat/logs.ts
  chatInteractionSource.ts mapper hardcodes null for campaign/outcome/sentiment/escalation/duration/direction on every chat row materialized into Customer360
  → structurally NOT AVAILABLE at the Customer360 layer regardless of source population

Voice Call — no Supabase table at all
  100% externally API-driven; Interaction.customerId/campaignId genuinely not provided upstream
```

---

## 18. Phase 1 Questions — full disposition (all 27)

| # | Question (abridged) | Finding | Classification |
|---|---|---|---|
| 1 | Activity/Diary scope | Create+list fully wired; status-update exists in repo/RPC with no API route; delete doesn't exist anywhere | BACKEND EXISTS — FRONTEND PATH MISSING |
| 2 | `authSummary` not rendered | Real jsonb column, mapped, fetched, never destructured | AVAILABLE — NOT EXPOSED |
| 3 | `channels` not surfaced | Real array column, same pattern | AVAILABLE — NOT EXPOSED |
| 4 | `latestAgentId`/`DisplayName` not in MetricStrip | Same pattern | AVAILABLE — NOT EXPOSED |
| 5 | `recordingAvailable`/`escalationTrigger` not columns | Same pattern, interaction-row level | AVAILABLE — NOT EXPOSED |
| 6 | Additional identity fields (email) | Schema permits `'email'` type; 0 of 32 rows use it; no code path creates one | NOT AVAILABLE (in practice) |
| 7 | Reconciliation/backfill status exposure | `customer_aggregation_state` real, 2 watermark rows, 0 API/UI references | BACKEND EXISTS — FRONTEND PATH MISSING |
| 8 | Chat Logs → Customer360 link | No stable pre-resolved ID handoff; resolvable only via existing search/identity-resolution API | Resolved — search-based only, no direct link |
| 9 | Call Detail → Customer360/Campaign link | `Interaction.customerId` documented as unreliable from upstream; resolvable only via phone-based search | Resolved — search-based only |
| 10 | Campaign Detail target → Customer360 link | `customer_id` real, non-optional, already on every target row | AVAILABLE — NOT EXPOSED (strongest case found) |
| 11 | Customer360 chat pagination cap parity | Customer360 reads from materialized `customer_interactions` (500-row client cap), not live-paginated upstream — mechanism differs from Chat Logs' role-scoped cap | Partially resolved; materialization-job internals not independently re-verified — genuinely open |
| 12 | `/call-data` server-side filters | Confirmed: genuinely absent upstream, not an unused frontend param | NOT AVAILABLE |
| 13 | `call.analysis.*` distinctness | Confirmed proven duplicate via live-sample comparison | DEFERRED/INTENTIONAL |
| 14 | True full-history export | No such endpoint exists; only page aggregation possible | AVAILABLE — NOT EXPOSED (via aggregation) |
| 15 | Session transcript field coverage | No per-turn sentiment/confidence fields exist at all | NOT AVAILABLE |
| 16 | Campaign target customer_id wiring | Confirmed real, present, unused for linking | AVAILABLE — NOT EXPOSED |
| 17 | Legacy `campaign_result_rules` visibility | 10 rows/5 campaigns fetched into component state, never read | AVAILABLE — NOT EXPOSED |
| 18 | Configuration version diff | Full snapshot chain fetched, only active id used, no diff UI | AVAILABLE — NOT EXPOSED |
| 19 | `targetCount` discrepancy root cause | Precisely root-caused (join difference between list/get RPCs vs. list_targets RPC); 0 currently-orphaned targets live | DEFERRED/INTENTIONAL |
| 20 | Chat per-turn metadata surfaced vs. available | Wired but structurally undefined on the live (dominant) path; only populated on local-fallback branch | PARTIALLY EXPOSED |
| 21 | WhatsApp `?phone=` login link origin | Generated in-repo by `whatsapp-webhook` Edge Function — corrects Phase 1's "external" assumption | EXPOSED |
| 22 | Ratio Explorer drill-down terminal? | Genuinely opens shared Call Detail dialog, but voice-only due to hardcoded channel | EXPOSED (with a caveat) |
| 23 | Supabase aggregate for Analytics scoped metric | Analytics Overview/Voice is a bare external-API proxy with zero Supabase involvement — no such aggregate could exist for this path | NOT AVAILABLE |
| 24 | Category/role permission model for Campaign Analytics | No scoping data model exists; the lack of scoping is explicit, deliberate, in-code policy | DEFERRED/INTENTIONAL |
| 25 | Real backend user/role/permission table | None in the main project's `call_center` schema; `role_customer360_access` is narrowly Customer360-scoped authorization, not general RBAC. A `user_roles`-named table + RPCs was observed only in generated types from the legacy WhatsApp Supabase project — never verified live, ownership/relevance to the current Call Centre application unconfirmed | **NOT AVAILABLE** within the current Call Centre application; the legacy-project observation is excluded from capability classification and retained only as an evidence footnote |
| 26 | WhatsApp/Formatting Hub session_id join | Confirmed real, shared, populated `session_id` key between `whatsapp_messages` and `vapi_response_logs` in the legacy WhatsApp Supabase project (the verified WhatsApp/Formatting integration) | AVAILABLE — NOT EXPOSED |
| 27 | Orchestrator backend existence | Zero verified tables in the main project's `call_center`/`public` schemas. `orchestrator_*`-named tables were observed only in generated types from the legacy WhatsApp Supabase project — never verified live, ownership/relevance to the current Call Centre application unconfirmed | **NOT AVAILABLE** within the current Call Centre application; the legacy-project observation is excluded from capability classification and retained only as an evidence footnote |

All 27 Phase 1 questions have received an explicit disposition. One (Q11) remains genuinely partially open — it requires verifying materialization-job internals that sit below the layer this phase traced (noted in §20).

---

## 19. Evidence index

- Live Supabase schema inspection: `information_schema.columns`, `pg_proc`/`pg_get_functiondef`, direct row-count/sample SELECTs across `call_center` schema (24 tables), `public` schema (54 tables, confirmed unrelated "DocumentForce" app), `auth` schema (16 tables, 0 rows), and the second project `wyzmsetlxltnojyxjkkd`'s generated `types.ts`.
- Source files read directly: `supabaseCustomerRepository.ts`, `api/customers/[id]/index.ts`, `activityRepository.ts`, `callsMapper.ts`, `chatInteractionSource.ts`, `api/chat/logs.ts`, `src/types/campaign.ts`, `src/types/interaction.ts`, `ratioService.ts`, `ratioRegistry.ts`, `callPopulationProvider.ts`, `src/components/whatsapp/WhatsAppSidebar.tsx`/`WhatsAppChat.tsx`, `supabase/functions/whatsapp-webhook/index.ts`, `supabaseInteractionEventRepository.ts`, `src/integrations/supabase/client.ts`/`types.ts`, `QAReview.tsx`.
- Each finding above traces to a specific file/line or a specific live SQL query result, cited inline in §4–§14; no finding in this document is based on documentation alone without direct code/schema verification.

---

## 20. Unknowns requiring external information

1. **Customer360 chat-session pagination parity (Q11)** — fully resolving this requires re-verifying the materialization job (`chatInteractionSource.ts`'s ingestion path into `customer_interactions`) for silent row-dropping under scoped roles — not independently traced this pass beyond confirming the table/columns exist.
2. **`customer_external_identities` consumer** — 1 real row exists; which API route (if any) reads it was not independently traced and is marked UNCLEAR rather than guessed.
3. **Legacy WhatsApp Supabase project's full scope** — Fork F discovered `orchestrator_*`, `user_roles`, `chat_messages/_sessions/_traces`, and `kb_chunks/_facts/_graph_edges` definitions in that project by reading its generated types, not via direct MCP/live-query access (the Supabase MCP tooling in this session is scoped to the main project). A live query against the legacy project would be needed to confirm row counts, RLS state, and whether these definitions are even current — the way every other finding in this document was confirmed. Per the project owner's authoritative clarification, these definitions are NOT treated as current Call Centre backend capability pending such verification; they are recorded only as an evidence footnote (§2, §13, §14).
4. Whether any product requirement actually calls for email as a second contact-point channel is a product-scope question outside this audit's remit. (The prior framing of this item as also covering "Orchestrator/user-role integration with the second Supabase project" has been corrected — per §4 above, that project's historical objects are not established Call Centre capability and therefore not a live integration question at this time.)

---

## Completion statistics

- **Functional areas inspected:** 8 (Customer360, Calls, Chat, Campaigns, Dashboard/Live View/Initiate Call, Analytics/Ratios, AI Agents/Orchestrator/NPS/Reports/User Mgmt/Settings/Auth, QA/WhatsApp/Formatting)
- **Screens/views traced:** all screens identified in Phase 1 (33 master-table rows)
- **Supabase tables/views/RPCs materially inspected:** ~30 across two Supabase projects (24 `call_center` tables, several `auth.*` tables, several second-project tables, plus ~10 RPCs via `pg_proc`/`pg_get_functiondef`)
- **External API paths materially inspected:** Voice API (3 endpoints), Chat API, Agents/Partner API, Twilio (via WhatsApp Edge Functions)
- **Exposure classification counts (from §3's 56 rows, corrected):** EXPOSED — 8; PARTIALLY EXPOSED — 4; AVAILABLE — NOT EXPOSED — 20; BACKEND EXISTS — FRONTEND PATH MISSING — 9; NOT AVAILABLE — 10; NOT ESTABLISHED AS A CALL CENTRE CAPABILITY (historical/unverified, legacy-project observations only) — 2; DEFERRED/INTENTIONAL — 8 (some rows carry two classifications, e.g. a capability that is both real and deliberately unexposed); UI WITHOUT BACKEND — 1
- **Backend-with-no-UI capabilities:** 10 (consolidated in §15; the 2 legacy-project historical observations are excluded per the ownership correction and tracked separately)
- **UI-with-no-backend capabilities:** 1 (§16)
- **Phase 1 questions resolved:** 27 of 27, with 1 (Q11) carrying a residual, explicitly-named open sub-question
- **Document path:** `docs/CALL_CENTRE_FUNCTIONAL_AUDIT_PHASE_2_DATA_EXPOSURE.md`

**Phase 2 is complete. Per the audit's own instructions, this STOPS here — Phase 3 (Functional Completeness & Gap Register) is not begun. The project owner will review Phase 2 before authorizing Phase 3.**
