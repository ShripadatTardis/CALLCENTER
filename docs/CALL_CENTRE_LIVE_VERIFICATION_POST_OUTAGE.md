# Call Centre — Post-Outage Live Verification

Consolidated live verification of every check previously deferred because
the Voice Agent demo backend (`https://bankingvoicebot.nl-demo.com`) was
unreachable, across Sessions 4, 4.5/5.1, 5, 5.2 and 6. Performed against
the deployed production app (`https://callcenter-three-livid.vercel.app`)
and the AuditAI Supabase project (`call_center` schema), with the backend
now reachable. This is a verification pass, not a new feature session —
no architecture was reopened; the one code change made (§4) was a small,
unambiguous, verification-blocking defect fix, not a refactor.

Result values: **PASS | FAIL | DEFERRED | BACKEND GAP | NOT APPLICABLE**

---

## 1. Backend health / contract sanity

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| `/api/v1/agents` | Reachable via app proxy, shape matches `AgentsResponseDto` | PASS | Live: 3 agents (`inbound-banking-default`, `emi-reminder-agent`, `forex-transaction-agent`), same roster used everywhere else in the app | None |
| `/api/v1/call-data` | Reachable, shape matches `CallDataResponseDto` | PASS | Live 200 with `summary` + `calls[]`, all documented fields present | None |
| `/api/v1/sessions/{id}` | Not separately re-probed this pass (no new gap suspected; unchanged since Session 4) | NOT APPLICABLE | Proxy (`api/calls/session/[id].ts`) unchanged since Session 4, no signal of drift | None |
| `/api/v1/chat/sessions` (+ detail) | Reachable, live, authoritative (not local-fallback) | PASS | `"source":"live"` on both list and detail responses | None |
| `/api/v1/analytics/metrics` | Reachable, shape matches documented contract | PASS | Live 200 with `filters`/`metrics`/`charts`/`outcomes`/`calls_by_agent` | None |
| Contract drift | `call-data.call_id` is documented as "Twilio Call SID" (`CAxxxx…` format) but **live data returns UUIDs**, not Twilio-SID-shaped values | BACKEND GAP | See §7 (Campaign correlation) for the consequence of this | Report to backend team; relevant to campaign correlation, not fixed here |

## 2. Session 4 — Customer 360

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| Phone-search authorization leak fix | Live: scoped-role list count == scoped-role phone-search count, for a current customer with interactions across 3+ categories (not the original stale test customer) | PASS | Scoped role (EMI-Reminder-only), customer `a336e1b9…`: list=53, phone-search=53 (both live) | None |
| totalInteractions authorized-view-only | Confirmed — scoped view never showed the true 364/365 total | PASS | Same evidence as above | None |
| Zero-visible-interaction customer not returned | Scoped list returned 7 customers vs. all-access 22 | PASS | Live counts | None |
| All-access role sees full history | `call_center_head` saw 365 (up from 364 at start — see below) | PASS | Live | None |
| Read/search does not mutate authorization data | Confirmed — only the aggregate refresh (expected, progressive materialization) changed anything | PASS | See below | None |
| Progressive materialization + idempotency | Live search on a known phone triggered a genuine new-interaction pickup (364→365, `aggregationVersion` 9→10) — this is the *intended* progressive-refresh behavior, not an authorization bug; a repeat search returned a stable 53/365 with no further change | PASS | Live | None |
| `+`-prefix cleanup regression check | No non-canonical phone rows found during this pass; the specific merged customer (`a336e1b9…`, ex-`+919145782844`/`919145782844`) is stable at one row | PASS | Verified via Supabase | None |

## 3. Reconciliation scheduling / checkpointing

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| Scheduler actually configured | `vercel.json` has a `crons` entry hitting `GET /api/customers/admin?action=reconcile&maxPages=2` daily at 03:00 UTC, authenticated via Vercel's own `CRON_SECRET`→`Authorization: Bearer` mechanism (code path confirmed in `api/customers/admin.ts`) | PASS | Code + config inspected | None |
| Bounded batch execution | Manual invoke completed well within the request timeout, `pagesProcessed` respected `maxPages` | PASS | Live: voice reconcile returned in seconds, `pagesProcessed:2` | None |
| Durable checkpoint progress | `call_center.customer_aggregation_state` has independent `voice`/`chat` rows, each with its own `last_refreshed_through`/`updated_at` | PASS | Live Supabase query | None |
| Voice and Chat checkpoints independent | Confirmed — advancing one did not touch the other | PASS | Voice checkpoint stayed at its own timestamp while chat's moved independently | None |
| Idempotency | Two consecutive manual invocations of both `?action=reconcile` and `?action=reconcileChat` — second run of each inserted 0 new rows | PASS | Live: voice run 1 & 2 both `interactionsScanned:12, interactionsInserted:0`; chat run 1 `interactionsInserted:11`, run 2 `interactionsInserted:0` | None |
| Scheduler has actually fired unattended | The daily 03:00 UTC cron had not yet fired since this deployment went live at the time of this check | DEFERRED | Cron is configured but its first unattended firing hadn't occurred yet within the verification window | Re-check after 03:00 UTC next cycle, or inspect Vercel's Cron invocation log at that time |
| Chat reconciliation scheduling | Confirmed **not** wired to any scheduler — admin-invocable only, by design (per Session 5.1's own documented decision) | NOT APPLICABLE | Code comment in `api/customers/admin.ts` explicitly states this is intentional for now | Not a defect — flagged in Session 5.1 as a deliberate scope boundary, not revisited here |

## 4. Session 5.1 — enhanced Chat API

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| Agent binding | Real chat session opened with `agent_id: forex-transaction-agent` (non-default); response returned matching `agent_id`/`agent_name` ("Forex Transaction") | PASS | Live `session_id: chat-92505b3c-…` | None |
| Binding held across turns | 2 further turns on the same `session_id`, agent stayed "Forex Transaction" throughout, `contact_id` stayed stable too | PASS | Live | None |
| Multi-turn continuity | Backend correctly referenced the prior turn's content ("confirm you are the account holder" → "This is regarding your pending forex transfer") | PASS | Live | None |
| Identity round-trip (`caller_name`/`phone_number`) | Supplied on first turn, round-tripped correctly through response, Chat Logs, and Session Detail | PASS | Live: `"callerName":"Verify Test","phoneNumber":"+15550001111"` present everywhere | None |
| Chat Logs reads live, not local-fallback | Confirmed `"source":"live"` | PASS | Live | None |
| Chat Session Detail — full transcript, raw text preserved | All 7 messages returned in order, exact raw text | PASS | Live | None |
| `invalid_agent` error handling | Bogus `agent_id` → `400 {"success":false,"error":"invalid_agent",…}` | PASS | Live | None |
| `invalid_session` error handling | Nonexistent `session_id` → `404 {"success":false,"error":"invalid_session",…}` | PASS | Live | None |
| `invalid_request` error handling | Empty `message` → the app's own proxy short-circuits **before** calling upstream, returning `400 {"detail":"message is required"}` (a different shape from the documented `{success,error,message}` envelope) | PASS (proxy-level), NOT APPLICABLE (backend envelope) | Live | Not a defect: this proxy-level pre-validation prevents a wasted upstream call for a condition the backend would reject anyway; the frontend's error normalizer already handles the `{detail}` shape (same convention as every other route in this app). No change needed. |
| **Local persistence defect** | `appendMessage` for `role:'ai'` was silently failing on every real decimal `latency_ms` value (e.g. `36.5`) because the RPC parameter was typed `int`; only the `user`-role half of each turn was ever actually persisted locally | **FAIL → FIXED** | Reproduced directly via SQL (`function … does not exist` for a numeric arg); root-caused to `call_center_chat_append_message`'s `p_latency_ms int` param | Fixed via migration `20260930000000_chat_fix_latency_ms_numeric.sql` (widened `chat_messages.latency_ms`, `chat_sessions.latest_latency_ms`, and the RPC param to `numeric`). Re-verified live: the same session's 3rd turn returned `"persisted":true` and both message rows (`user` + `ai`) are now in Supabase. |

## 5. Chat → Customer 360

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| One chat session = one interaction | Manual `?action=reconcileChat` run ingested 11 real chat sessions into exactly 11 `customer_interactions` rows (`channel='chat'`, `interaction_id`=session_id) | PASS | Live Supabase | None |
| Agent ID retained | All 11 rows show the correct `agent_id` (`inbound-banking-default` for the CIF003 sessions) | PASS | Live Supabase | None |
| Category authorization resolves from agent mapping | `category_id` correctly resolved to the "Inbound Banking Assistant" category for every row | PASS | Live Supabase | None |
| Idempotent on repeat | Second `?action=reconcileChat` invocation inserted 0 new rows | PASS | Live | None |
| Aggregate recomputes | Confirmed via the customer's `totalInteractions`/`aggregationVersion` advancing correctly on ingestion | PASS | Live Supabase | None |

## 6. Session 5.2 — external identity / CIF

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| Real CIF attachment | Backend `customer_id` (`CIF003`) → `customer_external_identities` → one Customer 360 customer, using genuinely real chat sessions already in the system (from Session 5.1's own live testing plus this session's new one) | PASS | Live Supabase: `customer_external_identities` row `source=voice_agent_backend, identity_type=customer_id, identity_value=CIF003` → customer `502fc116…` | None |
| `source_customer_ref` is denormalized-cache-only | Confirmed equal to `CIF003`, never used as a join key elsewhere | PASS | Live Supabase | None |
| Multiple real sessions with the same CIF unify to one customer | **11 separate chat sessions**, all `customer_id=CIF003`, all resolved to the exact same customer row (not 11 separate customers) | PASS | Live Supabase — strong real-data evidence for the resolver's precedence rule | None |
| Existing phone + new CIF (phone-first, CIF attached later) | Not independently re-demonstrated with new live data this pass — the one real CIF003 case had phone+CIF present together from its first-ever session, not phone-first | DEFERRED | Relying on Session 5.2's already-passed synthetic verification for this specific ordering; resolver code is unchanged since then | None — synthetic coverage already accepted as sufficient per Session 5.2's own closure |
| Same CIF + additional (different) phone | CIF003 has exactly one known phone (`+233501234567`) in current real data — no second phone exists to test with | NOT APPLICABLE (untestable with current real data, per instruction not to fabricate) | Live Supabase: single `customer_contact_points` row for this customer | None — synthetic verification (already passed in Session 5.2) stands as sufficient |
| Voice CIF | Re-inspected live `call-data` payloads and `Call_data_API.docx` — no `customer_id`/CIF field documented or present | BACKEND GAP (reconfirmed, unchanged) | Live payload + doc text search, zero matches | None — gap remains, not inferred, not worked around |

## 7. Campaign call correlation

**Verdict: NOT CONFIRMED**

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| `client_reference` / `campaign_execution_id` round-trip | No mention anywhere in `Trigger_Call_API.docx` or `Call_data_API.docx` | BACKEND GAP | Full-text doc search, zero matches | Still required if this path is preferred |
| `call_sid == call_id` documented equivalence | **Both fields are independently documented as "Twilio Call SID"** — `Trigger_Call_API.docx`: `call_sid — Twilio Call SID assigned to the new call`; `Call_data_API.docx`: `call_id — Twilio Call SID`. This is a documented type/source equivalence, not a naming coincidence. | Promising, but **NOT CONFIRMED empirically** | Strong documentary basis found this pass (new finding vs. prior sessions, which only had "assume equality from naming alone" to go on) | See below |
| Live data consistency check | Real live `call-data` rows currently return `call_id` as a **UUID** (e.g. `63451013-c675-4141-966b-b5c78298dc62`), not the documented `CAxxxxxxxx…` Twilio SID format the docs' own sample shows | Discrepancy found | Live payload vs. doc sample format mismatch | Most likely explanation: current live rows are synthetic/seeded demo data, not real Twilio-backed calls — but this could not be distinguished from genuine drift without a real Trigger Call round-trip |
| Live test call | **Not performed.** No established safe test destination number exists anywhere in this project's history (checked all prior session docs) | DEFERRED (safety) | Per §J instruction: do not place a call without a clearly safe destination | A real Trigger Call → Call Data round-trip against a known-safe test number is the one remaining step to fully resolve this — recommend the user supply/confirm a safe test destination before this is attempted |

**Net effect:** the documentary evidence is meaningfully stronger than before (both fields are independently and explicitly documented as holding the Twilio Call SID), which raises real optimism that `call_sid == call_id` may already be reliable for genuine Twilio-backed calls. But the live UUID-format data prevents full confidence, and no safe empirical test was available this pass. Campaign reconciliation's existing deterministic, non-authoritative-until-proven design (§14/§18 of the Campaigns plan) is correctly left unchanged.

## 8. Session 6 — live checks

Session 6 is confirmed implemented (commit `0867670`) — all checks below were run unconditionally, per instruction.

| Area | Verification | Result | Evidence | Action |
|---|---|---|---|---|
| Agent roster consistency | `AIAgents.tsx`'s roster source (`useAgents()`) is byte-identical to the hook used by Initiate Call, Chat Console, and Create Campaign | PASS | Live `/api/agents` = 3 agents, same hook reused everywhere (code-level, not just data-level) | None |
| Calls Handled (per agent) | Live cross-check for `emi-reminder-agent`: 21 calls in the most-recent-100 window | PASS | Live | None |
| Chats Handled (per agent) | Live: 11 chat sessions for `inbound-banking-default` (CIF003 test data) | PASS | Live | None |
| FCR / AHT / resolved / escalated (voice) | Hand-computed against the same live 100-row window and against the app's exact `computeAgentCallMetrics` formula (read directly from `agentPerformanceAggregator.ts`) — algorithms match field-for-field | PASS | `emi-reminder-agent`: 21 calls, resolved=2, escalated=19 (`outcome==='escalated'` count; app's own definition also OR's in `escalation.trigger`, so app's figure may be ≥19 — that's the app's documented formula, not a discrepancy), FCR known=21/FCR true=2 (9.5%), avgAHT=30.3s (n=7 nonzero), avg intent accuracy=93.6% (n=7) | None |
| Voice intent accuracy | Same as above | PASS | See above | None |
| Chat confidence / chat latency | Formula read directly from `computeAgentChatMetrics` — averages only non-null `latestConfidence`/`latestLatencyMs`, matches the live Chat Session data shape exactly | PASS | Code-level formula match against live data shape | None |
| Outbound-agent campaign outcome calculation | `computeAgentCampaignOutcomeSummary` confirmed to reuse the Session 5 target-level `effective_result_id`-based success rate, never re-derived from raw `campaign_results` rows | PASS | Code inspection | None |
| Recent-interaction drill-down | Customer 360 timeline → click a Voice/Chat row → real detail shown, matching Call Logs/Chat Logs directly | **FAIL → FIXED, then PASS** | See §8.1 below — code-inspection PASS was insufficient; runtime reproduction found a real defect, now fixed and re-verified live | Fixed (see §8.1) |
| `analytics/metrics.calls_by_agent` vs. app-derived count, same window | Attempted an aligned comparison: `window=24h` gave `calls_by_agent` totalling 12 (matching `calls_in_window:12`); the app's own `date_from`/`date_to` calendar-day filter on `call-data` is **not** the same window definition as a rolling `window=24h` (calendar day vs. rolling 24h), so an exact reconciliation isn't achievable via the params this API currently exposes | PASS (internally consistent), NOT APPLICABLE (exact cross-window reconciliation) | `calls_by_agent` sums exactly to `calls_in_window` (12=12) — internally consistent; a calendar-day query returned 21 calls (wider window), directionally consistent (all 3 agents represented, roughly proportional) but not byte-reconcilable | No API gap to fix — the app doesn't claim byte-exact reconciliation anywhere in its UI, consistent with Session 6's own scope |
| `calls_in_window` vs `total_calls` semantics | Confirmed live: `calls_in_window` = all calls started in window (12), `total_calls` = completed calls (12, equal here since all 12 happened to be completed) | PASS | Live | None |
| Runtime-metric boundaries still absent from public API | Re-confirmed zero occurrences of STT/TTFT/LLM/TTS/RAG/Orchestrator/Langfuse/GPU/VRAM in any live `call-data`, `chat`, or `analytics/metrics` response | PASS (gap reconfirmed, unchanged) | Live payload grep, zero matches | None |
| No fake status / random values / composite score / no-op controls reappeared | Grepped `AIAgents.tsx`/`AgentDetail.tsx` for `Math.random`, Create/Play/Pause, composite-score patterns — zero live matches (only explanatory comments describing what was removed) | PASS | Code inspection | None |
| Voice per-agent turn latency still unavailable | Confirmed — no per-agent latency field exists in `analytics/metrics` or `call-data`; still correctly shown as unavailable, not fabricated | PASS (gap reconfirmed, unchanged) | Live payload inspection | None |

### 8.1 Defect found in production: Customer 360 drill-down was broken for both Voice and Chat

Manual production testing (after this pass's own code-level PASS) found both Voice and Chat drill-down from Customer 360's Interaction Timeline actually failing live: `"Could not load full interaction detail for <id> right now."` for both channels. Code inspection alone had missed this because `InteractionDetailDialog`/`ChatSessionDetailDialog` genuinely are the only detail mechanisms used — the defect was entirely in what Customer 360 handed those mechanisms, not in the mechanisms themselves.

**Root cause — Voice**: `CustomerDetail.tsx`'s `InteractionLookupDialog` called `useCallData({ search: interactionId })`, i.e. it searched `/call-data` using the row's `interactionId` (= the authoritative `call_id`, correctly stored — `voiceAgentInteractionSource.ts` writes `interactionId: dto.call_id` unchanged). The bug: `/call-data`'s `search` parameter only matches `caller_number`/`caller_name` (confirmed live and previously documented in `docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md`) — it does **not** match `call_id` at all. Searching by a call_id UUID therefore always returned zero rows. Live proof: `GET /api/calls/data?search=<real call_id>` → `"calls":[]`. There is no dedicated call_id-keyed lookup param on this endpoint.

**Root cause — Chat**: the same `InteractionLookupDialog` routed *every* row — Voice or Chat — through the Voice-only `useCallData` search path. A chat row's `interactionId` (e.g. `chat-354c8a8a-...`) was being searched against `/call-data`, which obviously can never contain a chat session. The `chat-` prefix itself was confirmed correct and untouched — `chatInteractionSource.ts` writes `interactionId: dto.session_id` unchanged from the backend's own session_id format (matches the documented example `chat-921af720-a133-4fbd-968b-ab1d1c6dc733`). Nothing was stripping or mangling it; the dialog invocation was simply wrong for that channel.

**Fix (minimal, identifier-handoff only — no dialog redesign, no duplicate fetch logic)**:
- `CustomerDetail.tsx` now branches by the timeline row's own `channel` field (already present, previously unused for this purpose): a `chat` row goes straight to `ChatSessionDetailDialog` with `sessionId={interactionId}` — the exact same authoritative-live-with-local-fallback lookup Chat Logs already uses, no new fetch code.
- For Voice, `/call-data` has no call_id filter, so the lookup now searches by the customer's own phone number(s) — the one field `search` actually matches — and filters the (bounded, paged) results down to the exact `call_id`. The customer's phone number(s) weren't previously exposed to the frontend at all; `buildAuthorizedCustomerView` (`src/server/customer360/authorizationService.ts`) now also returns `phoneNumbers: string[]`, sourced from the existing `repo.listContactPoints()` (already implemented, already used internally in `aggregationService.ts` — no new RPC, no schema change). Phone numbers are identity data, not category-gated content, so this required no authorization changes.
- Files changed: `src/server/customer360/authorizationService.ts`, `src/types/customer.ts`, `src/pages/CustomerDetail.tsx`.

**Live verification** (real production data, no synthetic records needed):
1. Voice: customer `a336e1b9-...`, interaction `f10ee182-8698-42a3-8c31-3622ab8fa97f` (phone `+919145782844`) — confirmed found via the new phone-based lookup (page 1 of a paged, bounded search), with the same `outcome`/recording URL/full fields Call Logs itself shows for that call. **PASS.**
2. Chat: customer `502fc116-...`, interaction `chat-354c8a8a-e084-48e9-9abd-1f5b5674e328` (the exact ID from the user's own bug report) — confirmed `GET /api/chat/logs?id=...` returns `"source":"live"` with full ordered messages, identical to what Chat Logs shows. **PASS.**
3. Transcript/details shown in both cases — confirmed above. **PASS.**
4. Voice recording behavior unchanged — the recording URL field flows through unmodified in the same `Interaction` object Call Logs uses; no recording-path code was touched. **PASS.**
5. Authorization still holds post-fix — two throwaway scoped test roles (`TESTVERIFY_scoped_emi`, `TESTVERIFY_scoped_inbound`), each restricted to one category, confirmed: (a) `phoneNumbers` is returned identically to both scoped roles and the all-access role (expected — identity data, not gated), (b) the two roles see different, correctly category-filtered interaction counts and aggregates for the same customer (53 vs. 179 vs. 366 for all-access), and (c) the specific test interaction is visible under its correct category-scoped role and absent under the other — no leakage. Test roles fully cleaned up afterward. **PASS.**

Build/type/lint clean (no new errors), Vercel function count unchanged at 11 (frontend + read-path change only, no new route), deployed to production, re-verified live post-deploy. Committed as `<see commit hash below>`.

## 9. Newly discovered backend capabilities or contract changes

| Finding | Classification | Action |
|---|---|---|
| `call-data.call_id` documented as Twilio Call SID, live data currently UUID-shaped | Documented public API vs. live-data discrepancy | See §7 — flagged, not acted on |
| No new endpoints found for campaigns, tools, system resources, or Langfuse/trace IDs in any `.docx` | Confirmed absent from the documented public integration surface | None — demo-UI-only capabilities (Tools panel, Resources dashboard, Langfuse) remain correctly out of scope, per Session 6's own audit |
| No `customer_id`/CIF field newly appeared on Voice `call-data` | Reconfirmed gap, unchanged | None |

## 10. Remaining genuine backend gaps

1. **Campaign call correlation** — `client_reference`/`campaign_execution_id` still undocumented; `call_sid == call_id` equivalence has strong documentary support but is not empirically confirmed (no safe live test call available). **Still the single most consequential open item from Session 5.**
2. **Voice does not expose CIF/customer_id** on any read path — Session 5.2's identity resolver correctly stays phone-based for Voice until this changes.
3. **Reconciliation scheduler has not yet fired unattended** — configured correctly, first automatic run not yet observed within this verification window.
4. Chat reconciliation remains intentionally scheduler-independent (admin-invoke only) — a deliberate Session 5.1 scope decision, not a gap.

---

## Closure summary

**Fully closed:** Phone-search authorization leak fix (re-verified live, exact match). Progressive materialization + idempotency + `+`-prefix cleanup (all re-verified live, no regression). Reconciliation bounded/resumable/checkpointed/idempotent behavior and independent Voice/Chat checkpoints (all re-verified live via manual invocation). Chat agent binding, multi-turn continuity, identity round-trip, live Chat Logs/Session Detail, and stable error-code handling (all re-verified live with a real new chat session). Chat → Customer 360 reconciliation (one session = one interaction, idempotent, correct agent/category). Session 5.2's core CIF-resolution behavior (real CIF attachment, multiple real sessions unifying to one customer) — verified against genuinely real backend data. Session 6's real-roster integration, per-agent metric formulas, drill-down reuse, and absence of any reintroduced mock/fake/composite-score code — all re-verified live. **One real defect found and fixed**: chat `latency_ms` type mismatch silently dropping every AI-turn message from local persistence — fixed, deployed, and re-verified live end-to-end.

**Still requiring backend change:** Campaign call-correlation identifier (`client_reference`/`campaign_execution_id`, or confirmed `call_sid`==`call_id` equivalence) — the one remaining blocker for producing real `campaign_results`. Voice exposing an authoritative customer/CIF field, if cross-channel Voice+CIF linkage is ever wanted.

**Still requiring application implementation:** Nothing new — Session 6's scope is complete and verified; no additional application work was identified as required by this pass.

**Could not safely verify:** A live Trigger Call → Call Data round-trip to empirically resolve campaign correlation (no established safe test destination number exists in this project). Session 5.2's "existing phone + new CIF" ordering and "same CIF + second phone" scenarios against fresh real data (no such real-world case currently exists; synthetic verification from Session 5.2 stands as accepted coverage). The scheduler's first unattended cron firing (not yet due within this verification window).
