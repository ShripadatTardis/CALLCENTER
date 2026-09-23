# Call Centre — Full Functional & Technical Scope

**Phase:** 3 — Complete functional and technical scope analysis. No code was changed producing this document; mock data remains in place (it is used throughout as a source for understanding intended functionality, per instruction). This builds on `docs/CALL_CENTRE_BASELINE_AUDIT.md` (Phase 1) and `docs/CALL_CENTRE_LIVE_INTEGRATION_PLAN.md` (Phase 2).

**Date:** 2026-09-22

**Correction carried from this phase's brief:** the Voice Agent / Call Centre backend is **multi-domain**, not banking-only. The banking names/examples in the 3 reference API documents (Trigger Call, Session Transcript, Call Data) are examples from the current deployment, not an architectural ceiling. Phase 2's plan treated the backend as banking-only — that assumption is superseded here. The frontend architecture and service layer are designed domain-neutral throughout this document; nothing here fabricates data or endpoints for other domains — where a domain-specific capability isn't evidenced by the reference docs, it's marked as a gap/decision, not assumed.

---

## 1. Product Objective

Convert the existing Lovable-built Call Centre application from a fully mock/simulated demo into a live, multi-domain, extensible product: every screen backed by real data and real actions against the Voice Agent / Call Centre backend (and, where already live, Supabase/Twilio for WhatsApp), with an architecture that lets new modules and domains be added without ad-hoc API calls inside page components.

This phase's job is to produce the complete blueprint for that conversion — not to build it.

---

## 2. Functional Module Inventory

Grouping the routed pages from the baseline audit into 16 functional modules, per the prompt's example grouping:

| # | Module | Routes / components |
|---|---|---|
| 1 | Authentication | `/`, `/whatsapp-authenticate`; `AuthContext`, `ProtectedRoute` |
| 2 | Dashboard | `/dashboard` |
| 3 | Initiate Call | `/initiate-call` |
| 4 | Call Logs / Call Detail / Transcript | `/call-logs` (+ `TranscriptViewer`) |
| 5 | Live View | `/live-view` |
| 6 | Outbound Campaigns / Create Campaign | `/outbound-campaigns`, `/outbound-campaigns/create` |
| 7 | NPS Campaigns | `/nps-campaigns` |
| 8 | QA Review | `/qa-review` |
| 9 | WhatsApp | `/whatsapp-hub` (+ `/whatsapp-authenticate` shares this domain) |
| 10 | Formatting Hub | `/formatting-hub` |
| 11 | AI Agents | `/ai-agents` (hidden from nav, routable) |
| 12 | Orchestrator | `/orchestrator`, `/orchestrator/new`, `/orchestrator/flow/:flowId`, `/orchestrator/integrations` |
| 13 | Analytics | `/analytics` |
| 14 | Reports | `/reports` |
| 15 | User Management | `/user-management` |
| 16 | Settings | `/settings` |

None of these modules are purely read-only once examined at the action level — every module below has at least one intended create/edit/delete/control action, even where today it's a disabled or no-op control. That distinction (intended vs. currently functional) is the core finding of this phase and is called out module by module.

---

## 3. Target Architecture

Same layered shape recommended in Phase 2, now made explicitly **domain-neutral** (no "banking" assumptions baked into types, routes, or service names) and covering the cross-cutting concerns this phase's brief asks for:

```
Screens (src/pages/*)
        ↓ props/render only
UI hooks / view-models (src/hooks/*)         — per-domain hooks, own loading/error/pagination
        ↓ TanStack Query (installed, unused today)
Typed API/service layer (src/services/<domain>/*)   — DTOs + adapters, domain-neutral naming
        ↓
Backend adapters / transport (src/services/transport/*)  — one HTTP client, shared auth/error handling
        ↓ (server-side proxy holds the secret key)
Voice Agent / Call Centre backend  +  Supabase (existing, for WhatsApp/Formatting Hub only)
```

**Typed API/service layer:** one module per business domain (`calls`, `agents`, `campaigns`, `nps`, `qa`, `live-view`, `analytics`, `reports`, `orchestrator`, `users`), none named after or shaped around any single vertical (no `bankingCallsApi.ts`). A domain field belongs in a DTO (e.g. `domain: string` or `vertical: string` on a call/agent record) rather than in the module/type name, so a second live domain (e.g. telecom) is a data value, not a new codepath.

**DTOs vs. UI models:** kept structurally separate, as in Phase 2 — `types/api/<domain>.ts` mirrors the backend's actual response shape; `types/<domain>.ts` (many of which already exist, mock-shaped) describes what components render. An adapter/mapper function per domain translates one to the other, so a backend contract change touches one mapper, not every consuming component.

**Adapters/mappers:** `src/services/<domain>/<domain>Mapper.ts` — pure functions, unit-testable in isolation, the only place DTO field names are allowed to leak into UI-shaped objects.

**Hooks/query layer:** TanStack Query per domain (`useCallLogs`, `useLiveCalls`, `useCampaigns`, etc.), replacing `useIndustryData()` module by module as each domain goes live. Query keys carry active filters so caching/pagination work correctly; this also gives every screen a real loading/error state for the first time (today, most screens render instantly because the "data" is synchronous mock generation).

**Error handling:** normalize both documented backend error shapes (`{success, error, message}` for auth failures vs. plain-string `detail` for not-found/upstream errors, per Phase 2 §4) at the transport layer, so every hook sees one consistent error type regardless of which endpoint failed.

**Validation:** client-side validation before submit (form-level, e.g. phone format, required fields — largely absent today, see module sections) plus surfacing server-side 422 validation errors inline; the two are complementary, not redundant — server validation is authoritative, client validation is UX.

**Configuration:** a single `VITE_*` (or non-`VITE_`, server-only) variable set for the proxy base URL; no backend secret ever reaches `import.meta.env` (see §9, server-side proxy).

**Permissions/auth boundary:** the existing `hasPermission(user, permission)` mechanism (already used for Sidebar visibility and some in-page gates) is the intended boundary — but today it is **UI-only and inconsistently applied** (this phase's research found most write actions across most modules have zero `hasPermission` checks — see §5, §11). The target architecture keeps this same mechanism but requires it to be applied consistently at the point of every write action, not just navigation, and backed by real server-side authorization once real authentication exists (deprioritized per your instruction, but the *design* should not preclude it).

**Extensibility for future modules:** the domain-module + DTO/adapter split above is the extensibility mechanism — a new module (e.g. a future channel or a new vertical) adds a new `services/<domain>/` folder and hook, without touching the transport layer, the proxy, or other domains' code.

**Persistence:** two persistence stores exist and should stay distinct: (a) the Voice Agent / Call Centre backend (PostgreSQL/Redis/Couchbase behind the 3 documented APIs, plus whatever new endpoints are added per §8–9) for anything call/agent/campaign/QA/analytics-related; (b) Supabase (already live) for WhatsApp/Formatting Hub, and potentially for genuinely new frontend-only concerns (e.g. Orchestrator already has a real, unused Supabase schema — see Orchestrator module). Don't invent a third store.

**Realtime/polling:** no WebSocket/SSE is documented on the Voice Agent backend (Phase 2 §11) — polling only, with intervals matched to how "live" each screen needs to feel (Live View fastest, Dashboard/Analytics moderate, everything else on-demand). Supabase Realtime continues to serve WhatsApp exactly as it does today.

---

## 4. Module-by-Module Functional Analysis

Each module covers A–H as specified. Findings below come from direct code reading plus three parallel deep-dive investigations of every relevant component, dialog, type, and mock data file.

### 4.1 Authentication

**A. Functional purpose:** Gate access to the protected application; separately, verify a WhatsApp end-customer's identity (OTP) before they can transact via the WhatsApp channel. These are two distinct authentication concerns sharing the module grouping.

**B. Current behavior:** Main app: `AuthContext.tsx` checks email against `sampleUsers.ts` and a single hardcoded password (`'password123'`) for every user; session is a JSON blob in `localStorage['tardis_user']`; verbose `console.log` of user/permission data on every check. `ProtectedRoute` only checks for presence of a `user` object — trivially bypassable by editing `localStorage`. WhatsApp Authenticate (`WhatsAppAuthenticate.tsx`) is genuinely live: `login`/`reset` mode, calls Supabase edge functions `validate-password`, `send-otp`, `reset-password`, `process-pending-message`.

**C. Read requirements:** Main app: user record by email (currently `sampleUsers.ts`). WhatsApp: phone-number-keyed session/password state (already in Supabase `whatsapp_sessions`).

**D. Write/action requirements:** Main app: login, logout — currently client-only state writes. WhatsApp: submit password, request OTP, submit OTP + new password — already real server-side writes via edge functions.

**E. State model:** Main app: `unauthenticated → authenticated` (no session expiry, no refresh, no MFA). WhatsApp: `login mode ⇄ reset mode`; reset flow: `phone entered → OTP sent → OTP+new password submitted → success`. Both are supported by current code; no additional states to flag as uncertain.

**F. Existing backend/API coverage:** WhatsApp flow: fully covered by existing edge functions (out of scope to change, confirmed live per Phase 1/2). Main app: **no coverage at all** — this is explicitly deprioritized per your instruction, not a gap to solve now.

**G. Missing backend functionality:** Real session-backed authentication/authorization for the main app (deferred, last priority, per instruction). No changes needed for WhatsApp auth.

**H. Recommended UI disposition:** **Defer** main app auth entirely, as instructed — keep current mock mechanism. **Keep as-is** WhatsApp Authenticate.

---

### 4.2 Dashboard

**A. Functional purpose:** At-a-glance operational summary — how many calls are active, how the AI agents are performing, and a quick view of recent activity — the landing page after login.

**B. Current behavior:** `useIndustryData()` supplies call logs and agents; several headline metrics are **hardcoded literals** regardless of data ("Active Calls" = 2, "Avg Sentiment" = 68%, "CSAT Score" = 3.5, "Avg Handle Time" = "3m 45s", all commented "Static for the screenshot match"). "AI Agents Engaged/Total" and per-agent call counts/success rates use `Math.random()`, recalculated every render. Three "Quick Action" buttons at the bottom have **no `onClick` handlers at all** — pure decoration.

**C. Read requirements:** Active call count; recent calls (name, intent, phone, status, duration); AI agent engagement counts and per-agent status; aggregate handle time/sentiment/CSAT.

**D. Write/action requirements:** None currently functional. The three Quick Action buttons imply intended actions (their labels weren't captured in this pass — worth a UI audit before build, since they're currently inert) that should be wired to real navigation/actions or removed.

**E. State model:** None — this is a summary view, not a stateful entity.

**F. Existing backend/API coverage:** `GET /api/v1/call-data`'s `data.summary` block directly covers Active Calls, Avg Handle Time (`avg_aht_seconds`); `data.calls[]` covers Recent Calls. No coverage for CSAT or true per-agent engagement status.

**G. Missing backend functionality:** No CSAT concept anywhere in the documented API. No per-agent "is this agent currently on a call, and what's its idle/awaiting-input/escalation status" endpoint — only inferable approximately by joining active calls' `agent_id`.

**H. Recommended UI disposition:** **Modify** — replace hardcoded/random metrics with `call-data`-derived values; **UI decision** on CSAT tile (keep-and-request-backend-field vs. remove) and on true per-agent status (approximate-derive vs. request real endpoint); **modify or remove** the three dead Quick Action buttons once their intended destinations are confirmed.

---

### 4.3 Initiate Call

**A. Functional purpose:** Let an authorized user place an outbound AI-agent call to a phone number, on demand, for testing or ad-hoc outreach, and see a history of calls they've placed.

**B. Current behavior:** Fully wired to Vapi.ai (`POST https://api.vapi.ai/call`, hardcoded bearer token + `phoneNumberId` in `initiateCallApi.ts`). Agent dropdown sourced from 8 hardcoded fake agents (`initiateCallAgents.ts`) with Vapi-style UUIDs unrelated to any real backend. Call history persisted only to `localStorage`, keyed per user, cleared on logout.

**C. Read requirements:** List of available agents (id, display name, direction); call history for the current user.

**D. Write/action requirements:** Initiate a call (phone number + agent selection, currently E.164-format validated client-side). That's the only write action in this module.

**E. State model:** `InitiatedCall.status`: `initiated | completed | failed` (mock type) — a reasonable model to carry forward, re-sourced from the real `call-data`'s `status`/`stage` fields once live.

**F. Existing backend/API coverage:** `POST /api/v1/call` (Trigger Call) is a clean, documented, direct replacement. `GET /api/v1/agents` (partially documented — see Phase 2 §3) replaces the mock agent list.

**G. Missing backend functionality:** None for the core flow — this is the most complete/ready module in the entire application, backend-wise. Optional enhancements available but not required: `english_accent`/`voice_name` (not currently in the UI), `customer_id` (CIF/CRM tagging, not currently in the UI).

**H. Recommended UI disposition:** **Modify** — swap Vapi call for Trigger Call, swap mock agent list for `GET /api/v1/agents`, replace `localStorage` history with a live `call-data` query so history isn't lost per-device/session. This is the module confirmed in Phase 2 as the recommended first implementation slice.

---

### 4.4 Call Logs / Call Detail / Transcript

**A. Functional purpose:** Complete, searchable audit trail of every call handled — for compliance, coaching, and dispute resolution — with the ability to review the full transcript and (per the data available) the recording.

**B. Current behavior:** `useIndustryData()` call logs, re-mapped into an `extendedCallLogs` shape with **non-deterministic randomized fields** (`Math.random()` for sentiment and intent accuracy, regenerated on every render — so the same call shows different numbers on refresh). Summary stat tiles (FCR rate, AHT, intent accuracy, escalation rate) are genuinely computed from this mock data, just not from anything real. `AdvancedFilters` component is fully built (date range, outcome checkboxes, sentiment slider, duration slider, intent/tag/agent checkboxes) but **its output is never applied to the rendered list** — filtering is currently entirely cosmetic. "Export" button and the filter-change handler are both `console.log`-only no-ops. The "Play" (recording) button on each row has **no handler at all**.

**C. Read requirements:** Per-call: caller name/number, outcome, FCR, handle time, intent + accuracy, sentiment, tags, campaign, transcript (summary and/or full), recording, timestamps. List-level: filter by date range, outcome, direction, duration, search text.

**D. Write/action requirements:** Export (CSV, implied by the Export button) — not currently functional. No other write actions — this module is read-only by design at the business level (viewing history), aside from export.

**E. State model:** None beyond the call's own outcome/status (not owned by this screen — read-only reflection of call state).

**F. Existing backend/API coverage:** **The strongest mapping in the entire application.** `GET /api/v1/call-data?status=inactive` covers essentially every field this screen shows today, field-for-field (see Phase 2 §6.1 for the full table) — caller name/number, outcome, FCR, AHT, intent + accuracy, sentiment + score, tags, campaign name, transcript summary, and even a capability the current UI doesn't use yet (`voice_record_url`, pre-signed S3 recording link) that would finally make the dead "Play" button functional. All the documented query filters (`direction`, `outcome`, `date_from`/`date_to`, `search`, `min_duration`/`max_duration`) map directly onto `AdvancedFilters`' fields.

**G. Missing backend functionality:** None for the core read path. Export-to-CSV has no documented endpoint — likely a frontend-side CSV generation from already-fetched data rather than a backend feature, unless volume makes that impractical.

**H. Recommended UI disposition:** **Modify** — wire to `call-data`, make filters actually filter (currently they don't, even against mock data), add the recording playback the data already supports, implement Export client-side from fetched data. **UI decision** on the "channel" filter/label, which should be scoped to voice-only here since this endpoint's `channel` is always `"voice"`. High-confidence, low-risk module.

---

### 4.5 Live View

**A. Functional purpose:** Real-time operational monitoring — see every call in progress right now, agent engagement status, and (intended) the ability for a supervisor to intervene by transferring a call to a human.

**B. Current behavior:** Live-feeling but entirely client-generated (`generateIndustrySpecificLiveViewCalls/Agents/Transcripts()`, not polling anything real). A full "Transfer to Human" dialog is built — reason dropdown (9 options: complex technical issue, dissatisfaction, high-value transaction, fraud suspicion, policy exception, supervisor requested, empathy required, AI limitation, other), notes textarea, summary recap — but its trigger button is gated by `{condition && false && (...)}`, **permanently dead code that never renders**, confirmed by literal source inspection. A "Listen In"/"Mute-Unmute" live-audio-control block is also fully built but wrapped in a hardcoded `hidden` CSS class. "Today: 3 transfers" stat is a hardcoded literal.

**C. Read requirements:** Currently-active calls (caller, duration, stage, sentiment, intent, agent), connecting/escalated counts, per-agent live status.

**D. Write/action requirements:** **Transfer to human** (reason + notes) — a real, fully-designed business action, currently inert. This is the module's one substantial write requirement and it has no backend equivalent documented anywhere in the 3 reference APIs (which are read/initiate-only).

**E. State model:** Call stage while live: `connecting → in-progress → escalated` (literal values found in code); `escalated` is set locally by the (currently dead) Transfer action, not derived from any backend signal today.

**F. Existing backend/API coverage:** `GET /api/v1/call-data?status=active` covers the read side directly (`duration_seconds` recomputed server-side in real time, `data.summary.connecting_calls`/`escalated_calls`). **No coverage for the write side** — there is no documented endpoint to transfer/escalate a live call.

**G. Missing backend functionality:** A live-call escalation/transfer action (`POST` of some kind against an in-progress call) does not exist in the documented API surface. This is a genuine, product-important gap: the UI already fully designed this feature and it's just switched off — worth flagging as a near-term backend request rather than a UI removal candidate.

**H. Recommended UI disposition:** **Modify** — wire the read side to `call-data?status=active` + polling; **product/backend decision required** on Transfer to Human (request a new endpoint vs. defer the feature) before deciding whether to re-enable that dialog; **UI decision** on "Listen In"/live audio (no backend audio-streaming capability is documented at all — likely defer/remove unless confirmed otherwise).

---

### 4.6 Outbound Campaigns / Create Campaign

**A. Functional purpose:** Define and run outbound AI-calling campaigns against a list of contacts (e.g. EMI reminders, follow-ups, offers), track progress, and review per-contact outcomes/transcripts/recordings.

**B. Current behavior:** List view (`OutboundCampaigns.tsx`) reads from `getIndustrySpecificCampaigns()`; **Edit and Duplicate row actions are `console.log`-only no-ops.** The actual routed create flow (`CreateCampaign.tsx`, at `/outbound-campaigns/create`) is a fully-built 6-step wizard (Basic Info → Type & Script → Target Audience → Scheduling → Retry/Callback Policy → Review & Launch) covering trigger type, call-window validation, retry policy (max attempts, min gap, retry window, time-of-day rotation), callback handling, and lead recycling — genuinely rich, intentional design. **The CSV/Excel upload control has no file input wired at all — cosmetic only.** A "Salesforce" audience-source option is offered for one campaign type, backed by a fully simulated (`generateIndustrySpecificSalesforceCampaigns()`) fake integration, not a real Salesforce connection. `handleSubmit()` on Launch is `console.log`-only; nothing is created, and the list view is unaffected because it's re-derived from a static generator every render, not from any created-campaign store. Note: a separate, unused `CreateCampaignDialog.tsx` component exists (dead code — imported but never rendered) that duplicates most of this wizard's logic.

**C. Read requirements:** Campaign list (name, type, status, channel, schedule); campaign detail (contacts, per-contact call disposition/outcome/transcript/recording); available scripts (currently two inconsistent sources — direct `sampleCallScripts` import in the list/detail view vs. `generateIndustrySpecificScripts()` in the create flow); available campaign types (industry-driven).

**D. Write/action requirements:** **Create campaign** (the full wizard above), **edit campaign** (currently a no-op), **duplicate campaign** (currently a no-op), implicit **start/pause/cancel** (status values exist in the type but no UI control drives a transition today), **upload contact CSV** (UI present, not wired).

**E. State model:** `OutboundCampaign.status`: `draft | scheduled | running | completed | paused` (from the type) — but **no UI action transitions between these states today**; they're just whatever the mock generator assigns. `triggerType` has a **type/UI mismatch**: the TypeScript type only allows `manual | scheduled`, but the wizard UI offers three options (`immediate`/`scheduled`/`scheduled_interval`) — flag as needing reconciliation once real.

**F. Existing backend/API coverage:** **None.** No campaign-related endpoint exists in any of the 3 documented APIs. (The reference Dashboard User Guide describes a Campaigns feature in the *vendor's own* dashboard — CSV upload, call interval, schedule, max concurrency, per-campaign progress/cancel/delete — which strongly suggests backend capability exists, but no REST contract for it was provided to us.)

**G. Missing backend functionality:** The entire module's backend: create/list/get/update campaign, contact-list upload/association, start/pause/cancel, per-contact progress and outcome tracking, retry/callback/recycling policy execution. This is the single largest backend gap found in the whole audit (consistent with Phase 2's G1).

**H. Recommended UI disposition:** **Defer implementation, but do not discard the UI design** — the wizard's field set (retry policy, callback handling, lead recycling, call-window validation) is well thought out and should drive the backend requirements conversation rather than be redesigned from scratch. **Remove or clearly disclose** the simulated "Salesforce" integration option until/unless a real one is scoped. **Fix** Edit/Duplicate to either work or be removed, and wire the CSV upload control regardless of backend timing (client-side parsing can happen before a real upload endpoint exists).

---

### 4.7 NPS Campaigns

**A. Functional purpose:** Run post-interaction NPS survey campaigns (voice/WhatsApp/SMS/email) and track promoter/passive/detractor responses over time.

**B. Current behavior:** Structurally a near-duplicate of the Outbound Campaigns module — same 6-step wizard pattern (Basic Info → Script → Audience → "AI Configuration" → Scheduling → Review), same non-functional CSV upload, same `console.log`-only submit. Row-level actions (`Edit`, `Play/Pause`, `Delete`) show `toast` success messages **without actually mutating any state** — a delete "succeeds" via toast but the campaign never leaves the list. The "AI Agent Configuration" wizard step is entirely static badges (not editable). `NPSSettingsTab.tsx` has zero interactive controls at all — pure display.

**C. Read requirements:** NPS campaign list and detail; NPS responses (score, category: promoter/passive/detractor, channel); NPS scripts.

**D. Write/action requirements:** Create, edit, pause/resume, delete campaign; implicitly, response collection itself (currently entirely mock). Notably, `NPSResponse.escalated`/`vipTagged` boolean fields exist on the type but are **never surfaced or actioned anywhere in the UI** — dead fields worth a product decision (keep-and-wire vs. drop from the model).

**E. State model:** Same `draft | scheduled | running | completed | paused` enum as Outbound Campaigns (byte-identical definition) — again, no UI action currently transitions it.

**F. Existing backend/API coverage:** **None**, same as Outbound Campaigns. One important, concrete clue found in the *Session Transcript* API's own sample response: a real voice session transcript already contains an NPS-style exchange embedded as ordinary conversation turns (`"I would rate you 4"` / `"Thank you for rating us 4 out of five..."`). This strongly suggests NPS rating collection may already be happening *inside* normal call transcripts server-side, without a dedicated "NPS campaign" concept existing on the backend yet — a very different shape than this screen assumes.

**G. Missing backend functionality:** Entire module (same shape of gap as Outbound Campaigns) **plus** a specific open question: does a structured `nps_score`/category field exist anywhere in `call-data` or a related endpoint, or must it be parsed from transcript text (fragile, not recommended)? This needs a direct answer from the backend team before design, not an assumption either way.

**H. Recommended UI disposition:** **Defer implementation**, same as Campaigns. **Product/backend decision required** specifically on whether NPS is (a) its own campaign concept requiring new backend work, or (b) something to derive from ordinary call transcripts/outcomes that already exist — these lead to very different architectures. Fix the toast-without-mutation pattern (misleading success feedback) regardless of timing.

---

### 4.8 QA Review

**A. Functional purpose:** Let a QA reviewer listen to/read a completed call, score it against a quality rubric, and leave feedback — for coaching and compliance.

**B. Current behavior:** Review queue and completed reviews are **hardcoded literal arrays inside the page component itself** (not even in `src/data/`). A fully-built scoring modal (`QualityScoring.tsx`) presents 5 fixed, weighted criteria (Intent Recognition Accuracy 25%, Response Quality 30%, Conversation Flow 20%, Escalation Handling 15%, Customer Satisfaction 10%) each with a 0–100 slider and a comments field, computing a weighted overall score — genuinely well-designed, but **entirely a frontend invention with no backend rubric model behind it anywhere**. "Save Assessment" is `console.log`-only. The modal never actually loads or displays the real transcript for the call being reviewed — it references only a `callId` string. "Filter Reviews" and "View Call" buttons have no handlers.

**C. Read requirements:** Review queue (pending items, with priority); the actual call/transcript being reviewed (currently not linked — see above); completed reviews with their scores.

**D. Write/action requirements:** Start/continue review, submit score + comments per criterion, (implicitly) approve/finalize a review.

**E. State model:** `pending | in_progress | completed` (inline string literals only, no shared type exists). Priority: `urgent | high | medium | low`.

**F. Existing backend/API coverage:** Partial, read-only: `call-data`'s `sentiment`, `fcr`, `intent_accuracy`, and `transcript_summary` fields give an automated quality signal that could seed a "review queue" (e.g., flag low-confidence or negative-sentiment calls for review) even without a manual workflow. **No coverage at all** for the manual scoring/review workflow itself — no QA table exists in Supabase either (confirmed against the baseline audit's table list).

**G. Missing backend functionality:** A QA review/score persistence and workflow API entirely — review assignment, score submission (with the rubric, or a backend-defined one), status transitions, and a way to actually attach the real transcript to a review item (currently disconnected even in the mock).

**H. Recommended UI disposition:** **Modify** — connect the review queue to real flagged calls from `call-data` (auto-quality baseline) as a v1, since that's immediately available; **defer** the manual scoring/write-back workflow pending a backend decision on whether the rubric is frontend-owned or backend-defined; **fix** the transcript-linkage gap regardless of backend timing, since it's a basic usability issue even against mock data.

---

### 4.9 WhatsApp (Hub + Authenticate)

**A. Functional purpose:** Operate the bank/business's WhatsApp channel — customers message in, an AI-generated reply is sent back, and staff can view the conversation.

**B. Current behavior:** Genuinely live: Supabase Postgres tables + Realtime subscription + `send-whatsapp-message` edge function for the messaging transport itself. **However, the AI-reply generation is built entirely on Vapi's `/session` and `/chat` endpoints**, called from two separate, apparently-duplicated Supabase edge functions (`process-pending-message` and `whatsapp-webhook`) — not merely "near" Vapi, but structurally dependent on it for every automated reply. This is a discovered compatibility issue, not an assumption: your instruction to leave WhatsApp unchanged collides with Vapi's full retirement, because retiring Vapi silently breaks WhatsApp's AI replies unless something replaces it.

**C. Read requirements:** Conversation history per phone number; session continuity (already tracked in `whatsapp_sessions`).

**D. Write/action requirements:** Send a message (agent-composed or AI-generated reply) — already fully live via Twilio.

**E. State model:** Message `direction`: `inbound | outbound`; `processed` boolean flag on inbound messages; these already exist and work correctly.

**F. Existing backend/API coverage:** Messaging transport: fully covered by existing Supabase + Twilio, out of scope to change. **AI reply generation: zero coverage** by the 3 documented Voice Agent APIs — those are voice-call-oriented (Trigger Call, transcript, call-data), not text/chat.

**G. Missing backend functionality:** A text/chat equivalent to Vapi's `/session`+`/chat` on the new backend. The Dashboard User Guide's "Chat Mode" ("talks to exactly the same bot brain... by text") strongly implies such a capability exists server-side, but it's outside the 3 documents provided — needs direct confirmation.

**H. Recommended UI disposition:** **Keep as-is** for messaging transport (explicitly out of scope). **Product/backend decision required, urgently** on the AI-reply source — this is the one place in the entire application where "don't touch this module" and "Vapi is being removed" are in direct tension, and it needs your decision, not an engineering assumption.

---

### 4.10 Formatting Hub

**A. Functional purpose:** Let staff review how AI-generated WhatsApp replies were reformatted for WhatsApp delivery (emoji/markdown cleanup, currency normalization, etc.) — a debugging/QA aid for the WhatsApp AI-reply pipeline.

**B. Current behavior:** Fully live, read-only: queries Supabase table `vapi_response_logs` directly, refresh button works, expand/collapse per-entry works. No write actions.

**C. Read requirements:** Logged formatting operations (original text, formatted text, strategy used, session/phone number, timestamp).

**D. Write/action requirements:** None — display-only.

**E. State model:** None.

**F. Existing backend/API coverage:** N/A — Supabase-backed, already live.

**G. Missing backend functionality:** None functionally. The table/type naming (`vapi_response_logs`, `VapiResponseLog`) is cosmetically tied to Vapi even though the formatting logic itself (`formatAndLogVapiResponse`) is generic text processing, not Vapi-specific — worth a rename once the WhatsApp AI-reply source (§4.9, G8) is resolved, purely for clarity.

**H. Recommended UI disposition:** **Keep as-is.** Optional, low-priority: rename the underlying table/type once the WhatsApp AI-reply source is settled, so "Formatting Hub" isn't permanently narrated as a Vapi-specific feature in the schema.

---

### 4.11 AI Agents

**A. Functional purpose:** Manage the roster of AI agents — their intents, response behavior, escalation rules, and general configuration (conversation limits, personality, language model).

**B. Current behavior:** List reads from `useIndustryData()`. Status (`engaged|idle|awaiting_input`) is **assigned by array index, not by any real per-agent state**, and `successRate`/`totalCalls`/`engagementTime` are `Math.random()`-generated every render. A rich 4-tab configuration dialog exists (Intents, Responses, Escalation, General) with genuinely detailed controls (per-intent example utterances and confidence thresholds; per-rule escalation toggles; conversation-turn limits, response timeout, personality, language model selection) — **but its internal state is never keyed off which agent was opened**, so every agent (and "Create Agent") shows identical, static content. **"Save Configuration" has no `onClick` handler at all** — the single most non-functional control found across the entire application; it doesn't even close the dialog. Play/Pause row icons have no handler.

**C. Read requirements:** Agent identity, direction, and (intended, not currently real) live status and performance metrics; per-agent configuration (intents, escalation rules, general settings).

**D. Write/action requirements:** Create agent, edit agent configuration (all 4 tabs), enable/disable escalation rules, (implied) activate/deactivate an agent.

**E. State model:** Agent status `engaged | idle | awaiting_input | escalation_triggered` (found in Dashboard/Live View's color-mapping code) — not owned by this screen, but the concept is shared across Dashboard/Live View/AI Agents and should be modeled once, not three times.

**F. Existing backend/API coverage:** `GET /api/v1/agents` gives identity + direction only (read-only, and only partially documented — full schema unconfirmed, per Phase 2 G11). **No coverage at all** for configuration (intents, escalation rules, general settings) or for live per-agent status.

**G. Missing backend functionality:** Agent configuration write API (if agents are meant to be editable from this product at all — they may instead be configured entirely backend-side, with this screen becoming read-only); live per-agent status/performance endpoint.

**H. Recommended UI disposition:** **Modify** — wire the identity/direction fields to `GET /api/v1/agents` immediately (`DIRECT`, low risk). **Product decision required** on whether agent configuration stays a frontend feature (needs new backend write APIs) or becomes read-only here (if configuration genuinely lives backend-side/ops-side, per the Dashboard User Guide's "Tool Selector" being a separate, ops-facing capability). Either way, fix the per-agent state bug before shipping anything, mock or real.

**Cross-module note:** this screen's `AIAgent` type (`src/types/auth.ts`) and Initiate Call's `AIAgent` type (`src/types/initiateCall.ts`) share a name but not a shape or a data source, and never reference the same agents. A live implementation must decide: one shared agent directory (recommended, matching `GET /api/v1/agents` as the single source), or two genuinely separate concepts. Recommend unifying on one, since maintaining two "AI Agents" lists in a live product would be confusing and error-prone.

---

### 4.12 Orchestrator (list / new / flow editor / integrations)

**A. Functional purpose:** Visually design conversation-handling flows (intent routing, KB answers, API calls, escalation, etc.) as a node graph, version and approve them, and manage the integrations (KB/product/API) those flows call into.

**B. Current behavior:** The most functionally over-built-yet-entirely-disconnected module in the application. The **data model** (`types/orchestrator.ts`) is genuinely comprehensive — flow status (`draft|approved|live|archived`), 12 node types, approvals with reviewer decisions, changelog, versioning, simulation runs with execution traces — but almost none of it is used by the actual components, which instead use a much lighter, ad-hoc mock shape. **"Create Flow" is disabled by a hardcoded `&& false`.** Search/status/channel filters exist in the UI but **never actually filter** the rendered list (status filter is additionally hidden via CSS). The flow editor's toolbar **Save** button is `console.log`-only (comment literally reads `// TODO: Save to database`), **Validate** ignores the real, working validation engine and always shows fake success, **Simulate** does nothing beyond a fake toast, and **Version**/**Publish** have **no handlers at all**. Auto-save (every 5s) and Ctrl/Cmd+S both call the same fake save. **Canvas interactions themselves (drag-drop nodes, connect edges, delete, pan/zoom) are genuinely functional, all in-memory** (React Flow's own state), never persisted. Real-time client-side validation (`flowValidation.ts`, via `Canvas.tsx`) **actually works** — checking for start/end node presence, orphaned nodes, and required config on router/API-call nodes — it's just never submitted anywhere. The 4 "real" mock flows shown are hardcoded directly inside `Canvas.tsx`, not sourced from `orchestratorFlows.ts`. Integrations screen: "Add Integration" and "Test Connection" have no handlers; search doesn't filter.

**C. Read requirements:** Flow list (metadata + status); flow graph (nodes + edges + per-node config) for the editor; integration list (type, environment, last-tested, status).

**D. Write/action requirements:** Create, save, version, publish/approve, delete flow; add/edit/delete node and its config within the canvas; add/test integration. Every one of these is either a no-op or purely in-memory today.

**E. State model:** `FlowStatus`: `draft | approved | live | archived` — defined in the type, never actually transitioned by any UI control. Approval events (`approved | requested_changes | rejected`) exist in the type, entirely unimplemented in UI.

**F. Existing backend/API coverage:** **None of the 3 Voice Agent APIs relate to Orchestrator at all** — and there's no evidence this concept maps to that backend conceptually (see G below). Separately and importantly: **Supabase already has a full, real schema for this** — `orchestrator_flows`, `orchestrator_versions`, `orchestrator_snippets`, `orchestrator_integrations`, `orchestrator_runs`, `orchestrator_approvals`, all with proper granular RLS (confirmed in the baseline audit) — **and zero Orchestrator code anywhere reads or writes to any of it.** This is the single largest "backend already exists, frontend just isn't using it" gap in the whole application.

**G. Missing backend functionality:** Not a backend gap in the usual sense — the persistence layer already exists and is unused. What's missing is: (1) the frontend service/mapper layer to actually use it, and (2) a product decision on what Orchestrator *is* — does a published flow here actually drive the Voice Agent backend's conversation handling (in which case a real integration point into that backend is needed, which doesn't exist), or is it a self-contained internal design tool backed only by Supabase? The data model's `Flow.channels` (`voice|text|whatsapp`) suggests the former was intended; nothing in the reference API docs confirms a mechanism for it.

**H. Recommended UI disposition:** **Modify, but sequence last among "own the data" modules** — wiring Orchestrator to its existing Supabase schema is comparatively low-risk (per Phase 2's sequencing, it's a good early proof of the real-backend pattern) but the *product* question (does this drive live agent behavior?) needs an answer before investing further. Fix the disabled Create button and the fake Save/Validate/Simulate/Version/Publish handlers regardless — they're currently actively misleading (a user could believe a flow was saved when it wasn't).

---

### 4.13 Analytics

**A. Functional purpose:** Performance and quality trends over time — call volume, resolution/escalation rates, sentiment/CSAT trends, and (per the reference Dashboard User Guide) latency/quality metrics — for management visibility.

**B. Current behavior:** A mix of genuinely-computed-from-mock (FCR rate, avg duration — from real `callLogs`), partially-computed-with-random-noise (`intentDistributionData`: real intent names, random percentages), and **entirely hardcoded literals with no data dependency at all** (Resolution Metrics panel, Customer Satisfaction panel, `avgIntentAccuracy = '94.7'`, the 7-day call-volume bar chart, the 9-slot hourly line chart). **"Date Range," "Export Report," "Review Training Data," "Expand Templates," and "Optimize Handlers" buttons all have no `onClick` handlers whatsoever.**

**C. Read requirements:** Time-bucketed call volume; FCR/escalation/resolution rates; intent distribution; (per the reference dashboard, not currently in this screen) latency percentiles, per-stage timing, GPU cost, STT/TTS quality.

**D. Write/action requirements:** Export report; adjust date range/direction filter — both currently non-functional.

**E. State model:** None — analytics is a read/aggregate view.

**F. Existing backend/API coverage:** `data.summary` from `call-data` directly covers FCR rate, escalation rate, avg AHT, avg intent accuracy. Call-volume-over-time is derivable by client/service-side bucketing of `call-data` results by timestamp. **No coverage** for latency percentiles, per-stage STT/LLM/TTS timing, GPU cost, or STT/TTS quality scores — these are shown only in the reference dashboard's own Analytics/Call Metrics tabs, with no confirmed REST contract.

**G. Missing backend functionality:** The richer performance-timing metrics (latency, per-stage breakdown, quality scores) — confirm via the Swagger spec (still not fetched, per Phase 2's open item) whether an endpoint exists before assuming a new one is needed.

**H. Recommended UI disposition:** **Modify** — replace the fully-hardcoded panels with `call-data`-derived values where directly available; **defer** the latency/quality charts pending the Swagger/API confirmation; **fix or remove** the five dead action buttons.

---

### 4.14 Reports

**A. Functional purpose:** Generate/download/schedule business reports (executive, campaign performance, customer experience, etc.) for stakeholders who don't work in the live dashboard day-to-day.

**B. Current behavior:** A rich, well-typed report model exists (`sampleReports.ts`, `types/reports.ts` — `Report`, `ReportSchedule` with `daily|weekly|monthly|quarterly` frequency, `ExportFormat` with `pdf|excel|csv|powerpoint`) but **is entirely dead code, never imported anywhere.** The actual page instead generates just 3 hardcoded report objects inline, permission-filtered. **"Scheduled Reports," "Create Custom Report," "Filters," per-report View/Download/Settings icons, and "Clear Filters" all have no handlers.** Search and category-select filters work but are in-memory only. Favorite-toggle works but resets on refresh. "12 Scheduled Reports" and "156 Downloads This Month" are hardcoded literals.

**C. Read requirements:** Available report definitions (filtered by permission); report metadata (category, last generated, favorite status).

**D. Write/action requirements:** Generate/view report, download/export (in one of 4 formats per the dead type model), schedule (with frequency), create custom report, favorite/unfavorite (currently in-memory only).

**E. State model:** None explicit beyond the dead `ReportSchedule.frequency`/`ExportFormat` enums — worth treating as the intended model (per instruction to use mock data as a source of intent) even though unused today.

**F. Existing backend/API coverage:** Anything summarizable from `call-data` (the same aggregates Analytics uses) is derivable in the service layer. **No coverage** for report *definitions*, scheduling, or export-format generation (PDF/Excel/PowerPoint) — none of that is a Voice Agent API concern; it would be either a new backend capability or a frontend-only generation feature (e.g. client-side CSV/PDF export from already-fetched data).

**G. Missing backend functionality:** Report-definition storage/scheduling if that's meant to be a managed, shareable feature (vs. purely ad-hoc client-side export). This is a product-scope decision more than a pure backend gap.

**H. Recommended UI disposition:** **Modify** — revive the already-well-designed `sampleReports.ts`/`types/reports.ts` model (don't redesign from scratch, it's sound) once report *content* is sourced from real `call-data` aggregates; **product decision required** on whether scheduling/multi-format export is truly needed as a backend feature or can stay a frontend export convenience.

---

### 4.15 User Management

**A. Functional purpose:** Administer who has access to the application and what they're permitted to do.

**B. Current behavior:** Fully read-only display of `sampleUsers.ts`, filtered by search/role (in-memory only). **"Add User," "Edit," "Permissions," and Delete all have no handlers whatsoever.** "Last Login: 2 hours ago" is an identical hardcoded literal on every single user card; every status dot shows "Active" regardless of any real state. The "Role Distribution & Access Matrix" table is **entirely hardcoded UI**, not computed from the actual `sampleUsers.ts` data. Critically: **only 2 of the 4 roles defined in the `User.role` type union have any real user data** (`call_center_head`, `qa_reviewer`) — `product_manager` and `ai_operations_specialist` exist only in the role dropdown, badge-color switch statement, and the hardcoded matrix, with zero backing data or permission grants anywhere in the codebase.

**C. Read requirements:** User list (name, email, role, status, last login); role-to-permission mapping.

**D. Write/action requirements:** Add user, edit user, manage permissions, delete/deactivate user — all currently non-functional.

**E. State model:** User active/inactive (implied by "status," not actually modeled — every user is hardcoded "Active").

**F. Existing backend/API coverage:** None — this is explicitly deprioritized alongside authentication per your instruction, and correctly so: there's no user-management concept in any of the 3 Voice Agent reference APIs (they're calls/sessions/data, not identity).

**G. Missing backend functionality:** A real user/role/permission backend entirely — deferred by instruction, but the functional requirement (CRUD + role assignment + a genuinely populated 4-role permission model, not 2-of-4) should be captured now per your instruction, for whenever auth work begins.

**H. Recommended UI disposition:** **Defer**, per instruction — but flag for the future auth phase that the current mock's `product_manager`/`ai_operations_specialist` roles are UI-only decoration with no real backing data, so that future phase doesn't inherit a false impression that those roles are "already modeled."

---

### 4.16 Settings

**A. Functional purpose:** Application-level configuration — notification behavior, escalation thresholds, session/call limits, company identity.

**B. Current behavior:** `handleSave` is the only handler in the entire screen, and it does exactly `console.log('Settings saved')` — no persistence anywhere, not even `localStorage`. Two toggle switches (notifications, auto-escalation) and one numeric field (data retention days) are real, controlled React state that simply resets on refresh. **Company Name, Time Zone, Session Timeout, Escalation Threshold, and Max Call Duration all use uncontrolled `defaultValue`** — meaning typing in them doesn't even update component state, let alone persist; they're effectively decorative inputs. No validation anywhere in the file.

**C. Read requirements:** Current settings values (currently defaults only, never loaded from anywhere).

**D. Write/action requirements:** Save settings — currently entirely non-functional, the most disconnected "write" action found in the whole application (worse than console.log-only screens, since half its fields don't even reach React state).

**E. State model:** None.

**F. Existing backend/API coverage:** None documented — settings of this shape (notification prefs, escalation thresholds, call limits) aren't part of the 3 Voice Agent APIs; this is likely either a new lightweight backend endpoint or, for some fields, Supabase-backed app configuration.

**G. Missing backend functionality:** A settings persistence endpoint/table entirely.

**H. Recommended UI disposition:** **Defer**, consistent with the instruction that Settings sits alongside Authentication/User Management as last priority — but note it needs *more* remedial work than "wire it to a backend," since several fields aren't even functional against local state today.

---

## 5. Read/Write/Action Matrix

Consolidated across all 16 modules — every distinct write/action found, its current persistence reality, and its live-backend disposition.

| Action | Module | Currently persists to | Live coverage |
|---|---|---|---|
| Login (main app) | Auth | `localStorage` (mock check) | Deferred (out of scope this phase) |
| WhatsApp login / OTP request / password reset | Auth | Supabase (real) | Already live |
| Initiate call | Initiate Call | Vapi.ai (real, external) | `POST /api/v1/call` — direct replacement |
| View transcript | Call Logs | N/A (read) | `GET /api/v1/sessions/{id}` |
| Play recording | Call Logs | **No handler at all** | `voice_record_url` field exists — new capability |
| Export call logs (CSV) | Call Logs | `console.log` only | Frontend-derivable from fetched data |
| Filter call logs | Call Logs | State set, **never applied to list** | Query params exist, need real filter application |
| Transfer call to human | Live View | **Dead code (`&& false`)** | **No backend endpoint documented — gap** |
| Listen In / Mute | Live View | **Hidden via CSS, unused** | No backend audio-streaming documented |
| Create/Edit/Duplicate campaign | Campaigns | `console.log` / no-op | **No backend endpoint — gap** |
| Upload contact CSV | Campaigns | **No file input wired** | **No backend endpoint — gap** |
| Create/Edit/Pause/Delete NPS campaign | NPS | `toast` message, no actual mutation | **No backend endpoint — gap**; possible transcript-derived alternative |
| Start/save QA review | QA Review | `console.log` only | Partial (auto-signals only); **no write API — gap** |
| Send WhatsApp message | WhatsApp | Supabase + Twilio (real) | Already live |
| Create/Edit agent config | AI Agents | **No handler ("Save" does nothing)** | **No config write API — gap/product decision** |
| Create/Save/Version/Publish flow | Orchestrator | In-memory (canvas) / no-op (toolbar) | Supabase schema exists, **unused by frontend** |
| Add/Test integration | Orchestrator | **No handler** | Supabase `orchestrator_integrations` exists, unused |
| Export analytics report | Analytics | **No handler** | Frontend-derivable from `call-data` |
| Generate/schedule/export report | Reports | **No handler** | Partial (content derivable); scheduling/format gen is a gap |
| Add/Edit/Delete user, manage permissions | User Mgmt | **No handler** | Deferred (out of scope this phase) |
| Save settings | Settings | `console.log` only; half the fields don't reach state | **No backend — gap**, deferred priority |

---

## 6. State/Workflow Models

Only the states actually evidenced by code (type unions or literal string comparisons) are listed; nothing here is invented.

| Entity | States found | Transitions currently implemented? |
|---|---|---|
| Call (`InitiatedCall.status`) | `initiated → completed \| failed` | No — mock only; live source would be `call-data.status`/`stage` |
| Call (Live View `stage`) | `connecting → in-progress → escalated` | Partial — `escalated` settable only via the currently-dead Transfer dialog |
| Outbound Campaign / NPS Campaign | `draft → scheduled → running → completed`, plus `paused` | **No** — status is whatever the mock generator assigns; no UI control transitions it |
| QA Review | `pending → in_progress → completed` | Partial — opening the modal implies `in_progress`; "Save" doesn't actually transition or persist status |
| Orchestrator Flow | `draft → approved → live → archived` | **No** — defined in the type, zero UI implementation |
| Orchestrator Approval | `approved \| requested_changes \| rejected` | **No** — type-only, no UI |
| WhatsApp message | `inbound \| outbound`, `processed: boolean` | **Yes** — this one is real and working |

**Uncertain/unconfirmed states, flagged rather than assumed:** whether `call-data`'s `stage` values (`in-progress`/`completed`, per the documented schema) map cleanly onto the UI's richer `connecting|in-progress|escalated` set, or whether "connecting" and "escalated" are purely UI-invented granularity — needs confirmation once live (the `data.summary.connecting_calls`/`escalated_calls` fields do exist server-side, so at least those two are likely real, but "connecting" as a per-call `stage` value isn't explicitly confirmed in the documented schema, only as a summary count).

---

## 7. Live API Coverage (by module)

| Module | Coverage |
|---|---|
| Initiate Call | Strong — direct 1:1 for the core flow |
| Call Logs / Call Detail / Transcript | Strongest — near-complete field match |
| Live View | Strong for reads; **none** for the write action (transfer) |
| Dashboard | Partial — summary metrics covered, CSAT/per-agent-status not |
| Analytics | Partial — core rates covered, timing/quality metrics not |
| Reports | Partial — content derivable, scheduling/format generation not |
| AI Agents | Minimal — identity only, no config |
| QA Review | Minimal — automated signals only, no review workflow |
| Outbound Campaigns / NPS Campaigns / Orchestrator | **None** from the Voice Agent APIs (Orchestrator has an unused Supabase schema instead) |
| WhatsApp / Formatting Hub | Already live (Supabase), unrelated to the Voice Agent APIs, except the Vapi-dependent AI-reply gap |
| Authentication / User Management / Settings | Out of scope this phase |

---

## 8. Backend Gaps

Consolidated list (superset of Phase 2's gap list, extended with this phase's deeper findings):

| # | Gap | Modules affected | Priority |
|---|---|---|---|
| B1 | No campaign CRUD/contact-upload/lifecycle API | Outbound Campaigns | High |
| B2 | No NPS campaign/response API; unclear if NPS is transcript-derived instead | NPS Campaigns | High |
| B3 | No QA review/scoring write-back API | QA Review | Medium |
| B4 | No live-call transfer/escalation action API | Live View | **High — feature is fully designed, just switched off** |
| B5 | No AI agent configuration write API (or product decision that none is needed) | AI Agents | Medium |
| B6 | No CSAT concept anywhere in the backend | Dashboard | Medium |
| B7 | No per-agent live status/performance endpoint | Dashboard, Live View, AI Agents | Medium |
| B8 | No latency/per-stage timing/quality-score data (STT/LLM/TTS, GPU cost, P95) | Analytics, Reports | Medium |
| B9 | No report-definition/scheduling/multi-format export API | Reports | Low–Medium (may be frontend-only) |
| B10 | No settings persistence | Settings | Low (deferred) |
| B11 | No confirmed text/chat equivalent to Vapi's `/session`+`/chat` | WhatsApp | **Critical — time-sensitive, Vapi retirement forces this** |
| B12 | `GET /api/v1/agents` full schema unconfirmed | Initiate Call, AI Agents | High (blocks B5, B7 partially) |
| B13 | Orchestrator's Supabase schema exists but frontend doesn't use it; no confirmed link between a "published flow" and actual live agent behavior | Orchestrator | Product decision, not purely technical |
| B14 | Missing 6th reference document / Swagger spec not yet pulled | All | Should resolve before implementation (may close B6/B8/B9/B12 partially) |

---

## 9. Required API Enhancements / New APIs

Framed as requirements, not implementations, per instruction not to invent endpoints — each states the need, not a proposed contract:

1. **Campaign lifecycle API** (B1): create, list, get, update, contact-list association/upload, start/pause/cancel, per-contact progress.
2. **NPS API or transcript-derived NPS extraction** (B2): pending the product decision in §14.
3. **QA review write-back API** (B3): review assignment, score submission, status transition — rubric ownership (frontend vs. backend) to be decided.
4. **Live-call transfer/escalation action** (B4): the most concrete, well-specified gap — the UI already defines exactly what fields it needs (reason, notes).
5. **Agent configuration write API** (B5) — contingent on the product decision on whether this product owns agent config at all.
6. **CSAT field/endpoint** (B6) — contingent on product decision on whether CSAT is tracked at all server-side.
7. **Per-agent live status endpoint** (B7) — or an agreed-upon derivation rule if a real endpoint isn't planned.
8. **Timing/quality metrics endpoint(s)** (B8) — confirm via Swagger before requesting as new.
9. **Report scheduling/export-generation** (B9) — likely frontend-only unless multi-format server-generated reports are a real requirement.
10. **Settings persistence** (B10) — deferred, low complexity when picked up.
11. **Text/chat AI-reply capability for WhatsApp** (B11) — most urgent, confirm existence before assuming a new build is needed.
12. **Full `GET /api/v1/agents` schema confirmation** (B12) — documentation clarification, not new backend work.

---

## 10. Data Model / Persistence Requirements

- **Voice Agent backend** (PostgreSQL/Redis/Couchbase behind the documented APIs): source of truth for calls, sessions/transcripts, and (per gaps above) would need to extend to campaigns, NPS, QA, agent config, and live-call actions if those are built there rather than elsewhere.
- **Supabase** (already live): source of truth for WhatsApp messaging/sessions, Formatting Hub logs, and Orchestrator's already-provisioned-but-unused schema. Recommend Orchestrator's persistence stay in Supabase (schema already exists and is well-designed with RLS) rather than being duplicated into the Voice Agent backend, pending the product decision on what Orchestrator actually drives (B13).
- **Frontend-local state** (React Query cache, not persistence): should replace ad-hoc `useState`/`localStorage` patterns currently used for call history (Initiate Call), filter state (Call Logs), and form drafts (Campaigns/NPS wizards) — none of these need a new backend table, they need to stop being treated as if they were persisted when they aren't.
- **No new frontend-only persistence store should be introduced** (e.g. no new localStorage-based "database") — every write requirement above resolves to either an existing store (Voice Agent backend or Supabase) or a genuinely new backend requirement; localStorage should only ever hold per-device UX conveniences, never business data, consistent with the architecture in §3.

---

## 11. UI Decisions Requiring Review

Items where the recommended path is explicitly not "wire to backend" but a product/design call:

1. Dashboard's CSAT tile and three dead Quick Action buttons (§4.2).
2. Live View's "Listen In"/live-audio controls — currently hidden, no backend audio-streaming capability documented (§4.5).
3. Campaigns' simulated "Salesforce" integration option — should not ship as-is; either build a real integration or remove the option (§4.6).
4. NPS's `escalated`/`vipTagged` fields — currently modeled but never surfaced; keep-and-wire vs. drop (§4.7).
5. Call Logs' "channel" filter scoping (voice-only, given the data source) (§4.4).
6. AI Agents: is agent configuration a frontend feature at all, or backend/ops-owned (§4.11)?
7. Reports: is scheduling/multi-format export a real requirement, or is on-demand client-side export sufficient (§4.14)?
8. User Management's `product_manager`/`ai_operations_specialist` roles — currently pure decoration with zero backing data; needs real definition whenever auth work begins (§4.15).
9. Two independent `hasPermission` implementations (`AuthContext.tsx` and `lib/auth.ts`) — functionally harmless today, but should be consolidated to one source of truth before real authorization is built on top of it.
10. Orchestrator: the entire module's product intent (does a published flow drive live agent behavior?) is unresolved and shapes nearly every other decision about it (§4.12, B13).

---

## 12. Existing Live Functionality to Preserve

- WhatsApp Authenticate (OTP via Supabase edge functions + Twilio).
- WhatsApp Hub's messaging transport (Supabase tables + Realtime + Twilio send) — **except** the AI-reply generation step (B11), which needs a decision regardless of this instruction, because it's an external forcing function (Vapi retirement), not a scope choice.
- Formatting Hub's read/display logic.
- The current mock authentication and Settings mechanisms, per explicit deprioritization.

---

## 13. Vapi Replacement Scope

Restating and confirming Phase 2's Vapi map (§8 there) against this phase's deeper findings — nothing new was found beyond what Phase 2 already identified; this phase corroborates it:

- **Voice side (Initiate Call):** clean, fully-documented 1:1 replacement via `POST /api/v1/call`. No open questions. Ready to build.
- **Text/chat side (WhatsApp AI-reply, both `process-pending-message` and `whatsapp-webhook` edge functions):** no confirmed replacement (B11). This remains the one place where Vapi removal has a real, unresolved consequence for a module you asked to leave alone.
- **Mock agent list (`initiateCallAgents.ts`):** to be fully replaced by `GET /api/v1/agents`, not preserved even partially — the 8 mock agents (including several with no plausible real backend equivalent, e.g. "Insurance Premium Reminder" against a banking-example deployment) were Vapi-fixture data, not a product requirement in themselves.
- **`vapi_response_logs` table/type naming:** cosmetic only, functionally decoupled from Vapi already (the formatter logic is generic), rename optional.

---

## 14. Mock-Data Retirement Plan

Per instruction, mock data is **not deleted in this phase** — it remains the reference for intended functionality until live replacement designs are approved. This is the retirement sequencing once that approval happens, aligned to Phase 2's implementation sequence and this phase's confidence findings:

1. **Retire first (high confidence, strong live coverage):** Initiate Call's Vapi fixtures, Call Logs' randomized fields, Live View's generated calls, Dashboard's hardcoded/randomized metrics, AI Agents' identity fields.
2. **Retire once backend gaps are resolved (medium confidence, partial coverage):** Analytics' hardcoded panels, Reports' hardcoded stats and dead type model (revive, don't discard), QA Review's hardcoded queue (replace with auto-flagged real calls first, manual workflow second).
3. **Retire only after a product decision, not before (no coverage, decision-gated):** Campaigns and NPS mock generators (B1/B2), Orchestrator's hardcoded flows (B13), AI Agents' configuration mock (B5), Settings' non-functional fields (B10).
4. **Never mock, already live — nothing to retire:** WhatsApp, Formatting Hub.
5. **Deferred, mock data stays as-is until the (later) auth phase:** `sampleUsers.ts`, the main-app login check.

---

## 15. Cross-Module Dependencies

- **AI Agents ↔ Initiate Call:** two incompatible mock `AIAgent` types and agent lists today; should converge on one live agent directory (`GET /api/v1/agents`) — see §4.11.
- **Campaigns ↔ Scripts:** two inconsistent script sources used between the campaign list/detail view (`sampleCallScripts` direct import) and the create wizard (`generateIndustrySpecificScripts()`) — needs reconciling regardless of backend timing.
- **NPS ↔ Campaigns:** structurally near-identical wizard patterns and status enum, but entirely separate script pools and mock datasets — worth deciding whether they should share more implementation once real, given how similar the underlying business action ("AI calls/messages a customer") is.
- **Call Logs / Live View / Dashboard / QA Review:** all read from the same conceptual "call" entity but currently via different mock-generation paths with different (and inconsistent) field values for the same concept (e.g. sentiment, intent accuracy) — once live, all four should draw from the same `call-data` service layer, not four separate derivations, to guarantee consistency.
- **Orchestrator ↔ Voice Agent backend:** currently no link at all; the data model's `channels` field (`voice|text|whatsapp`) implies an intended one — unresolved (B13).
- **WhatsApp ↔ Vapi ↔ Formatting Hub:** WhatsApp's AI-reply depends on Vapi; Formatting Hub displays the logged output of that same pipeline — the three are one dependency chain, not independent (§4.9, §4.10, §4.9 B11).
- **Reports ↔ Analytics:** confirmed **not** currently linked (each independently calls `useIndustryData()`) — recommend both draw from one shared aggregation service once live, to avoid the two screens silently disagreeing on the same numbers.
- **Sidebar navigation ↔ permissions:** every module's page-level visibility is gated by `hasPermission` against the Sidebar's declared permission string; this is the one cross-cutting mechanism touching all 16 modules, and its consolidation (two duplicate implementations today) affects every module equally.

---

## 16. Proposed Development Phases

Building on Phase 2's sequence, now widened to cover this phase's full module set and explicitly gated by the product/backend decisions in §17:

**Phase A — Foundation (no product decisions blocking):** transport + proxy scaffold; `calls`/`agents` service layer; Initiate Call; Call Logs; transcript detail. (= Phase 2's first slice, unchanged, still the right starting point.)

**Phase B — Extend the same service layer (no product decisions blocking):** Live View (read side only — transfer action blocked on B4); Dashboard (metrics that map directly — CSAT/agent-status blocked on B6/B7); Analytics (rate-based panels only — timing/quality blocked on B8, pending Swagger).

**Phase C — Decision-gated, backend-dependent:** Campaigns, NPS, QA Review write-back, AI Agents configuration, Live View's transfer action, Reports scheduling — each unblocks independently as its respective backend gap (§8) and product decision (§17) are resolved. Not a strict sequence; prioritize whichever gaps get resolved first.

**Phase D — Orchestrator:** contingent entirely on the product decision in B13; if resolved as "Supabase-backed internal tool," this can actually move earlier (low technical risk, schema already exists); if resolved as "must drive live agent behavior," it depends on backend work not yet scoped at all.

**Phase E — WhatsApp AI-reply migration:** time-sensitive (Vapi retirement), not sequence-dependent on the phases above — should be resolved (B11) and executed in parallel with Phase A/B, not queued behind them.

**Phase F — Deferred, last priority per instruction:** Authentication, User Management, Settings.

---

## 17. Open Product Decisions

Everything in this document that stops at "needs your decision" rather than a recommendation, consolidated:

1. **B4 — Live-call transfer/escalation:** request a new backend action, or leave this fully-designed feature switched off?
2. **B11 — WhatsApp AI-reply source:** confirm whether a text/chat equivalent to Vapi exists on the new backend before Vapi is retired. Time-sensitive.
3. **B2 — NPS:** dedicated backend feature, or derived from existing call transcripts/outcomes? These are architecturally very different.
4. **B13 — Orchestrator's product intent:** does it drive live agent behavior, or is it a self-contained Supabase-backed design tool?
5. **B5 — AI Agents configuration:** a frontend-owned feature (needs new backend writes) or backend/ops-owned (frontend becomes read-only)?
6. **B6 — CSAT:** track it at all, and if so, where does the score come from?
7. **B9 — Reports:** is scheduled, multi-format (PDF/Excel/PowerPoint) generation a real requirement, or is on-demand client-side export sufficient?
8. **B14 — Missing 6th reference document / Swagger spec:** should this be pulled before implementation to close out B6/B8/B9/B12 with certainty rather than assumption?
9. Campaigns' simulated "Salesforce" option — real integration, or remove?
10. Several UI-decision items in §11 that don't block backend work but do need a call before their screens are finalized.

---

## Executive Summary

**Modules analysed:** 16 (Authentication, Dashboard, Initiate Call, Call Logs/Detail/Transcript, Live View, Outbound Campaigns/Create Campaign, NPS Campaigns, QA Review, WhatsApp, Formatting Hub, AI Agents, Orchestrator, Analytics, Reports, User Management, Settings).

**Close to live-ready** (strong or near-complete API coverage, low product-decision risk): **Initiate Call** (direct 1:1 replacement, no open questions) and **Call Logs/Call Detail/Transcript** (the strongest field-level match found anywhere in the app). **Live View**'s read side is nearly as ready; its one write action (transfer to human) is blocked on a backend decision, not a technical one. **Dashboard** and **Analytics** are ready for their DIRECT-mapped portions, with clearly scoped remainders pending decisions.

**Require significant backend development or a prior product decision:** Outbound Campaigns, NPS Campaigns, QA Review's write-back path, AI Agents' configuration path, Reports' scheduling/export, and — the most consequential single item — WhatsApp's AI-reply pipeline, which is fully live today but built entirely on the Vapi capability being retired, with no confirmed replacement. Orchestrator is a special case: its persistence layer already exists (unused Supabase schema) but its entire product purpose is undecided.

**Major architectural decisions:** (1) domain-neutral service-layer design confirmed as the right shape, now explicitly not banking-scoped; (2) a thin server-side proxy is required for every Voice Agent backend call, full stop; (3) polling, not push, is the realtime strategy everywhere except WhatsApp (which keeps its existing Supabase Realtime); (4) Orchestrator's Supabase schema should be adopted as-is rather than duplicated into the Voice Agent backend, pending the product-intent decision; (5) the two duplicate `hasPermission` implementations should consolidate to one before any real authorization is built on top.

**Major product decisions needed from you:** the WhatsApp AI-reply replacement (time-sensitive), whether live-call transfer is worth a new backend endpoint, whether NPS is a dedicated feature or transcript-derived, Orchestrator's actual purpose, whether AI Agent configuration belongs in this product at all, and whether the missing 6th reference document/Swagger spec should be pulled now to close out several "unconfirmed" items with certainty.

**Recommended implementation phases:** (A) foundation + Initiate Call + Call Logs + transcript, no decisions blocking; (B) Live View reads + Dashboard/Analytics direct-mapped portions; (C) decision-gated modules as each backend gap resolves; (D) Orchestrator, timing dependent entirely on its product-intent decision; (E) WhatsApp AI-reply migration, run in parallel and urgently, not queued behind the others; (F) Authentication/User Management/Settings, last, per your explicit instruction.

Stopping here per your instructions — no implementation has begun, mock data has not been removed, and this scope awaits your approval before any further work.
