# Backend Capability Reconciliation

**Status:** Planning only. No code changed producing this document. Reconciles the earlier planning docs (Phase 2 Live Integration Plan, Phase 3 Functional Scope, Phase 4 AI-Native Scope, Session 2 Plan) and the current Session 1/2 implementation against the newly confirmed Swagger endpoints below.

**Source of the new endpoint details:** the Swagger spec itself remained unreachable when checked again for this pass (`bankingvoicebot.nl-demo.com` returned HTTP 502, consistent with its intermittent availability throughout this engagement). The endpoint shapes below are taken as given from your prompt, which states them as Swagger-confirmed — treated as authoritative for this document, same standing as the three endpoints confirmed by the original reference docs. Nothing beyond what you specified is assumed; where a field's exact type isn't stated, it's marked as inferred.

---

## 1. Confirmed Endpoint Inventory

| # | Endpoint | Status |
|---|---|---|
| 1 | `POST /api/v1/call` | Existing, integrated (Session 1/2) |
| 2 | `GET /api/v1/call-data` | Existing, integrated (Session 1/2) |
| 3 | `GET /api/v1/agents` | Existing, integrated (Session 1/2) |
| 4 | `GET /api/v1/sessions/{session_id}` | Existing, integrated (Session 1/2) |
| 5 | `GET /api/v1/sessions` | **Newly confirmed — not yet integrated** |
| 6 | `GET /api/v1/sessions/{session_id}/recording` | **Newly confirmed — not yet integrated** |
| 7 | `POST /api/v1/chat` | **Newly confirmed — not yet integrated** |
| 8 | `GET /api/v1/analytics/metrics` | **Newly confirmed — not yet integrated** |

---

## 2. Purpose of Each Endpoint

**`POST /api/v1/call`** — initiates a real outbound voice call. Request/response fully documented since Phase 2. No change from prior understanding.

**`GET /api/v1/call-data`** — the rich, filterable, paginated business record of calls (active + completed), with an embedded aggregate summary scoped to whatever filters are applied. This remains the *only* endpoint that carries agent identity, outcome, FCR, intent, sentiment, tags, campaign name, escalation trigger, authentication state, and embedded transcript per row. No other endpoint (old or new) duplicates this field set.

**`GET /api/v1/agents`** — the live agent directory (identity, persona, direction, language, default flag). No change from prior understanding (confirmed live during Session 1's follow-up fix).

**`GET /api/v1/sessions/{session_id}`** — full ordered transcript for one session, sourced from Redis (live) with a Couchbase fallback (completed). No change from prior understanding.

**`GET /api/v1/sessions` (new)** — a **lightweight, no-filter, cross-cutting session list**: active sessions from Redis, plus up to 100 most recent completed calls from the database, newest first. Fields given: `session_id`, `type`, `status`, `phone_number`, `interaction_count`, `start_time`. Notably: **no agent identity, no outcome, no sentiment, no intent, no tags, no escalation trigger** — this is a session-lifecycle list, not a business-record list. The presence of a `type` field (not documented as fixed to `"voice"`, unlike `call-data`'s `channel` field, which *is* fixed to `"voice"`) is a meaningful signal: this endpoint's shape looks designed to eventually list sessions across channels (voice today, potentially chat/WhatsApp sessions once `/chat` is in use), not just voice calls. This directly matches the Phase 4 (AI-Native Scope) architecture principle of treating a call as "one type of interaction" in a shared model — `/sessions` looks like the closest thing the backend currently offers to that shared, channel-agnostic session concept, even though nothing here proves chat sessions actually appear in this list yet.

**`GET /api/v1/sessions/{session_id}/recording` (new)** — streams the call recording as `audio/wav`, with the backend handling S3-backed and local storage transparently. This is architecturally more robust than `call-data.voice_record_url`, which is a raw, possibly pre-signed, possibly storage-backend-specific URL string embedded in a business-record row. See §6 for the recommendation.

**`POST /api/v1/chat` (new)** — a text-channel AI turn: send a `message` (and optionally a `session_id` to continue a prior turn), get back `response` plus rich provenance metadata (`data_source`, `authenticated`, `intent`, `confidence`, `detection_method`, `latency_ms`). Requires a `chat`-scoped API key permission (distinct from `calls`, per the Trigger Call doc's own scope note). This is structurally and purposefully the same shape as Vapi's `/session` + `/chat` pair that currently powers WhatsApp's AI auto-reply — see §8.

**`GET /api/v1/analytics/metrics` (new)** — a dedicated, **date-ranged-only** (no status/direction/outcome/search filters) aggregate KPI endpoint over completed calls. The example metrics listed (`total_calls`, `fcr_rate`, `avg_aht_seconds`, `escalation_rate`, `resolved_count`, `escalated_count`) are a subset that already exists, field-for-field, inside `call-data`'s embedded `summary` object. The distinction is scope, not new numbers: `call-data.summary` is *entangled* with whatever list filters/pagination are currently applied (by design — that's what makes it correct for Call Logs' own KPI tiles); `analytics/metrics` is a clean, standalone KPI source meant to be queried independently of fetching any row data. See §7.

---

## 3. Current Frontend Consumers

| Endpoint | Consumer |
|---|---|
| `POST /api/v1/call` | `src/services/calls/callsService.ts` → `triggerCall()` → `useTriggerCall()` → Initiate Call |
| `GET /api/v1/call-data` | `callsService.ts` → `fetchCallData()` → `useCallData()` → Call Logs, Initiate Call's "Recent Calls" panel |
| `GET /api/v1/agents` | `src/services/agents/agentsService.ts` → `fetchAgents()` → `useAgents()` → Initiate Call's agent selector |
| `GET /api/v1/sessions/{id}` | `callsService.ts` → `fetchSessionTranscript()` → `useInteractionTranscript()` → Interaction Detail dialog (on-demand + active-call polling) |
| `GET /api/v1/sessions` | None |
| `GET /api/v1/sessions/{id}/recording` | None — `InteractionDetailDialog.tsx` currently plays `Interaction.recording.url`, sourced from `call-data.voice_record_url` only |
| `POST /api/v1/chat` | None — WhatsApp's AI-reply path still calls Vapi's `/session`+`/chat` (untouched, out of scope this pass) |
| `GET /api/v1/analytics/metrics` | None |

---

## 4. Newly Available Capabilities

1. A **lightweight, purpose-built live/recent session list** (`/sessions`) that doesn't require fetching full business records to know "what sessions exist right now."
2. A **proper streaming recording endpoint**, removing the dependency on `call-data` having correctly populated a (possibly ephemeral) `voice_record_url` string.
3. A **confirmed, real backend text-chat capability** with richer provenance metadata (`data_source`, `intent`, `confidence`, `detection_method`) than Vapi ever returned — directly relevant to closing the WhatsApp Vapi-dependency gap (§8).
4. A **dedicated, filter-independent KPI endpoint**, appropriate for a Dashboard that shouldn't need to understand Call Logs' pagination/filter state just to show headline numbers.

---

## 5. Previous Assumptions Now Invalidated (or Updated)

| Prior assumption | Status now |
|---|---|
| "`voice_record_url` is the only recording access mechanism" (Session 1/2) | **Invalidated** — a dedicated, more robust streaming endpoint exists; see §6 |
| "No text/chat equivalent to Vapi exists on the new backend" (Phase 2 G8 / Phase 3 B11) | **Substantially updated, not fully closed** — a real chat endpoint exists and is structurally the right shape; full closure still needs the items in §8 |
| "No purpose-built live/recent session source exists beyond `call-data?status=active`" (implicit in Session 2/3 planning) | **Updated** — `/sessions` exists, but see §6's recommendation on when to actually prefer it |
| "`GET /api/v1/agents` schema is unconfirmed/provisional" (Session 1) | Already resolved before this pass (live-verified in Session 1's follow-up) — not new, just reconfirmed settled |

**Explicitly NOT invalidated — still stand as documented:**
- The backend remains multi-domain in principle; nothing in the 4 new endpoints is domain-specific, and nothing here reintroduces a banking-only assumption.
- `call-data` has no single-`call_id`-keyed lookup query param — still true. Not a practical gap: `session_id` and `call_id` are the same underlying identifier (confirmed by Session 1's mapper treating them as one normalized `interactionId`), and `/sessions/{id}` already serves the ID-keyed lookup need for transcript purposes.

---

## 6. Remaining Backend Gaps (Reassessed)

Per instruction, nothing below is assumed to exist just because it would be convenient — each line is either confirmed absent from the 8 known endpoints, or explicitly flagged as unconfirmed rather than assumed.

| Gap | Closed by new endpoints? | Notes |
|---|---|---|
| CSAT score | **No** | Not present in `call-data`, `sessions`, or `analytics/metrics`. Still fully unresolved. |
| True per-agent live engagement status (engaged/idle/awaiting/escalation) | **No** | `/sessions`' fields (`session_id, type, status, phone_number, interaction_count, start_time`) do **not** include agent identity at all — this gap is *not* closed, and in fact `/sessions` is less agent-aware than `call-data`, not more. |
| Per-stage timing/quality metrics (STT/LLM/TTS latency, GPU cost, P95) | **No** | `analytics/metrics`'s example fields mirror `call-data.summary` almost exactly (`total_calls`, `fcr_rate`, `avg_aht_seconds`, `escalation_rate`, `resolved_count`, `escalated_count`) — no latency/quality breakdown. Still unresolved; do not assume this endpoint quietly grew the richer metrics the vendor's own dashboard shows. |
| Campaign lifecycle (create/list/progress/cancel) | **No** | Not mentioned anywhere in the newly confirmed set. Per instruction, not assumed to exist. |
| NPS structured data | **No** | Same — not mentioned, not assumed. |
| QA review write-back | **No** | Same. |
| Live-call transfer/escalation action | **No** | Same — none of the 8 endpoints support mutating an in-progress call's routing. |
| Tool/KB provenance + decision-trace detail (the vendor UI's "Session Logs panel" deeper content) | **No — newly confirmed absent, see §9** | `/chat`'s response includes `data_source`/`detection_method` per turn, but only synchronously in that one request's response — neither `/sessions/{id}` nor `/sessions` exposes this after the fact. |
| Full multi-page CSV export | N/A | Not a backend gap — a frontend scope decision already documented in Session 2's plan, unaffected by any of this. |

**New, narrow gap surfaced by this reconciliation:** `/chat`'s exact error-response shape/retry semantics aren't specified in what was provided — relevant to §8's WhatsApp assessment, flagged there rather than invented here.

---

## 7. Recommended Data-Source Ownership by Module

Validated against the actual current code (Session 1/2), not just restated from your prompt's suggested wording:

| Data need | Source | Confirms/changes current code |
|---|---|---|
| Business interaction history, filters, per-call rich detail, summary tiles scoped to active filters | `call-data` | **Confirms** current Call Logs implementation exactly as built — no change |
| Live/recent session existence & lightweight lifecycle (candidate for a future cross-channel session directory) | `sessions` | **New** — not yet consumed anywhere; recommended role below in §10, not a Session 2 change |
| Single-session full transcript | `sessions/{id}` | **Confirms** current `useInteractionTranscript`/Interaction Detail implementation — no change |
| Authoritative recording playback | `sessions/{id}/recording` | **New primary**, see §6 recommendation below — not applied retroactively to Session 2 (deferred, not urgent) |
| Filter-independent aggregate KPIs (Dashboard-style headline numbers) | `analytics/metrics` | **New** — recommended for Session 3's Dashboard KPI cards instead of either the current hardcoded values or reusing `call-data.summary` |
| Agent identity, direction, persona | `agents` | **Confirms** current Initiate Call implementation — no change. Only where actual agent identity is needed; not a substitute for a live-status source that doesn't exist (see gap table above) |
| Text-channel AI reply | `chat` | **New candidate** to replace Vapi in WhatsApp's AI-reply path — not applied yet, see §8 |

### Recording: `voice_record_url` vs. `sessions/{id}/recording`

**Recommendation: `sessions/{id}/recording` should become the primary source, with `voice_record_url` demoted to a presence signal only** (used to decide whether to attempt playback at all — i.e., only render the audio control when `call-data` indicates a recording likely exists — rather than as the actual `<audio src>`). Reasoning: the dedicated endpoint is described as handling both S3 and local storage transparently and streams through the API (implying it's the authoritative, always-correct path), whereas `voice_record_url` is a raw stored string that could be a pre-signed URL with an unknown expiry or simply absent in storage configurations the dedicated endpoint would still handle. Practically, this means adding a proxied route (e.g. `/api/calls/session/[id]/recording`) that streams `audio/wav` through, and pointing the existing `<audio>` element at that instead of the raw `voice_record_url`.

**Is this a Session 2 correctness bug requiring an immediate fix? No — no evidence of current breakage.** Live verification during Session 2 showed a working, playable recording via `voice_record_url` for at least one real call. Per your instruction to prefer deferring optional improvements, this is recommended as a small, contained Session 3-adjacent follow-up (or its own short session), not a reopening of Session 2.

---

## 8. Session 2 Impact Assessment

**Direct question: does anything in Session 2 need correcting because of these newly confirmed APIs?**

**No urgent or blocking correction identified.** Specifically, re-answering your four listed questions:

1. **Should `voice_record_url` remain primary or become fallback?** → Recommend swapping to `sessions/{id}/recording` as primary (§6), but this is an improvement, not a fix — no confirmed breakage today. Defer.
2. **Should active interaction handling use `/sessions` more directly?** → Not for Session 2's existing scope (Call Logs, Initiate Call, Interaction Detail) — those screens need the rich per-call fields (agent, outcome, sentiment, escalation) that only `call-data` provides; `/sessions`' lightweight shape doesn't carry them. This question is much more relevant to Session 3 (Live View) — addressed in §10.
3. **Should Call Logs remain based on `call-data`?** → **Yes, unambiguously.** Nothing in the new endpoints offers a comparable business-record shape; `call-data` is confirmed as the correct, purpose-built source and this reconciliation changes nothing about that.
4. **Is any immediate correction necessary before Session 3?** → No blocking correction. One **unrelated, pre-existing** finding surfaced while re-reading the current code for this reconciliation (not caused by the new APIs): the Session 2 plan's designed post-trigger status poll (`useInteractionTranscript(interactionId, {poll: true})`, with the 60s-safety-cap guardrail) was built as reusable hook infrastructure and is correctly wired into the Interaction Detail dialog for active calls, but was **never actually wired into Initiate Call's post-trigger flow** — `useInitiateCall()` exposes `lastTriggeredInteractionId` but no component currently consumes it. The "Recent Calls" panel does correctly show the new call (via cache invalidation), just not framed as the live status poll the plan described. This is a minor, low-risk gap worth closing at some point, but it's cosmetic (the user does see their call appear), not a data-correctness issue, and is unrelated to today's API discoveries — flagging it here for completeness rather than recommending immediate action.

---

## 9. Session Logs Reassessment

The vendor's Dashboard User Guide describes a "Session Logs panel" with: a dropdown of sessions, per-interaction cards, and — critically — "the decision steps the bot took... how it routed the request" and provenance tagging ("knowledge-base search, a tool call, and so on"). Your prompt asks whether `GET /api/v1/sessions` fully explains this. **It does not, and the three concepts should not be collapsed:**

- **Business Call Logs** = `call-data`. Audit-oriented, rich, filterable, voice-only, no per-turn provenance.
- **Live/recent Sessions** = `sessions` (list) + `sessions/{id}` (transcript). Lifecycle-oriented, lightweight, likely cross-channel in intent. `sessions/{id}`'s transcript is `user_message`/`bot_response`/`timestamp` pairs only — **no provenance field**.
- **Technical/session trace logs (tool/KB provenance, decision steps)** = **not explained by any of the 8 confirmed endpoints.** The closest available data is `/chat`'s per-request `data_source`/`detection_method` fields — but those are only returned synchronously in that one live response, not retrievable afterward via `/sessions/{id}` or any other endpoint. The vendor's own dashboard separately links out to "Langfuse" (a distinct external tracing tool, noted explicitly in its top bar per the Dashboard User Guide) — strongly suggesting the deeper trace/provenance view the Session Logs panel shows is sourced from Langfuse directly, not from this v1 integration API surface at all.

**Conclusion: if a Session Logs-equivalent feature is ever wanted in this product, it cannot be built from `call-data`/`sessions` alone.** It would need either a dedicated Langfuse integration (separate credentials were shared in the original vendor email, unused so far) or a backend enhancement request to persist per-turn `data_source`/`detection_method` into `sessions/{id}`'s transcript. Not assumed to exist; flagged as an open question for later, not fabricated here.

---

## 10. WhatsApp Impact Assessment

**Does `POST /api/v1/chat` close the AI-reply backend gap (Phase 2 G8)? Substantially yes, pending validation — not modified this pass, per instruction.**

The shape lines up directly with what the two Vapi-dependent edge functions (`process-pending-message`, `whatsapp-webhook`) currently do: send inbound text, get back a reply, persist a `session_id` for continuity. `/chat`'s response is materially richer than Vapi's (`data_source`, `intent`, `confidence`, `authenticated`, `latency_ms` vs. Vapi's bare reply text).

**What integration work would still remain, concretely, before this could actually replace Vapi:**

1. **Session persistence migration** — `whatsapp_sessions` currently stores a Vapi-issued `session_id`. Switching the AI source means the stored `session_id` must come from `/chat`'s responses instead; existing in-flight Vapi sessions would need a defined cutover behavior (start fresh vs. attempt migration — a product decision, not a technical one).
2. **Transport (Supabase/Twilio)** — unaffected. Only the AI-generation call inside the two edge functions changes; message storage/delivery stays exactly as-is.
3. **Formatting pipeline** (`vapi-formatter.ts` — already generic text formatting despite its name, per Session 1's finding) — unaffected in logic, just fed `/chat`'s `response` field instead of Vapi's `output[0].content`.
4. **Retries/error handling** — the current code has specific handling for one documented Vapi failure mode (a 400 "session" error triggering session recreation). `/chat`'s error behavior wasn't specified in what was provided — **genuinely unknown, not assumed** — must be confirmed (ideally via the Swagger spec once reachable, or a live test call) before this can be considered a safe like-for-like replacement.
5. **Permissions** — Swagger states `/chat` requires a `chat`-scoped API key permission, distinct from the `calls` scope `POST /api/v1/call` needs. **Unconfirmed whether the current `VOICEBOT_API_KEY`** (already provisioned and working for the 4 existing endpoints) **carries this scope** — a concrete pre-flight check required before any real cutover attempt, not assumed granted just because the other scope works.
6. **New optional UX surface** — `/chat`'s richer fields (`intent`, `confidence`, `authenticated`) could enhance WhatsApp Hub/Formatting Hub displays, but that's a future enhancement, not required for parity with current Vapi behavior.

**Not modified this pass, per instruction** — this assessment is groundwork for a future WhatsApp cutover, not an authorization to start it.

---

## 11. Implications for Session 3

Directly answering the four architecture questions posed:

- **Should Live Operations use `/sessions` for live state?** Not as the primary source — `/sessions`' fields don't cover what the current Live View UI displays (agent identity, sentiment, intent, escalation trigger). `call-data?status=active` remains the correct primary source, exactly as Phase 2 originally planned, because it's the only endpoint with those fields. `/sessions` is a legitimate lightweight supplement (e.g., a fast "how many sessions total, across future channels" signal) but adopting it as Session 3's primary mechanism would be a functional regression against the current UI's field needs — not recommended. Full consolidation onto `/sessions` is a plausible *future* move once/if chat-channel sessions genuinely need to appear in the same live view, not a Session 3 requirement.
- **Should Dashboard use `call-data` for recent interactions?** Yes — same small, unfiltered `useCallData` pattern already established for Initiate Call's "Recent Calls," reused as-is.
- **Should Dashboard use `analytics/metrics` for KPI cards?** Yes, recommended — it's the purpose-built, filter-independent source, appropriate for headline numbers that shouldn't be entangled with any list's pagination/filter state. This replaces Dashboard's current hardcoded values; it does **not** replace Call Logs' own summary tiles, which correctly continue using `call-data.summary` (filter-scoped by design, already correct).
- **Should `/agents` be used only where actual agent identity is needed?** Yes, confirmed — and explicitly, per-agent live *status* (engaged/idle/etc.) has **no backing data anywhere**, even after this reconciliation (§6). Session 3 must not fabricate that status; treat it as a UI decision (approximate-derive from active `call-data` rows' `agent_id`, or simplify the UI) per the existing Phase 2/3 guidance, unchanged by today's findings.

This is the basis for the Session 3 plan below.

---

# Session 3 Implementation Plan — Live Operations + Dashboard

**Status:** Planning only, per instruction. No code written.

## Scope confirmation

Per Phase 4's module inventory and the reconciliation above: convert **Live View** and **Dashboard** to live data, using `call-data` as primary for both, `analytics/metrics` for Dashboard's KPI cards, and `agents` where identity is needed. `/sessions` and `/sessions/{id}/recording` are **not** required for this session's scope (see §11 above) and are not planned here — noted as available for later, not built speculatively now, consistent with "do not create speculative service modules."

## Current-state inspection (already re-confirmed this pass, unchanged since baseline)

**Dashboard** (`src/pages/Dashboard.tsx`): hardcoded `activeCalls=2`, `avgSentiment=68`, `csatScore=3.5`, `avgHandleTime="3m 45s"` (comments literally say "Static for the screenshot match"); `recentCallsData` from `useIndustryData().callLogs`; `aiAgentsData` from `useIndustryData().agents` with `Math.random()`-generated call counts/success rates and index-based fake status.

**Live View** (`src/pages/LiveView.tsx`): fully client-generated via `generateIndustrySpecificLiveViewCalls/Agents/Transcripts()` — not polling anything real. A complete "Transfer to Human" dialog (9-option reason dropdown, notes, summary) exists but its trigger is permanently dead code (`{condition && false && (...)}`). "Listen In"/"Mute" controls exist but are wrapped in a hardcoded `hidden` class. No backend action exists for transfer/escalation (§6 of the earlier Functional Scope doc, unchanged by this reconciliation) — this remains a genuine backend gap, not something Session 3 can close by itself.

## Files to modify/create

**New hooks:**
- `src/hooks/analytics/useAnalyticsMetrics.ts` — `useQuery` wrapper around a new `fetchAnalyticsMetrics(dateRange)` service call
- `src/hooks/calls/useLiveCallData.ts` — thin wrapper around the existing `useCallData({status: 'active'})`, with `refetchInterval` for polling (see below) — kept separate from the base `useCallData` so the polling concern doesn't leak into Call Logs' usage

**New DTOs/service/mapper:**
- `src/types/api/analytics.ts` — `AnalyticsMetricsQueryDto` (`date_from`, `date_to`), `AnalyticsMetricsResponseDto` (the confirmed example fields: `total_calls`, `fcr_rate`, `avg_aht_seconds`, `escalation_rate`, `resolved_count`, `escalated_count` — typed only from what's confirmed, not padded with guessed fields)
- `src/services/analytics/{analyticsService,analyticsKeys}.ts` — following the exact same pattern as `calls`/`agents`

**New proxy route:**
- `api/analytics/metrics.ts` — thin passthrough, same pattern as `api/calls/data.ts` (query param forwarding, `X-API-Key` attachment, `withErrorBoundary`)

**Modified screens:**
- `src/pages/Dashboard.tsx` — replace hardcoded metrics with `useAnalyticsMetrics()`; replace `useIndustryData().callLogs`-based Recent Calls with a small `useCallData({page_size: N})` call (same pattern as Initiate Call); AI Agent Status panel sources identity from `useAgents()`, with per-agent "status" either derived approximately from active `call-data` rows' `agent_id` or simplified to remove the fake engaged/idle labels — **recommend the latter** (simplify) unless you want the approximate-derive version, since deriving a false precision from data that doesn't actually support it risks being more misleading than a simpler "agent roster" view; flagging as a decision point rather than assuming.
- `src/pages/LiveView.tsx` — replace `generateIndustrySpecificLiveViewCalls/Agents()` with `useLiveCallData()` (`call-data?status=active`, polling); summary tiles (Active Calls, connecting/escalated counts) sourced from the same response's `summary` object, matching the documented fields exactly (`active_calls`, `connecting_calls`, `escalated_calls`) rather than recomputing client-side.
- **Not touched:** the dead Transfer-to-Human dialog and "Listen In" controls stay exactly as they are (still dead), since no backend action exists to wire them to — consistent with the standing gap, not a regression introduced by this session.

## Polling strategy

Per Phase 2 §11 (unchanged by this reconciliation): Live View polls `call-data?status=active` every 3–5s while the screen is mounted (stop on unmount, standard TanStack Query `refetchInterval` + cleanup — no custom safety-cap logic needed here since this is a normal "screen is open" poll, not a bounded post-action poll like Session 2's transcript polling). Dashboard polls more conservatively (e.g. 15–30s), matching the vendor dashboard's own "Auto (10s)" pattern loosely, without being aggressive about a summary view.

## Verification plan (mirroring Session 2's rigor)

1. `tsc`/`build`/`lint` — confirm no new issues against the current baseline (82/65/17)
2. Deployed smoke tests: confirm `/api/analytics/metrics` returns real aggregate numbers matching a direct comparison against `call-data`'s own summary for the same date range (they should agree, since both ultimately aggregate the same underlying completed-call data)
3. Confirm Live View's active-call list matches a direct `call-data?status=active` fetch at the same moment
4. Confirm Dashboard's Recent Calls panel and Live View's active list are internally consistent with Call Logs (same underlying data, no drift from three different derivations)
5. Confirm polling actually stops on navigating away from Live View (no leaked intervals)
6. Regression-check Session 1/2 fixes remain intact: SPA routing, `/api/*` functions, Initiate Call → Call Logs flow

## What this session explicitly does not do

- Does not wire `/sessions` or `/sessions/{id}/recording` (deferred per §11 — no current UI need)
- Does not attempt the Transfer-to-Human action (no backend endpoint exists)
- Does not touch WhatsApp, Campaigns, QA, Analytics (the separate module), Reports, Customers, User Management, Settings, NPS, Orchestrator, or Authentication

---

Stopping here per instruction — no code written, awaiting your review of both the reconciliation and the Session 3 plan before implementation begins.
