# Call Centre — Live Integration Plan

**Phase:** 2 — Planning & architecture only. No integration code was written while producing this document. This builds on `docs/CALL_CENTRE_BASELINE_AUDIT.md` (Phase 1) — that audit is not repeated here except where its findings directly support a decision below.

**Date:** 2026-09-22

---

## 1. Objective and Scope

**Objective:** integrate all existing Call Centre screens with the live Banking Voicebot backend, remove mock/simulated/demo data, and introduce a clean, extensible integration architecture (screens → hooks/view-models → typed API/service layer → transport adapters → live backend) so future modules don't need ad-hoc API calls inside pages.

**This phase produces a plan only.** No screens were changed, no mock data was removed, no dependencies were touched, no Vapi code was deleted, no Supabase/Twilio behavior was modified, and authentication was left exactly as-is.

**UI fields/metrics/cards/controls are not automatically preserved** — each is evaluated case by case against what the live backend actually supports (§6), and a recommendation (keep/derive/extend backend/change UI/remove) is given rather than assumed.

---

## 2. Assumptions and Explicit Exclusions

**Reference documents reviewed** (§ per your prompt, "six reference documents" were expected; **five concrete artifacts were found** in `docs/`, listed below — flagged as a discrepancy, not blocking, since together they provided a complete, sufficient API contract for this plan):

1. `docs/Trigger_Call_API.docx` — `POST /api/v1/call`
2. `docs/Session_Transcript_API (1).docx` — `GET /api/v1/sessions/{session_id}`
3. `docs/Call_data_API (1).docx` — `GET /api/v1/call-data`
4. `docs/Voicebot_Dashboard_User_Guide.docx` — walkthrough of the vendor's own reference dashboard (Voice Mode, Chat Mode, Analytics, Call Metrics, Campaigns, Resources, Session Logs, Tool Selector)
5. `docs/email.txt` — cover note: base URL, auth header, credentials (redacted), and a Swagger/OpenAPI link

The email references a 6th artifact — the live Swagger UI / `openapi.yaml` at `https://bankingvoicebot.nl-demo.com/api/v1/docs` — which was **not fetched** for this planning pass (no live network call was made against the backend or Swagger). If that spec exposes endpoints beyond the 3 documented here (it likely does, per gaps identified in §7), it should be pulled before implementation begins, not assumed from this plan.

**No endpoints, fields, or capabilities are invented anywhere in this document.** Every `DIRECT`/`DERIVED` item cites a field that literally appears in one of the 3 documented API responses. Everything else is marked `BACKEND_GAP`.

**Explicit exclusions carried over from your clarifications:**

- `voiceforce-backend-v01-main.zip` and the empty `voiceforce-backend/` folder are ignored — export artifacts to be deleted, not analyzed.
- Existing Supabase RLS weaknesses (identified in the baseline audit, §11) are **not** addressed in this phase.
- WhatsApp-via-Supabase-and-Twilio is assumed to stay as-is — **except** one compatibility issue was discovered and must be surfaced to you (§8, §9): the WhatsApp auto-reply path is not merely "using Vapi somewhere nearby," it is *built entirely on* Vapi's `/session` and `/chat` endpoints. This is not something this plan resolves; it's a decision point for you.
- Vapi is being fully replaced; this plan identifies every dependency (§8) but does not remove any of it.
- Authentication remains the existing mock/local mechanism (`AuthContext.tsx`, hardcoded password) — untouched, last priority, called out only where it affects the proxy design (§10).

---

## 3. Live Backend / API Capability Inventory

**Backend:** "Banking Voicebot" — a banking-specific voice-agent system with a dashboard service that proxies to a Voice Gateway (Twilio) and persists to PostgreSQL, Redis, and Couchbase.

**Base URL:** `https://bankingvoicebot.nl-demo.com` (local dev: `http://localhost:5050`)
**Auth:** `X-API-Key` header on every request. Trigger Call additionally requires the key to carry a `calls` permission scope; the other two endpoints accept any valid key.

| Endpoint | Method | Purpose | Auth scope | Notes |
|---|---|---|---|---|
| `/api/v1/call` | POST | Initiate an outbound voice call via Twilio | `calls` | Response body's `success` field must be checked even on HTTP 200 — gateway failures come back as 200 with `{"error": ...}` |
| `/api/v1/sessions/{session_id}` | GET | Full ordered transcript for one voice session (`session_id` = Twilio Call SID) | any key | Reads Redis first (live/recent), falls back to Couchbase |
| `/api/v1/call-data` | GET | List + paginate calls (active and/or completed), plus aggregate summary stats | any key | The single richest endpoint — covers most of Dashboard/Call Logs/Live View/Analytics in one call |
| `/api/v1/agents` (implied) | GET | List available `agent_id` values | unknown | **Only implied**, not fully documented — the Trigger Call doc references it for the live agent list, showing 3 sample rows (`agent_id`, display name, direction), but its own auth/pagination/full schema were not provided. Treat as **partially documented**; confirm the full contract (via Swagger, §2) before building the Initiate Call / AI Agents screens against it. |

**Known available agents** (from the Trigger Call doc's example table — confirm live via `GET /api/v1/agents` before relying on this list):

| `agent_id` | Display name | Direction |
|---|---|---|
| `emi-reminder-agent` | EMI Reminder | outbound |
| `forex-transaction-agent` | Forex Transaction | outbound |
| `inbound-banking-default` | Inbound Banking Assistant | inbound (default) |

**Known limitation:** an unrecognized `agent_id` does not error — it silently falls back to the default inbound agent. Any agent picker built against this API must validate selections against the live list, not just accept free text.

**Capabilities described in the Dashboard User Guide but NOT present in the 3 documented REST endpoints** (these belong to the vendor's own reference dashboard UI; whether an API exists behind them is unconfirmed):

- Chat Mode (text-based conversation with the same bot) — no REST endpoint documented; only the internal WhatsApp edge functions call Vapi's `/chat`-equivalent path today, which is being retired (§8).
- Campaigns (CSV upload, scheduling, concurrency control, per-campaign progress/cancel/delete)
- Per-call latency breakdown (STT, TTFT, LLM, TTS TTFB, Turn Latency, Tool, RAG, Orchestrator timings in ms) shown in "Call Metrics"
- Analytics extras beyond `call-data`'s summary: peak concurrency, turn-latency percentiles (P95), per-stage latency/GPU-cost charts, STT/TTS quality scores
- Resources (GPU/CPU/RAM/disk/network health)
- Session Logs panel (per-turn tool/KB provenance and decision trace)
- Tool Selector (enable/disable individual backend tools, e.g. balance lookup, card block)

These are listed here as capability *candidates* for future modules, not as APIs we can build against today — each is marked `BACKEND_GAP` where a current screen expects it (§6, §7).

---

## 4. Target Frontend Integration Architecture

```
Screens (src/pages/*)
        ↓  props / render only — no fetch, no transport types
UI hooks / view-models  (src/hooks/*)         e.g. useCallLogs(), useLiveCalls(), useInitiateCall()
        ↓  call typed service functions, own loading/error/pagination state (via TanStack Query — already installed, currently unused)
Typed API/service layer  (src/services/<domain>/*)   e.g. services/calls/callsService.ts
        ↓  DTO → UI model mapping happens here (adapters), never in a component
Backend adapters / transport  (src/services/transport/*)   one HTTP client, shared error/auth handling
        ↓
Voice Agent / Call Centre backend  (via a server-side proxy — see §10, never called with the raw X-API-Key from the browser)
```

This mirrors what `.lovable/plan.md` (found during the baseline audit) had already proposed for the mock-data layer — the same shape now carries real data instead. Screens keep their current component trees; only the import source changes, exactly as that prior plan intended.

Not building yet, but specifying now so every domain lands the same way:

- **Transport/client layer:** one small `fetchJson`-style wrapper (or a thin `axios`/`ky` instance if the team prefers — no new dependency is required, `fetch` is sufficient) that attaches auth, base URL (from environment/proxy config), and normalizes the two documented error shapes (`{success, error, message}` for auth errors vs. a plain string `detail` for not-found/upstream errors — both docs' Error Responses sections confirm this split, so the client must handle both, not just one).
- **Typed API DTOs:** one `types/api/<domain>.ts` per domain, typed directly from the documented response fields (e.g. `CallDataEntry`, `CallDataSummary`, `SessionTranscript`, `TriggerCallResponse`). These are intentionally separate from the existing `src/types/*` UI types, which describe what screens render today (mock-shaped) — keeping them separate is what makes the adapter layer meaningful instead of a no-op rename.
- **Adapters/mappers:** one function per screen/domain translating API DTO → existing UI type where a UI type is being kept (e.g. `mapCallDataEntryToCallLogRow()`), or a new UI type where the mock type doesn't fit reality (e.g. a `CallPayload` shaped for Vapi cannot represent a Trigger Call request — needs a new type, not a mapper).
- **Hooks/query layer:** `useQuery`/`useMutation` (TanStack Query, already a dependency, currently 0 usages per the baseline audit) per domain hook, replacing the current `useIndustryData()` pattern for screens going live. Query keys should include the active filters (date range, status, search) so caching/pagination behave correctly.
- **Error handling:** surface the two documented shapes distinctly — auth failures (401/403) should prompt a distinct "integration not configured" state (since the key lives server-side, a 401/403 from the proxy means a deployment/config problem, not a user error); validation errors (422) should map to inline form feedback (e.g. Initiate Call's `to_phone_number`); 502 (Trigger Call) and 404 (Session Transcript) need explicit empty/error states, not silent fallback to mock data.
- **Loading states:** each screen's existing skeleton/spinner patterns can stay; they just get wired to the query's `isLoading`/`isFetching` instead of always-resolved local state.
- **Polling strategy:** see §11.
- **Configuration/environment:** the proxy's base URL becomes the only new frontend env var (e.g. `VITE_VOICE_API_BASE_URL` pointing at the proxy, not at `bankingvoicebot.nl-demo.com` directly) — the real `X-API-Key` never reaches `import.meta.env` or the browser bundle.
- **Server-side proxying:** required for every call to this backend, because it requires a static `X-API-Key` — see §10.

---

## 5. Screen-by-Screen Live Integration Matrix

Legend: `DIRECT` / `DERIVED` / `BACKEND_GAP` / `UI_DECISION` / `LEGACY_VAPI` / `EXISTING_LIVE` (definitions per your prompt, §3 below has the full classified list).

| Screen | Current mock source | Live capability available | Real-time/polling need |
|---|---|---|---|
| Login/Landing | `sampleUsers.ts` + hardcoded password | None — auth excluded this phase | — |
| WhatsApp Authenticate | Supabase edge functions | Unaffected by this integration | — |
| Dashboard | `industryDataGenerator.ts`, some hardcoded metrics | `GET /api/v1/call-data` (summary + calls) covers most of it | Polling (no push channel documented) |
| Initiate Call | Vapi `fetch()`, `initiateCallAgents.ts` | `POST /api/v1/call` + `GET /api/v1/agents` | Poll `call-data`/`sessions/{id}` after trigger for status |
| Call Logs | `industryDataGenerator.ts`, `Math.random()` sentiment | `GET /api/v1/call-data?status=inactive` — near 1:1 field match | Standard list refresh, no push needed |
| Outbound Campaigns / Create Campaign | `industryCampaignGenerator.ts`, simulated "Salesforce" import | **None documented** | N/A until gap resolved |
| NPS Campaigns | `sampleNPSCampaigns.ts` etc. | **None documented**; possible signal buried in transcript text (see §7) | N/A until gap resolved |
| Live View | `generateIndustrySpecificLiveViewCalls/Agents/Transcripts()` | `GET /api/v1/call-data?status=active` | **Polling required** — no WebSocket/SSE documented |
| QA Review | Hardcoded inline arrays | Partial: `call-data`'s `sentiment`/`fcr`/`intent_accuracy`/`transcript_summary` give an auto-quality baseline; no manual QA workflow/write-back API | Standard list refresh |
| WhatsApp Hub | Live Supabase | Unaffected directly, but its AI-reply logic is Vapi-built (§8) | Existing Supabase Realtime |
| Formatting Hub | Live Supabase (`vapi_response_logs`) | Unaffected directly, same caveat as above | Existing |
| AI Agents | `sampleAIAgents.ts` | `GET /api/v1/agents` for identity/direction only; no config/capabilities fields exist server-side | Standard refresh |
| Orchestrator (4 screens) | `orchestratorFlows.ts` / inline | **None documented** — and no evidence this concept maps to the voice backend at all (see §7) | N/A until scoped |
| Analytics | `industryDataGenerator.ts` + inline chart arrays | Partial via `call-data.summary` (fcr_rate, escalation_rate, avg_aht_seconds, avg_intent_accuracy); richer charts (latency percentiles, per-stage timing, GPU cost) undocumented | Polling for "live now" style refresh |
| Reports | `industryDataGenerator.ts`, `sampleReports.ts` | Derivable from `call-data` for anything summarizable; no report-definition/scheduling API | Standard refresh |
| User Management | `sampleUsers.ts` | Excluded — auth/user backend not in scope this phase | — |
| Settings | No persistence | Excluded — deprioritized alongside auth | — |

---

## 6. Field/Action Mapping and Classifications

Only screens with real backend surface area are broken down to field level; screens with no documented backend capability are covered at screen level in §7 (backend gaps) instead of being padded with speculative field tables.

### 6.1 Call Logs — `CallLogs.tsx` (strongest mapping in the app)

| UI field (current, in `extendedCallLogs` mock shape) | Live source (`GET /api/v1/call-data`) | Class |
|---|---|---|
| `callerName` | `caller_name` | `DIRECT` |
| `callerNumber` | `caller_number` | `DIRECT` |
| `outcome` | `outcome` | `DIRECT` |
| `fcr` | `fcr` | `DIRECT` |
| `aht` (seconds) | `aht_seconds` | `DIRECT` |
| `callId` | `call_id` | `DIRECT` |
| `intentAccuracy` | `intent_accuracy` | `DIRECT` |
| `tags` | `tags` | `DIRECT` |
| `transcript` (currently a fabricated one-liner) | `transcript_summary`, or full `detailed_transcript`, or `GET /api/v1/sessions/{call_id}` for the turn-by-turn view (`TranscriptViewer.tsx`) | `DIRECT` |
| Sentiment badge (currently random per render) | `sentiment` + `sentiment_score` | `DIRECT` |
| Campaign label | `campaign_name` | `DIRECT` |
| Recording playback (not currently a feature) | `voice_record_url` (pre-signed S3 URL) | `DIRECT` — **new capability**, consider adding a play/download control since the data already supports it |
| Advanced filters: date range, search | `date_from`/`date_to`/`search` query params | `DIRECT` |
| Advanced filters: direction, outcome | `direction`/`outcome` query params | `DIRECT` |
| Advanced filters: duration range | `min_duration`/`max_duration` | `DIRECT` |
| "Channel" filter, if the UI currently implies non-voice channels here | `channel` is always `"voice"` on this endpoint | `UI_DECISION` — narrow the filter/label to voice-only for this screen, since WhatsApp transcripts live in a separate Supabase-backed system (Formatting/WhatsApp Hub), not `call-data` |
| Industry-flavored intent/terminology labels | No `industry` concept in the API at all | See §Industry note below |

### 6.2 Dashboard — `Dashboard.tsx`

| UI element | Live source | Class |
|---|---|---|
| Active Calls | `data.summary.active_calls` | `DIRECT` |
| Avg Handle Time | `data.summary.avg_aht_seconds` (completed) or `avg_handle_time_seconds` (active) | `DIRECT` |
| Recent Calls list (name/type/phone/status/duration) | `data.calls[]` (first N, sorted by `timestamp`) | `DIRECT` |
| Avg Sentiment (%) | Not a native field — average `sentiment_score` across calls in the window | `DERIVED` (compute in the service layer, don't request the backend to add it unless precision at scale becomes a concern) |
| CSAT Score | No field anywhere in `call-data` | `BACKEND_GAP` — no CSAT concept exists server-side; recommend either requesting a CSAT field/endpoint if the product needs it, or removing the tile (`UI_DECISION`) until it does |
| AI Agents "Engaged/Total" counts + per-agent status (Engaged/Idle/Escalation/Awaiting) | `GET /api/v1/agents` gives identity only, no live "is this agent currently on a call" state | `BACKEND_GAP` — could be *derived* approximately by joining active `call-data` rows' `agent_id` against the agent list, but true idle/awaiting states aren't derivable; flag as a decision point (derive an approximation vs. request a real endpoint) |
| "+12% from last week" style deltas | No historical-comparison field | `BACKEND_GAP` or `DERIVED` — computable client/service-side only if the service layer stores/queries two date ranges and diffs them; otherwise remove |

### 6.3 Live View — `LiveView.tsx`

| UI element | Live source | Class |
|---|---|---|
| Active call list, per-call duration | `GET /api/v1/call-data?status=active` — `duration_seconds` recomputed server-side in real time | `DIRECT` |
| Connecting / escalated counts | `data.summary.connecting_calls`, `data.summary.escalated_calls` | `DIRECT` |
| Live transcript snippet | `detailed_transcript` (live from Redis while active) or poll `GET /api/v1/sessions/{id}` | `DIRECT` |
| Any concept of "agents currently online" independent of calls | Not present — only call-attached `agent_id` | `BACKEND_GAP` |

### 6.4 Initiate Call — `InitiateCall.tsx` / `useInitiateCall.ts`

| UI element | Live source | Class |
|---|---|---|
| Phone number input | `to_phone_number` | `DIRECT` |
| Agent dropdown | `GET /api/v1/agents` (replacing `initiateCallAgents.ts`'s 8 fake industry agents with the real 3-agent, banking-only list) | `DIRECT` for the mechanism, `LEGACY_VAPI`/`UI_DECISION` for the mock content (see §8) |
| Call submission → `makeApiCall()` | `POST /api/v1/call` (replacing the direct Vapi `fetch`) | `LEGACY_VAPI` → replace |
| Call history list | Currently `localStorage`; live equivalent is querying `call-data` by the returned `call_sid`, or simply re-listing recent calls | `DERIVED` — recommend dropping the client-local history array in favor of querying live call-data, so a user sees the same history on any device/session |
| Voice/accent selection (not currently in the UI) | `english_accent` / `voice_name` fields exist server-side | `UI_DECISION` — optional new controls, not required |
| Customer ID / CIF field (not currently in the UI) | `customer_id` exists server-side (tags the call to a bank customer) | `UI_DECISION` — optional new field, useful if customer lookup matters to the business |
| "From" number override (not currently in the UI) | `from_phone_number` exists but the doc explicitly says it does **not** change the actual Twilio caller ID — cosmetic only | `UI_DECISION` — if added, must be labeled accurately so it doesn't mislead users into thinking it changes the outbound caller ID |

### 6.5 AI Agents — `AIAgents.tsx` / `AgentConfiguration.tsx`

| UI element | Live source | Class |
|---|---|---|
| Agent identity (id, name), direction | `GET /api/v1/agents` | `DIRECT` |
| Anything editable today (persona/script/config, per `AgentConfiguration.tsx`'s mock model) | No write/config API documented | `BACKEND_GAP` — if agent configuration must remain user-editable, this needs a new endpoint; otherwise this screen becomes read-only, which is a `UI_DECISION` |
| Per-tool enable/disable (Tool Selector, per the User Guide) | Described only in the reference dashboard's UI, no REST contract given | `BACKEND_GAP` |

### 6.6 Analytics / Reports — `Analytics.tsx`, `Reports.tsx`

| UI element | Live source | Class |
|---|---|---|
| Total calls, FCR rate, escalation rate, avg AHT, avg intent accuracy | `data.summary` fields | `DIRECT` |
| Call volume over time (chart) | Derivable by bucketing `call-data` results by `timestamp` | `DERIVED` (client/service-side aggregation; consider asking backend for a time-bucketed endpoint if data volume makes client-side bucketing impractical) |
| Turn latency, P95 latency, per-stage STT/LLM/TTS timing, GPU cost | Not in `call-data` at all — this is what the Call Metrics tab of the reference dashboard shows | `BACKEND_GAP` |
| Quality/accuracy breakdown (STT/TTS quality scores) | Not documented | `BACKEND_GAP` |

### Industry-switcher note (applies across §6.1–6.6)

The live backend is **banking-only**. The app's `IndustryContext` currently drives mock-data generation across telecom, airlines, hotels, hospitals, automotive, and insurance in addition to banking. None of those have a live backend today. This is a cross-cutting `UI_DECISION`/`BACKEND_GAP` that affects nearly every mapping above and needs an explicit decision before wiring begins (see §14).

---

## 7. Backend Gaps and Decision Points

| # | Screen/component | Existing UI expectation | Closest live data | Recommended resolution | Priority |
|---|---|---|---|---|---|
| G1 | Outbound Campaigns, Create Campaign | Create/list/monitor calling campaigns against a contact list | None — the reference dashboard has a Campaigns feature (CSV upload, scheduling, concurrency, progress) but no REST contract is documented for it | New endpoint(s): create campaign, list campaigns, get progress, cancel/delete — confirm via Swagger (§2) before assuming none exist | High — this is a whole screen's worth of functionality |
| G2 | NPS Campaigns | Structured NPS survey campaigns and per-response scores | Post-call rating exchanges appear embedded as ordinary transcript turns in the Session Transcript sample ("I would rate you 4" / bot thanks) — no structured `nps_score` field anywhere in `call-data` | Ask the backend team whether a structured NPS field/endpoint exists or is planned; if not, decide between (a) parsing transcript text for ratings (fragile, not recommended) or (b) UI change to reflect that NPS is currently transcript-only | High |
| G3 | QA Review | Manual review workflow with scoring, write-back | `call-data` gives read-only automated signals (sentiment, fcr, intent_accuracy, transcript_summary) but no review/annotation write API | New endpoint(s) for QA scores/annotations, or scope QA Review v1 as a read-only auto-quality dashboard fed purely from `call-data` | Medium |
| G4 | Dashboard | CSAT Score tile | No CSAT field in `call-data` | Add a CSAT field/endpoint, or remove the tile | Medium |
| G5 | Dashboard | AI Agents "Engaged/Idle/Escalation/Awaiting" per-agent live status | Only inferable indirectly by joining active calls to `agent_id` | Either accept an approximate derived status, or request a real per-agent status endpoint | Medium |
| G6 | AI Agents | Editable agent configuration (persona, script, capabilities) | `GET /api/v1/agents` is read-only, identity fields only | Decide: read-only agent directory (no backend change), or request an agent-config write API | Medium |
| G7 | Analytics/Reports | Turn latency, per-stage (STT/LLM/TTS) timing, GPU cost, P95 latency, STT/TTS quality | Not in `call-data`; shown only in the reference dashboard's Call Metrics/Analytics tabs | Confirm via Swagger whether an equivalent endpoint exists (the reference dashboard gets this from *somewhere*); if genuinely undocumented for external integration, treat as out of scope for this phase | Medium |
| G8 | WhatsApp Hub / Formatting Hub AI auto-reply | Inbound WhatsApp message → AI-generated reply, today via Vapi `/session` + `/chat` | The 3 documented APIs are voice-call-oriented (`Trigger Call`, transcript, call-data) — no documented text/chat endpoint | This is the most urgent gap: confirm whether the new backend exposes a Chat Mode equivalent API (the User Guide says Chat Mode "talks to exactly the same bot brain... by text" — strongly suggesting one exists, just not in these 3 docs) before WhatsApp's AI-reply path breaks when Vapi is retired | **Critical** — see §8, §9 |
| G9 | Orchestrator (all 4 screens) | Visual flow builder tied to call-handling logic | No documented relationship between Orchestrator's Supabase-backed flow schema and the voice backend's agent model at all | Clarify product intent: is Orchestrator meant to define/deploy agent behavior to this backend, or is it an unrelated internal tool? Out of scope for the first integration wave either way | Low for this phase, but needs a product decision |
| G10 | All industry-flavored screens | Telecom/airlines/hotel/hospital/automotive/insurance content | Backend is banking-only | Decide: banking-only live launch with other industries disabled/hidden, or defer those industries entirely | **Critical** — blocks scoping of nearly every screen (see §14) |
| G11 | Initiate Call, agent pickers generally | Full agent schema (capabilities, description, industry) used by mock `AIAgent` type | `GET /api/v1/agents`'s exact response schema is unconfirmed (only a sample table was shown) | Confirm full schema via Swagger before building the DTO | High (blocks G6, G5 too) |

---

## 8. Vapi Replacement Map

Every Vapi reference found in the repository (`grep -ri vapi src/ supabase/` — no dependency package for Vapi exists; it's called via raw `fetch`):

| Location | Current purpose | Screen/function affected | Live equivalent | Deletable once replaced? | Retain any model/behavior? |
|---|---|---|---|---|---|
| `src/utils/initiateCallApi.ts` — `makeApiCall()`, hardcoded `POST https://api.vapi.ai/call` + bearer token | Places the outbound voice call | Initiate Call | `POST /api/v1/call` (Trigger Call) | Yes, fully — this file should be replaced, not patched | The request-shape idea (build payload → POST) carries over; the Vapi-specific `CallPayload` type (`assistantId`/`phoneNumberId`/`customer.number`) does not and should be replaced with a Trigger-Call-shaped DTO |
| `src/utils/initiateCallApi.ts` — `generateCallPayload()`, hardcoded `phoneNumberId` | Builds the Vapi call payload | Initiate Call | N/A — Trigger Call has no `phoneNumberId` concept (Twilio number is chosen server-side via `TWILIO_PHONE_NUMBER`) | Yes | No |
| `src/data/initiateCallAgents.ts` — 8 mock agents with Vapi-style UUID `id`s | Populates the agent dropdown | Initiate Call | `GET /api/v1/agents` (3 real, banking-only agents) | Yes | The dropdown UI pattern stays; the mock content (including 5 agents with no real backend equivalent — Insurance Premium Reminder, Service Reminder, Lead Qualification, etc.) does not |
| `src/types/initiateCall.ts` — `AIAgent`, `CallPayload`, `InitiatedCall` | Types shaped around Vapi's request/response | Initiate Call | New DTOs matching Trigger Call/`agents`/`call-data` shapes | `CallPayload` yes; `AIAgent`/`InitiatedCall` need reshaping, not necessarily deletion | `InitiatedCall.status` enum (`initiated/completed/failed`) is a reasonable UI concept to keep, re-sourced from `call-data.status`/`stage` |
| `supabase/functions/process-pending-message/index.ts` — calls `Deno.env.get('VAPI_API_KEY'/'VAPI_ASSISTANT_ID')`, `POST https://api.vapi.ai/session`, `POST https://api.vapi.ai/chat` | Generates the AI reply for an inbound WhatsApp message | WhatsApp Hub (AI auto-reply) | **Unconfirmed** — no documented text/chat endpoint (see G8) | No, not until a replacement is confirmed working | The session-continuity idea (persist a `session_id` per phone number in `whatsapp_sessions`) is worth keeping regardless of which backend answers |
| `supabase/functions/whatsapp-webhook/index.ts` — same `VAPI_API_KEY`/`VAPI_ASSISTANT_ID`, same `/session` + `/chat` calls, plus richer error/retry handling around a 400 "session" error | Same AI-reply generation, on the inbound Twilio webhook path (appears to duplicate `process-pending-message`'s logic) | WhatsApp Hub (AI auto-reply) | Same gap as above | No | Same — also worth resolving the apparent duplication between this and `process-pending-message` while touching this code, though that's a code-quality note, not part of this plan's scope |
| `supabase/functions/shared/vapi-formatter.ts` — `formatAndLogVapiResponse()` | Formats AI text for WhatsApp (emoji/markdown cleanup) + logs to `vapi_response_logs` | Called by both functions above; logs displayed in Formatting Hub | Not Vapi-specific logic itself — purely a text formatter or reply text sourced from Vapi today | The function body: no, it's reusable regardless of the AI source. The table/type name (`vapi_response_logs`, `VapiResponseLog`) and the "Vapi" naming: worth renaming once the real source is confirmed, for clarity — not required for correctness | Yes, keep the LOCAL/AI formatting strategy logic — it's decoupled from Vapi already, just misnamed |
| `src/components/formatting/FormattingHub.tsx` — reads Supabase table `vapi_response_logs`, type `VapiResponseLog` | Displays formatted-message logs | Formatting Hub | Table/type rename only (cosmetic), no functional Vapi dependency | Rename is optional, not required | Yes, screen logic is fine as-is |
| `src/integrations/supabase/types.ts` | Generated Supabase types, includes `vapi_response_logs` table typing | Type-generation artifact | Regenerates automatically if/when the table is renamed | N/A — auto-generated | N/A |

**Bottom line:** the *voice* side of Vapi (Initiate Call) has a clean, documented 1:1 replacement (Trigger Call API) and can be swapped with no open questions. The *text/chat* side of Vapi (both WhatsApp edge functions) has **no confirmed replacement** in the provided documents — this is the one place where "WhatsApp should remain unchanged" collides with "Vapi must be fully replaced," and it needs your decision, not an assumption (§14).

---

## 9. Existing-Live Components to Preserve

Unchanged in this phase and not touched by the integration work below:

- WhatsApp Authenticate (OTP via Supabase edge functions + Twilio)
- WhatsApp Hub's messaging transport (Supabase tables + Realtime + Twilio send) — **except** the AI-reply generation step, which is Vapi-dependent (§8, G8) and will need a decision regardless of "don't touch WhatsApp," because Vapi retirement is an external forcing function, not a choice made by this integration effort
- Formatting Hub's read/display logic (only the underlying table's Vapi-flavored naming is cosmetic follow-up, not a functional dependency)
- Authentication (`AuthContext.tsx`, `ProtectedRoute`) — explicitly deprioritized
- Settings — explicitly deprioritized (no persistence today; not part of this wave)

---

## 10. Server-Side Proxy/BFF Recommendation

The live backend requires a static `X-API-Key` per request. This must never reach the browser bundle — the same class of mistake already found with the Vapi key in the baseline audit (§11 of that document) must not be repeated with this key.

**Recommendation: the thinnest viable proxy, not a full backend.**

- A small set of serverless functions (Vercel Serverless/Edge Functions, given the target hosting is Vercel) that:
  1. Hold the `X-API-Key` as a server-side environment variable only.
  2. Forward `GET /api/v1/call-data`, `GET /api/v1/sessions/{id}`, `POST /api/v1/call`, `GET /api/v1/agents` to the real backend, 1:1, adding the header.
  3. Do minimal else — no business logic, no persistence of their own. This keeps the "proxy" honestly thin, per your instruction not to over-engineer.
- Alternatively, if the team is already leaning toward standing up Supabase Edge Functions for this (since that pattern already exists for Twilio/Vapi secrets today), the same proxy functions could live there instead of Vercel — either is consistent with "thinnest sensible," the choice mostly comes down to where secrets are already managed operationally. **Recommend Vercel serverless functions** if final hosting is Vercel, to avoid a second secrets-management surface, but this is a low-stakes choice either way.
- **Local development:** point the frontend's service layer at `http://localhost:3000/api/...` (Vercel dev server running the same serverless functions) rather than `http://localhost:5050` directly, so dev/prod behave identically and the API key is never in a frontend `.env` file, local or otherwise. (The baseline audit already found `.env` gets committed in this repo's habits — this proxy design removes the temptation entirely, since there's nothing frontend-side worth putting there.)
- **Custom domain:** no change beyond standard Vercel domain config — the proxy functions travel with the deployment.
- CORS is a non-issue for the proxy (same-origin from the frontend's perspective); the proxy-to-backend leg doesn't need browser CORS handling at all since it's server-to-server.

---

## 11. Polling/Realtime Strategy

No WebSocket/SSE capability is documented for this backend (unlike Supabase, which the WhatsApp features already use via Realtime). Everything live-feeling has to be polling.

| Screen | Suggested interval | Rationale |
|---|---|---|
| Live View | Short (e.g. 3–5s), matching the reference dashboard's own pattern (Chat/Voice Mode UI updates live, Resources tab explicitly polls at 2s) | This is the one screen where staleness is most visible to a user watching a call happen |
| Dashboard | Medium (e.g. 10–15s), matching the reference dashboard's own "Auto (10s)" Analytics control | Headline metrics don't need sub-5s freshness |
| Call Logs / Analytics / Reports | On-demand (page load, filter change, manual refresh) — no background polling needed | These are inherently backward-looking, historical views |
| Initiate Call (post-trigger status) | Short-lived poll (e.g. every 2–3s for up to ~60s after a call is placed) against `call-data` or `sessions/{id}`, then stop | Only needed to confirm the call connected/completed; not a persistent poll |

Use TanStack Query's built-in `refetchInterval` per query rather than hand-rolled `setInterval` — this keeps the polling strategy declared alongside each hook, not scattered through components, consistent with §4's architecture.

---

## 12. Proposed Module/Service Structure

```
src/
  services/
    transport/
      httpClient.ts          # fetch wrapper: base URL (proxy), error normalization
      apiError.ts             # typed error shapes matching both documented error formats
    calls/
      callsApi.ts              # raw calls: getCallData(), getSession(), triggerCall()
      callsDto.ts               # CallDataEntry, CallDataSummary, TriggerCallResponse, SessionTranscript
      callsMapper.ts            # DTO -> existing UI types (CallLogRow, InitiatedCall, etc.)
    agents/
      agentsApi.ts, agentsDto.ts, agentsMapper.ts
    campaigns/                 # stub only until G1 is resolved
    nps/                       # stub only until G2 is resolved
    qa/                        # stub only until G3 is resolved
    analytics/
      analyticsApi.ts           # thin wrapper deriving chart-ready shapes from callsApi
  hooks/
    calls/
      useCallLogs.ts, useLiveCalls.ts, useInitiateCall.ts (replacing today's Vapi-coupled version), useCallTranscript.ts
    agents/
      useAgents.ts
  types/
    api/
      calls.ts, agents.ts        # DTOs, kept separate from src/types/* UI-facing types
```

This follows the `src/services/` direction your prompt suggested and the one already scoped (for mock data) in `.lovable/plan.md`, extended with a `types/api/` split so the "DTO vs UI model" distinction called for in §4 is structurally enforced, not just a convention. Domains with no resolved backend gap (`campaigns`, `nps`, `qa`) get an empty/stub module now so the shape is consistent when they're unblocked, without building speculative code against undocumented endpoints.

---

## 13. Implementation Sequence

**First slice (recommended, and verified against the actual docs — your suggested "Initiate Call → live call state → Call Logs → transcript" sequence holds up well):**

1. **Transport + proxy scaffold** — the httpClient, error normalization, and the 3–4 proxy functions (§10). Nothing screen-facing yet.
2. **`calls` service + `agents` service** — DTOs and mappers for Trigger Call, `call-data`, `sessions/{id}`, and `agents` (pending schema confirmation, G11).
3. **Initiate Call** — replace `initiateCallApi.ts`/`useInitiateCall.ts` with the live Trigger Call flow and real agent list. This is the smallest, most self-contained screen and directly retires the clearest Vapi dependency (§8).
4. **Call Logs** — wire to `call-data?status=inactive`, given the near-1:1 field match found in §6.1. High-confidence, low-risk win.
5. **Call detail / transcript view** (`TranscriptViewer.tsx`) — wire to `detailed_transcript` / `GET /api/v1/sessions/{id}`, completing the vertical slice your prompt described.
6. **Live View** — same `call-data` service, `status=active` + polling (§11). Natural next step since the service layer already exists from steps 2–5.
7. **Dashboard** — mostly reuses the same `call-data` service (summary endpoint); resolve G4/G5 decisions before finalizing its metric tiles.
8. **Analytics/Reports** — DIRECT portions first (from `call-data.summary`), explicitly deferring the BACKEND_GAP charts (G7) rather than blocking the whole screen on them.
9. **AI Agents** — read-only `agents` list; resolve G6 (editable config) as a separate, later decision.
10. **QA Review** — read-only auto-quality view from `call-data` fields, pending G3 for the manual workflow.
11. **Campaigns, NPS, Orchestrator** — held until G1/G2/G9 are resolved; not sequenced further until then.
12. **Authentication, Settings, User Management** — explicitly last, per your instruction, and independent of everything above.

WhatsApp (G8) is **not** in this numbered sequence because it isn't a "screen to integrate" in the same sense — it's an existing live feature whose upstream dependency is being retired out from under it. Recommend resolving the G8 decision (is there a chat/text API?) in parallel with step 1–2, since it's time-sensitive (Vapi retirement) rather than sequence-sensitive (it doesn't block or get blocked by the vertical slice above).

---

## 14. Risks/Unknowns Requiring Clarification

These are the items this plan cannot resolve on its own — decisions needed from you before implementation starts:

1. **Banking-only backend vs. multi-industry UI (G10).** The single biggest scoping question: does the live launch cover banking only (with other industries hidden/disabled), or is a multi-industry backend expected later? This affects the shape of nearly every DTO/mapper in §12.
2. **WhatsApp AI-reply replacement (G8).** Is there a text/chat equivalent to Vapi's `/session`+`/chat` in the new backend (the User Guide's "Chat Mode" strongly suggests one exists but it's outside the 3 documented endpoints)? If not, does WhatsApp's AI auto-reply pause/degrade until one exists, or is a stopgap needed?
3. **The missing 6th reference document / Swagger spec.** Confirm whether `GET /api/v1/agents`'s full schema, a Campaigns API, an NPS API, or richer Analytics/Call-Metrics endpoints exist but simply weren't included in the 4 docx files provided.
4. **Campaigns (G1) and NPS (G2) backend scope.** Are these planned as new backend work soon, or out of scope indefinitely? This determines whether those screens get a "coming soon" treatment or active backend requests.
5. **Orchestrator's product intent (G9).** Is it meant to configure/deploy behavior to this voice backend, or is it an unrelated tool? Needs a product decision, not an engineering one.
6. **CSAT (G4) and per-agent live status (G5).** Worth having in the product at all if the backend has no native concept of either? Decide keep-and-request vs. remove.
7. **Proxy hosting choice (§10).** Vercel serverless vs. Supabase Edge Functions for the new proxy — recommend Vercel, but confirm given whatever hosting decisions are already in flight elsewhere.
8. **Rate limits / quotas on the live API key** were not mentioned in any of the 5 documents — worth confirming before building polling loops (§11) that could hit an undocumented limit.

---

## 15. Recommended First Implementation Slice

**Initiate Call → live call status → Call Logs → call detail/transcript**, exactly as you proposed, confirmed viable against the actual API docs:

- `POST /api/v1/call` cleanly replaces the Vapi call in Initiate Call (§6.4, §8) — no gaps.
- The triggered call immediately becomes queryable via `GET /api/v1/call-data?status=active` (live status) and later `?status=inactive` (Call Logs) — same backing table, so this slice naturally chains.
- `GET /api/v1/sessions/{call_sid}` (using the `call_sid` returned by Trigger Call) closes the loop with the transcript view.
- This slice **also happens to retire the clearest, most urgent Vapi/security item** from the baseline audit (the hardcoded, browser-exposed Vapi key) as a side effect of step 3 in §13 — a good early win independent of the rest of the plan.

---

## Summary

**Architecture recommendation:** screens → domain hooks (TanStack Query, already installed) → a new `src/services/<domain>/` typed API layer → a thin transport client → a new server-side proxy (Vercel serverless recommended) that holds the `X-API-Key` and forwards to `https://bankingvoicebot.nl-demo.com`. No new dependencies required.

**First implementation slice:** Initiate Call (→ `POST /api/v1/call`) → live call status (→ `call-data?status=active`) → Call Logs (→ `call-data?status=inactive`) → transcript detail (→ `sessions/{id}`). This is well-documented, low-risk, and also retires the exposed Vapi API key.

**Major backend gaps:** no documented API for Campaigns (G1), NPS (G2), QA write-back (G3), CSAT (G4), per-agent live status (G5), agent configuration writes (G6), richer Analytics/Call-Metrics timing data (G7), and — most urgently — no confirmed text/chat equivalent to replace Vapi in the WhatsApp AI-reply path (G8).

**Decisions needed from you before coding starts:**
1. Banking-only launch vs. multi-industry backend expectations (G10) — blocks most screen scoping.
2. What replaces Vapi's `/session`+`/chat` for WhatsApp's AI auto-reply (G8) — time-sensitive, independent of the main sequence.
3. Whether the missing 6th reference document / Swagger spec should be pulled before implementation begins, to confirm `GET /api/v1/agents`'s full schema and check for undocumented Campaigns/NPS/Analytics endpoints.
4. Whether Campaigns and NPS are near-term backend work or long-term deferrals (G1, G2).
5. Product intent for Orchestrator (G9) — is it in scope for this backend at all.
6. Proxy hosting choice: Vercel serverless (recommended) vs. Supabase Edge Functions (§10).

Stopping here per your instructions — awaiting approval before any implementation begins.
