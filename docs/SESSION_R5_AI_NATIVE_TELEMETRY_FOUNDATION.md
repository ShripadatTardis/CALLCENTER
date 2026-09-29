# Session R5 — AI-Native Telemetry Foundation

Establishes the `interaction_events` fact model, its storage/repository/validation layers, and the future-ratio mapping R6 needs — without implementing any AI-native ratio calculation and without disturbing any existing Ratio/UI code. Implemented directly in this session (no subagents). Committed locally as `5920732`. **Migration authored, NOT applied to the live database** (see §7/§18). Not deployed.

## 1. Repository reconnaissance

Searched the repository for any existing concept that might already represent AI-execution telemetry (tool calls, intent detection, authentication, knowledge retrieval, fallback, guardrail, escalation, transfer, latency, errors, transcript/session events, trace, analysis, metadata) before designing anything new.

## 2. Existing telemetry discovered

**None usable — confirmed, not assumed.** The closest existing structures:
- `CallDataEntryDto.analysis` (`CallAnalysisDto`: `sentiment_trend`, `key_topics`, `resolution_status`, `confidence_score`) — a call-LEVEL summary object, one per call, no timestamps, no per-event granularity, no tool/auth/retrieval-specific facts.
- `CallDataEntryDto.detailed_transcript` (`DetailedTranscriptEntryDto[]`: `timestamp`, `speaker`, `text`, `sentiment`, `confidence`) — per-TURN, but purely conversational (who said what), no `event_type`/`tool_name`/`success`/`latency_ms` concept anywhere.
- `SessionTranscriptResponseDto.interactions` (`SessionInteractionEntryDto[]`: `number`, `user_message`, `bot_response`, `timestamp`) — same shape, same limitation.
- `chat_messages`/`chat_sessions` (Supabase, Session 4.5) carry `intent`/`confidence`/`authenticated`/`data_source`/`detection_method`/`latency_ms` — genuinely closer in spirit, but these are per-MESSAGE summary fields on the chat domain specifically, not a domain-neutral, multi-event-type, voice-and-chat-shared execution log.

**Conclusion: no duplication risk.** `interaction_events` is a genuinely new concept, not a rebuild of something that already exists.

## 3. Chosen event model

One canonical `InteractionEvent` type (`src/types/interactionEvent.ts`), domain-neutral by construction — zero banking-specific fields anywhere. Core fields: `eventId`, `interactionId`, `eventTime`, `eventType`, `eventName?`, `success`, `errorCode?`, `errorMessage?`, `latencyMs?`, `toolName?`, `provider?`, `model?`, `metadata?`, `ingestedAt?`. No calculated ratio/rate/percentage field exists anywhere on this type or its backing table — facts only, per the locked principle.

`interactionId` is deliberately `text`, matching `call_center.customer_interactions.interaction_id`'s own existing convention exactly (a text external identity, NOT a hard foreign key to that table's uuid `id`) — reused, not redefined, because AI-execution events can legitimately arrive before or during a call, ahead of `customer_interactions`' own async reconciliation materializing that row.

## 4. Event taxonomy

**9 event types**, deliberately collapsed from the ~11 candidate concepts in the spec, following its own worked example (`authentication_attempt`/`authentication_success`/`authentication_failure` → ONE `authentication` type + a uniform `success: boolean | null` field, rather than three separate types):

```
intent_detected · authentication · knowledge_retrieval · tool_call ·
fallback · conversation_recovery · guardrail_intervention · escalation · human_transfer
```

Every type shares the same `success`/`error_code`/`error_message`/`latency_ms` fields — `null` for `success` means "not applicable to this event type" (e.g. `escalation`, `guardrail_intervention` — the event occurring IS the fact, no separate pass/fail state), never "unknown" or coerced to `false`. This mirrors the exact null-vs-false discipline already established for Ratio calculations (`ratioMath.ts`'s 0-vs-null rule), applied consistently to a new domain rather than inventing a different convention.

## 5. TypeScript contract

`src/types/interactionEvent.ts` — the ONE authoritative definition (`InteractionEvent`, `NewInteractionEvent`, `InteractionEventType`, `InteractionEventSuccess`, `InteractionEventQueryFilter`, `InteractionEventValidationResult`), shared by whatever ingestion mechanism and whatever future AggregationProvider extension R6 builds — no duplicate frontend/backend copies.

## 6. Storage decision

**Physical storage IS defensible and was implemented** — this repository has a confirmed, repeatedly-reused Call Centre persistence location and migration convention (Supabase "AuditAI" project, `call_center` schema, `public.call_center_*` SECURITY DEFINER functions granted to `service_role` only, established across Customer 360/Chat/Campaigns and most recently `customer_activities` just 2 sessions ago). Using it for `interaction_events` is not inventing anything — it's the same established pattern, confirmed by reading `supabase/migrations/20260924185951_chat_foundation.sql` and `20261005000000_customer360_campaign_activities_and_import_fix.sql` directly before writing a single line of new SQL.

**No Supabase credentials, schema names, or RLS policy were invented** — the exact existing project ref, schema name, and RLS-then-lock-to-service_role pattern were reused verbatim.

## 7. Persistence schema/migration

`supabase/migrations/20261008000000_interaction_events_foundation.sql` — **authored, and NOT applied to the live database this session.** One table (`call_center.interaction_events`, `event_id text primary key` — the uniqueness constraint IS the idempotency mechanism, see §10), 3 indexes justified by the exact 3 access patterns the repository interface needs (`(interaction_id, event_time)` for per-interaction ordered reads, `(event_type, event_time)` for future type-filtered aggregation, a partial index on `tool_name` for future tool-specific queries) — no speculative indexing. 3 SECURITY DEFINER functions: `call_center_events_append` (idempotent upsert via `on conflict (event_id) do nothing`, reports back whether it actually inserted), `call_center_events_get_for_interaction` (ordered by `event_time`), `call_center_events_query` (generic filter for future R6 aggregation, no pagination/cap decision made here — that stays the AggregationProvider's job).

**Why not applied**: applying a migration to the live shared Supabase project is a materially different, more consequential action than authoring one, and this project's own history (documented in this conversation's memory) includes a prior incident where an unrelated background process applied migrations without explicit authorization. Given that, and given §6's own instruction not to modify "another product's database merely because credentials are available," this session stops at the authored-and-reviewable migration file — applying it is a deliberate decision left to you.

## 8. Repository/service architecture

`InteractionEventRepository` (`src/server/telemetry/interactionEventRepository.ts`) — logical interface, `appendEvent`/`appendEvents`/`getEventsForInteraction`/`queryEvents`. `supabaseInteractionEventRepository.ts` — the current deployment adapter, the only file in this new domain allowed to import `@supabase/supabase-js`, mirroring `supabaseCampaignRepository.ts`'s own documented convention exactly. No raw database call is scattered anywhere else.

## 9. Ingestion mechanism

**No HTTP endpoint was built in R5 — deliberately.** Per the spec's own flexibility ("an internal service function/event adapter" is an acceptable alternative to a public endpoint, and "do not create a public endpoint merely for symmetry"): the real Voice Agent producer does not send this telemetry today (confirmed in §2 reconnaissance), so building a public `POST /api/.../interaction-events` route now would be speculative — there is no real caller yet, and Vercel's function count is already at its Hobby-plan ceiling of 11 (verified unchanged this session, since no new `api/*.ts` file was added).

Instead, `validateInteractionEvent()`/`validateInteractionEventBatch()` (`src/server/telemetry/interactionEventValidation.ts`) is the complete, ready-to-use ingestion CONTRACT — validates required fields, event type membership, timestamp parseability, `success` typing, non-negative `latencyMs`, and a defensive PII-shaped-key rejection on `metadata` (rejects `phone_number`, `account_number`, `customer_name`, `password`, `transcript`, etc. by key name — a deliberate, narrow defense, not exhaustive PII detection). This function is what R6's actual ingestion endpoint (once the real producer contract is confirmed) should call before ever reaching the repository — reused, not duplicated, whenever that endpoint is built.

## 10. Idempotency strategy

`event_id` is the primary key. A producer-supplied, externally-stable event ID is required on every event (never manufactured server-side — a missing `eventId` is rejected by validation, not generated). `call_center_events_append`'s `on conflict (event_id) do nothing` makes a retried delivery a genuine no-op at the database layer — no double-counting risk for any future aggregation, tested against an in-memory fake repository implementing the same contract (see §19/Validation — the real SQL path itself is untestable without a live database this session).

## 11. Ordering semantics

`event_time` (producer-supplied, occurrence time) is authoritative for all future analysis/ordering — `ingested_at` (server-set, ingestion time) is tracked separately and never used for ordering. `getEventsForInteraction`'s SQL explicitly `order by event_time asc`, never relying on row-insertion order. Verified deterministically: a fixture that inserts events in reverse-of-occurrence order is confirmed to come back sorted correctly by `event_time` (see Validation §19).

## 12. Success/failure semantics

Documented on the type itself (`InteractionEventSuccess = boolean | null`) and enforced by validation — `success` is never derived from the mere presence of `errorCode`/`errorMessage`; it's an explicit, independently-supplied field. `null` is reserved for event types where pass/fail genuinely doesn't apply (escalation, guardrail intervention) — a future ratio calculator must treat `null` as excluded from eligibility, never coerced to `false` (this mirrors, and is explicitly documented as mirroring, the exact 0-vs-null discipline `ratioMath.ts` already established for Ratio calculations).

## 13. Latency semantics

`latency_ms` is optional, validated as a non-negative finite number when present, and represents ONLY the duration of the specific operation the event describes — never derived/fabricated from unrelated timestamps. No P95/latency-dashboard logic was implemented (correctly out of scope — R5 establishes trustworthy telemetry, not analytics on top of it).

## 14. Metadata policy

`metadata` is a free-form `jsonb` object for genuinely provider/tool-specific payloads. Common cross-domain dimensions that a future ratio would need to filter/group by are already first-class columns (`tool_name`, `provider`, `model`, `success`, `event_type`) rather than being left implicit inside `metadata` — matching the spec's explicit "fields frequently needed across domains should be first-class" instruction. Validation defensively rejects metadata carrying obviously PII/transcript-shaped keys.

## 15. Privacy/data-minimization policy

No PII is modeled anywhere on `interaction_events` — `interaction_id` provides the relationship back to the interaction; nothing else duplicates customer identity. Validation actively rejects `metadata` containing `phone_number`, `account_number`, `customer_name`, `password`, `credential`, `ssn`, `transcript`, or their common camelCase variants. No transcript body, recording reference, or full conversational text is modeled — existing transcript/session storage remains the sole authority for conversation evidence, exactly as required.

## 16. Future Ratio mapping

| Ratio | Required event(s) | Numerator fact | Denominator fact | Additional data required | `interaction_events` alone sufficient? |
|---|---|---|---|---|---|
| Authentication Success Rate | `authentication` | `success = true` | all `authentication` events (or a distinct "attempted" signal if the producer ever separates attempt from outcome) | none beyond the event itself | **Yes** |
| Tool Success Rate | `tool_call` | `success = true` | all `tool_call` events (optionally scoped by `tool_name`) | none | **Yes** |
| Fallback Rate | `fallback`, plus a genuine denominator of "AI turns" | count of `fallback` events | total AI conversational turns | **turn-count denominator is NOT currently modeled anywhere** — `interaction_events` records that a fallback happened, but nothing in this repository counts total AI turns per interaction today | **No** — needs a turn-count fact source in addition |
| Conversation Recovery Rate | `conversation_recovery`, plus the `fallback`/misunderstanding event it's recovering from | count of `conversation_recovery` events with `success = true` | count of preceding fallback/misunderstanding events | a defensible linkage between a recovery event and the specific misunderstanding it addresses (sequential-by-time within the interaction is the natural candidate, not yet formalized) | **Partially** — needs a documented linkage rule, not new storage |
| Avoidable Escalation Rate | `escalation`, plus a defensible avoidable/unavoidable classification | escalations classified "avoidable" | all `escalation` events | **a real classification taxonomy** — `escalation_trigger` (the existing call-data field) was already found in R3/R4 to lack a normalized avoidable/unavoidable split; this session does not invent one | **No** — explicitly not forced into this table; classification is a separate, unresolved product decision |
| Intent Accuracy | `intent_detected`, plus a ground-truth/QA-verified label | correct classifications against ground truth | evaluated classifications | **a human-verified or QA-reviewed reference label** — `intent_detected` alone only records the model's own detected intent (and optionally its confidence in `metadata`), which is explicitly NOT accuracy (the same distinction R1's registry already locked in) | **No** — confidence ≠ accuracy; needs an external QA/ground-truth source this repository does not have |
| Knowledge Retrieval Success | `knowledge_retrieval` | retrievals marked useful/correct | all `knowledge_retrieval` attempts | **a definition of "success" beyond "retrieval occurred"** — is success "returned any result," "returned a result the AI used," or "returned a result a human/QA judged correct"? Undefined by this session, deliberately | **Partially** — the event captures attempts; a real success definition must be confirmed before this is trustworthy |
| Autonomous Resolution Rate (ARR) | `human_transfer` (its absence), plus interaction-level resolution | AI-only resolved interactions (no `human_transfer` event present, `outcome = resolved`) | eligible AI-handled interactions | interaction-level `outcome`/`fcr` (already exists on call-data) joined against the ABSENCE of a `human_transfer` event for that `interaction_id` | **Partially** — needs a join between `interaction_events` and the existing call-data facts, not `interaction_events` alone |

**Deliberately honest about what's NOT solved**: this table proves the event model is *structurally* capable of supporting these ratios, not that every one of them is ready to implement in R6 without further product decisions (Fallback Rate's missing turn-count denominator, Avoidable Escalation's missing taxonomy, and Intent Accuracy's missing ground-truth source are all real, named gaps — not glossed over).

## 17. AggregationProvider integration direction

**Not implemented in R5 — direction documented only, per the spec's explicit "avoid speculative changes if R6 can introduce them" instruction.** The `AggregationProvider` interface (`src/server/analytics/aggregationProvider.ts`, R3) already defines `getSummary`/`getTrend`/`getBreakdown`/`getInteractions` against an abstract "population of facts" — R6's natural extension point is a provider (or an extension of `callPopulationProvider.ts`) that additionally calls `InteractionEventRepository.queryEvents()` alongside (not instead of) the existing call-data population fetch, joining event-derived facts (e.g. "did this interaction have a successful `tool_call`") onto the same per-interaction population `ratioMath.ts`'s calculators already operate over. This is a genuine, minimal extension point — not a second Ratio engine — but making it concrete now, before R6 has a real ratio to implement against it, would be exactly the speculative work this session was told to avoid.

## 18. Files changed

**New only — zero existing file modified:**
- `src/types/interactionEvent.ts`
- `src/server/telemetry/interactionEventRepository.ts`
- `src/server/telemetry/supabaseInteractionEventRepository.ts`
- `src/server/telemetry/interactionEventValidation.ts`
- `supabase/migrations/20261008000000_interaction_events_foundation.sql` (authored, not applied)

**Correction classification (§18 of the prompt): N/A — this session made no correction to existing code, only additions.**

## 19. Tests

`.tooling/scripts/telemetry-verify.mjs`, run against the actual compiled `interactionEventValidation.ts` (via esbuild, not a reimplementation) plus an in-memory fake repository proving the intended idempotency/ordering CONTRACT (the real Supabase SQL path itself cannot be exercised without a live database this session — see §22):
- valid event ✅
- invalid event (missing required fields, all 4 reported independently) ✅
- unknown event type ✅
- success/failure representation (`true`/`false`/`null`-as-not-applicable all accepted; non-boolean rejected) ✅
- optional latency (present-and-valid, absent, and negative-rejected) ✅
- metadata (plain object accepted, array rejected, PII-shaped key rejected) ✅
- batch validation (independent per-item results) ✅
- duplicate event handling (via in-memory fake: first append is new, retry is reported as duplicate, no second row created) ✅
- out-of-order `event_time` behavior (events arriving out of occurrence order are still returned sorted by `event_time`, not insertion order) ✅

**22/22 passed.**

## 20. Validation

- `npx tsc --noEmit` — clean.
- `npm run build` — clean; bundle hash unchanged from R4, confirming none of the new server-only telemetry files leaked into the client bundle (nothing in `src/pages`/`src/components` imports them).
- `npm run lint` — 117 errors / 36 warnings, exact baseline match, zero findings in any new file.
- Existing Ratio deterministic suite re-run: **17/17 passed**, unchanged from R3/R4 — confirms the five Direct ratios (FCR, Escalation Rate, AHT, Resolution Rate, Successful Resolution Time) were not touched.
- `npm run dev:vercel` — starts successfully ("Ready! Available at http://localhost:3001"). **Worth recording precisely**: its own log shows it actually runs `vite --port $PORT` under the hood in this environment, not full Vercel function emulation — confirmed by `curl`ing `/api/analytics/metrics?resource=ratios&ratioId=fcr&view=summary` against the running server and getting connection-refused, not a real (even if backend-failing) response. This is the same local-tooling limitation documented across 11.7/11.5B/11.9/R1–R4, now diagnosed slightly more precisely than before — **a successful `dev:vercel` "Ready!" message must not be read as confirmation that `/api/*` routes are actually being served locally.**

## 21. Regression

`git status --short -- src api supabase` shows exactly 3 new paths (`src/types/interactionEvent.ts`, `src/server/telemetry/` [3 files], one new migration file) — **zero existing files touched, zero `.tsx` files touched.** Dashboard, Analytics, Reports, Call Logs, Live View, Campaigns, QA Review, AI Agents, Orchestrator, User Management, Settings, the sidebar, the Ratio Explorer UI, and the existing `AggregationProvider`/`callPopulationProvider` are all confirmed unmodified. Vercel function count unchanged at 11 (no new `api/*.ts` route).

## 22. Remaining backend/Voice Agent requirements

See the R6 handoff / producer contract below — this section exists specifically to answer that question precisely.

## 23. Recommended R6 scope

1. Confirm with the Voice Agent/Call Centre team whether they can emit the producer contract below (even a minimal subset — Tool Success Rate and Authentication Success Rate need the least additional product-decision work).
2. Build the actual ingestion path (HTTP endpoint or internal adapter, using `validateInteractionEvent()` as-is) once a real producer exists — not before, per this session's own "don't build for a caller that doesn't exist yet" reasoning.
3. Apply `20261008000000_interaction_events_foundation.sql` (with your explicit approval) once R6 is ready to actually receive events — no reason to apply it earlier than that.
4. Implement Tool Success Rate and Authentication Success Rate first (§16 marks these "Yes" — no additional undefined product decision needed) before attempting Fallback Rate, Avoidable Escalation Rate, or Intent Accuracy, each of which needs a genuine product decision this session correctly left unresolved rather than guessed at.

---

## R6 handoff — Voice Agent producer contract

*"What telemetry must the Voice Agent emit so that Call Centre can calculate AI-native ratios truthfully?"*

For every AI-execution event (tool call, authentication check, knowledge retrieval, fallback, recovery, guardrail intervention, escalation, human transfer, intent detection), the producer should emit:

```
event_id        — stable, producer-generated, unique per real occurrence (required for retry-safety; a retried delivery must reuse the SAME event_id, never generate a new one)
interaction_id  — the same call_id / chat session identifier already used elsewhere in the Partner API contract (no new identity space)
event_time      — ISO 8601 timestamp of when the event actually occurred (not when it's being reported)
event_type      — one of: intent_detected | authentication | knowledge_retrieval | tool_call | fallback | conversation_recovery | guardrail_intervention | escalation | human_transfer
success         — true | false | omitted (omit/null only when genuinely not applicable to this event_type — never send false to mean "unknown")
error_code      — when success = false
error_message   — when success = false
latency_ms      — the real duration of this specific operation, when measurable
tool_name       — for tool_call (and knowledge_retrieval where relevant)
provider/model  — where relevant, e.g. which retrieval service or LLM
metadata        — tool/provider-specific detail only — NEVER phone numbers, account numbers, customer names, credentials, or transcript text
```

**Two explicit open questions for the Voice Agent team**, not resolved by this session:
1. Can "AI turn count" be emitted (even as a per-interaction summary field, not necessarily a per-turn event) — this is the missing denominator for Fallback Rate.
2. Can `escalation` events carry a structured, normalized cause/category — this is the missing classification for Avoidable Escalation Rate. A free-text reason (like today's `escalation_trigger`) is not sufficient on its own.

R6 should be able to implement Tool Success Rate and Authentication Success Rate the moment real events matching this contract exist, using the architecture this session already built, without redesigning telemetry.

Session stops here per the prompt's explicit instruction — R6 not begun.
