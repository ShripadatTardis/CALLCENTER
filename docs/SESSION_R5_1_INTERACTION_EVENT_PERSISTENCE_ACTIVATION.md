# Session R5.1 — InteractionEvent Persistence Activation & Verification

Persistence activation only — not telemetry fabrication, not R6. No application source file was changed this session; the only change is a database migration application plus its verification. Implemented directly (no subagents). Campaign Session 12.3 Phase E confirmed untouched throughout; no telephone call was triggered.

## 1. Audit of the existing R5 implementation (repository re-read directly, not assumed from the R5 report)

Re-read every R5 file directly:
- `src/types/interactionEvent.ts` — `InteractionEvent`/`NewInteractionEvent`, 9-type taxonomy (`intent_detected`, `authentication`, `knowledge_retrieval`, `tool_call`, `fallback`, `conversation_recovery`, `guardrail_intervention`, `escalation`, `human_transfer`), `success: boolean | null` (null = not applicable, never coerced to false).
- `supabase/migrations/20261008000000_interaction_events_foundation.sql` — one table (`call_center.interaction_events`), 3 indexes, 3 `SECURITY DEFINER` functions locked to `service_role`, RLS enabled with no public policy (same pattern as every other `call_center` table).
- `src/server/telemetry/interactionEventRepository.ts` (logical interface) / `supabaseInteractionEventRepository.ts` (the only file allowed to import `@supabase/supabase-js`, reusing `CUSTOMER360_SUPABASE_URL`/`CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY` — no new secret).
- `src/server/telemetry/interactionEventValidation.ts` — required-field/type/timestamp/latency/metadata-PII validation, the single ingestion-contract gate for whatever producer R6 eventually builds.

**Result: zero drift.** Every file matches the R5 report exactly — no code has changed since R5.

### Migration safety check against the current deployed schema

- `call_center.interaction_events` did **not** exist before this session (confirmed via `list_tables`) — no naming conflict.
- `20261008000000_interaction_events_foundation` was **not** in the applied-migrations list — confirmed never applied, matching R5's own report.
- Searched every other migration file for `interaction_events`/`call_center_events_` — **zero other references** — nothing introduced since R5 touches or conflicts with this domain.
- `call_center.customer_interactions.interaction_id` is still `text` — the exact type the migration's design assumption (`interaction_events.interaction_id text not null`, deliberately not a hard FK) depends on. Unchanged.
- Pre-existing, unrelated finding surfaced by the tooling itself (not caused by or related to this migration): 3 other tables (`customer_external_identities`, `customer_merge_log`, `customer_activities`) have RLS disabled — a real, separate security gap in this project, **not touched or worsened by this session**, flagged here for visibility per the tooling's own instruction, not silently fixed.

**Conclusion: safe to apply as-is.** No schema drift, no destructive interaction with existing tables, no RLS/security regression (the new table follows the strictest pattern already established, unlike the 3 pre-existing gaps above).

## 2. Migration applied

Applied via the Supabase migration mechanism (byte-for-byte the same SQL already authored in R5 — no edits). Confirmed post-apply: table exists with all 14 designed columns, correct nullability (`event_id`/`interaction_id`/`event_time`/`event_type`/`ingested_at` NOT NULL, everything else nullable), all 3 functions callable.

## 3. Persistence verification (all read/write via the real `SECURITY DEFINER` functions and direct constraint tests — the actual application access path, not a bypass)

| Check | Result |
|---|---|
| Table/schema exists as designed | ✅ all 14 columns, correct types/nullability |
| `event_type` check constraint active | ✅ `'not_a_real_type'` rejected with `23514` |
| Required-field (`NOT NULL`) constraints active | ✅ `event_id = null` rejected with `23502` |
| `latency_ms >= 0` check constraint active | ✅ `-50` rejected with `23514` |
| Valid canonical event persists | ✅ `call_center_events_append('R51-SYNTHETIC-EVT-1', ...)` → `wasInsert: true`, row returned matches input exactly |
| Idempotent replay | ✅ re-submitting the same `event_id` with a **deliberately different payload** (different `tool_name`/`success`/`metadata`) returned `wasInsert: false` and the **original** row, completely unchanged — confirms `on conflict (event_id) do nothing` genuinely protects against a corrupting replay, not just a duplicate-row one |
| Exactly one row per `event_id` | ✅ `count(*) = 1` after the replay attempt |
| Retrieve by interaction | ✅ `call_center_events_get_for_interaction(...)` returned both synthetic events, ordered by `event_time` |
| Filter by event type | ✅ `call_center_events_query(..., 'tool_call', ...)` returned exactly the one `tool_call` event, excluding the `authentication` event |
| Existing application data unchanged | ✅ `customer_interactions` (572), `campaigns` (4), `campaign_targets` (5), `campaign_executions` (2), `chat_sessions` (11) — identical counts before and after the migration |

### Synthetic test data

All test records used unmistakable synthetic identifiers: `interaction_id = 'R5.1-SYNTHETIC-TEST-INTERACTION-1'`, `event_id` prefixed `R51-SYNTHETIC-`, and every valid test event's `metadata` carried `"synthetic": true` plus an explicit note. **Cleaned up after verification** — `delete from call_center.interaction_events where interaction_id = 'R5.1-SYNTHETIC-TEST-INTERACTION-1'`, confirmed `count(*) = 0` remaining in the table afterward. The three constraint-violation attempts (invalid type, null required field, negative latency) never persisted anything by construction (the whole point of the test).

## 4. Facts-only boundary — respected, nothing backfilled

No historical event was created from any existing Call Data/Customer 360 record. Specifically **not done**, per the explicit boundary: no `authentication` event manufactured from a historical `was_authenticated` flag, no `tool_call` inferred from transcript text, no `human_transfer`/containment/failure inferred from `outcome`, no timestamp derived from an unrelated call timestamp. The table remains empty of anything but the (now-deleted) synthetic test rows — historical Call Data stays historical Call Data; `interaction_events` will carry real facts only once a real producer exists.

## 5. Ratio Explorer integration boundary — audited, nothing promoted

Re-read `src/server/analytics/ratioRegistry.ts` and `src/lib/ratios/ratioFrontendRegistry.ts` directly — **unchanged by this session**, confirming no ratio was promoted merely because the table now exists:

- `tool_success_rate`: still `backend_gap`.
- `authentication_success_rate`: still `partial`.
- Every other telemetry-dependent ratio (`fallback_rate`, `avoidable_escalation_rate`, `intent_accuracy`, `autonomous_resolution_rate`, `conversation_recovery` — not a registry ratio itself but named in R5's mapping): unchanged.

**What each requires before it can honestly go live** (from R5's own `§16` mapping, re-verified against the now-real table, nothing added or weakened):

| Ratio | Requires | `interaction_events` alone sufficient? |
|---|---|---|
| **Authentication Success Rate** | `authentication` events with real `success` values from a genuine producer | **Yes** — table/contract ready now; needs real events, nothing else |
| **Tool Success Rate** | `tool_call` events with real `success` values (optionally scoped by `tool_name`) | **Yes** — table/contract ready now; needs real events, nothing else |
| Fallback Rate | `fallback` events **plus** a turn-count denominator (not modeled anywhere in this repository today) | No — needs a new fact source beyond this table |
| Avoidable Escalation Rate | `escalation` events **plus** a normalized avoidable/unavoidable taxonomy (still absent; `escalation_trigger` remains free-text per R4.1's live evidence) | No |
| Intent Accuracy | `intent_detected` events **plus** a human/QA-verified ground-truth label | No |
| Autonomous Resolution Rate | `human_transfer` (absence-of) events joined against existing `outcome`/`fcr` call-data facts | Partially — needs a join, not new storage |

Both ratios marked "Yes" go from **structurally ready** to **actually live** only when a real producer starts emitting matching events — this activation does not itself make either ratio Direct.

## 6. R6 producer contract (defined, not implemented)

`producer → canonical InteractionEvent → persistence`, using the now-live `call_center_events_append`/`appendEvents` path (`InteractionEventRepository`, `supabaseInteractionEventRepository.ts`) — no HTTP endpoint added this session, since the audit found no genuine producer exists yet and the Vercel Hobby function budget remains at its documented ceiling (11 routes, unchanged). When a real producer contract is confirmed, the minimal integration is either (a) a new internal service call if the producer runs inside this same deployment, or (b) exactly one new `api/*.ts` route calling `validateInteractionEvent()`/`validateInteractionEventBatch()` before `appendEvent`/`appendEvents` — both already fully built and unit-verified (R5's 22/22 suite), needing no further design work.

**Required per event, exactly as R5 originally specified (unchanged, re-confirmed against the now-real schema):**

```
event_id        — stable, producer-generated, unique per real occurrence (the idempotency key — a retry MUST reuse the same event_id, never generate a new one)
interaction_id  — the same call_id / chat session identifier already used elsewhere (no new identity space)
event_time      — ISO 8601, when the event actually occurred (never ingestion time)
event_type      — one of the 9 canonical types (§1)
success         — true | false | omitted/null (null ONLY when genuinely not applicable to this event_type — never sent as false to mean "unknown")
error_code / error_message  — when success = false
latency_ms      — real duration of this specific operation, when measurable — never derived from unrelated timestamps
tool_name       — for tool_call (and knowledge_retrieval where relevant)
provider / model — where relevant
metadata        — tool/provider-specific detail only — NEVER phone numbers, account numbers, customer names, credentials, or transcript text (enforced by `validateInteractionEvent`'s PII-shaped-key rejection)
```

Two open product questions carried over unchanged from R5, still unresolved: whether the Voice Agent can emit an AI-turn-count fact (Fallback Rate's missing denominator), and whether `escalation` events can carry a structured avoidable/unavoidable classification.

## 7. Regression verification

- **5 existing Direct ratios unchanged**: `fcr` re-checked live post-migration — `runtimeState: 'live'`, `value: 8.2`, `availability: 'direct'`, identical to R4.3's verified figures. No ratio source file was touched this session.
- **R4.3 runtime-state behavior unchanged**: confirmed in the same live check above — `runtimeState` field present and correct.
- **Customer 360 unchanged**: `customer_interactions` row count identical before/after (572).
- **Campaign automation unchanged**: `vercel crons ls` shows the same 3 entries, same schedules, untouched.
- **Phase E campaign remains running/pending**: campaign `b0de9fae-...` still `running`, target `7c319e38-...` still `pending`/`attempt_count: 0` — confirmed by direct query at the end of this session. Still waiting for the next scheduled `runBatch` tick; nothing in this session interacted with it.
- **No telephone call triggered**: this session touched only the `interaction_events` domain and read-only Campaign verification queries.

## Files changed

**None** in the application source tree. The only artifacts from this session are the database migration application itself (already-authored SQL, unmodified) and this report.

---

## R5.1 AUDIT: PASS
## MIGRATION: APPLIED
## PERSISTENCE: PASS
## CONSTRAINTS: PASS
## IDEMPOTENCY: PASS
## SYNTHETIC TEST DATA: CLEANED
## REAL PRODUCER EVENTS PRESENT: NO
## TOOL SUCCESS RATE READY FOR LIVE DATA: YES (table/contract ready; awaiting real producer events — not promoted to Direct)
## AUTH SUCCESS RATE READY FOR LIVE DATA: YES (table/contract ready; awaiting real producer events — not promoted to Direct)
## DIRECT RATIO REGRESSION: PASS
## R4.3 REGRESSION: PASS
## CUSTOMER360 REGRESSION: PASS
## CAMPAIGN PHASE E UNTOUCHED: YES
## R6 PRODUCER CONTRACT: DEFINED
## NEXT RECOMMENDED R6 PRODUCER: Tool Success Rate or Authentication Success Rate (both need no further undefined product decision — Fallback Rate/Avoidable Escalation/Intent Accuracy each still need one open product decision named in §5/§6 before they're worth building a producer for)
## DEPLOYED COMMIT: (docs-only; see commit hash in this session's git log — no application code changed, nothing to deploy to Vercel)

Stopping here per the session's explicit instruction — not beginning R6.
