# Session 7 — CMA Source Evidence Integration

Connects the already-deployed Session 6/6.1 CMA conversation-aware
evidence foundation (`cmaEvidenceTypes.ts`, `cmaEvidencePathSelector.ts`,
`cmaEscalationEvidence.ts`) to real VoiceForce data. No existing CMA
calculation, registry, or governance status was changed. This session
was implemented and verified locally only — nothing was committed,
pushed, or deployed, per its own explicit boundary.

## Part A — Actual data flow (traced against real code and real production data, not assumed)

```
VoiceForce Conversational Agent API (/call-data, /sessions/{id})
    -> src/server/customer360/voiceAgentInteractionSource.ts (mapEntry)
    -> SourceInteraction (src/server/customer360/types.ts)
    -> src/server/cma/cmaSyncMapping.ts (buildCmaSyncPayload)
    -> call_center_sync_interaction RPC -> call_center.customer_interactions
    -> src/server/cma/cmaEvidenceOrchestrator.ts (new, Part D)
         -> src/server/cma/cmaEscalationEvidence.ts (Session 6, unchanged logic)
         -> src/server/cma/cmaTranscriptEvidenceCache.ts (new, Part C)
         -> src/server/cma/cmaEscalationLlmVerifier.ts (new, Part E, opt-in)
    -> call_center_cma_evidence_upsert RPC -> call_center.cma_interaction_evidence
    -> (future) CMA calculations / application screens
```

### The real correction to Session 6's own finding

Session 6's foundation doc stated that `intent_confidence`, `was_authenticated`,
and `fcr` "don't exist" on the Voice API. **That was wrong for two of the
three.** Reading the actual documented API response shapes
(`docs/Call_data_API (1).docx`) found:

| API field | Documented shape | Real finding |
|---|---|---|
| `fcr` | `boolean` | **Real, currently-returned top-level field.** The gap was entirely in `cmaSyncMapping.ts`, which deliberately omitted it from the sync payload (its own prior comment said `SourceInteraction` "has no such field" — true at the time, but never re-examined against the real API). |
| `intent_accuracy` | `number`, 0-100 scale | **Real, currently-returned field** (maps to the schema's `intent_confidence` column). Same sync-payload omission as `fcr`. The 0-100 scale also needed reconciling against this schema's existing 0-1 "score" convention (`sentiment_score`, confirmed live: min 0, max 0.95, avg ~0.476) — **rescaled by /100 at the mapping boundary**, not stored raw. |
| `was_authenticated` | `boolean \| null` | Genuinely different root cause. The sync/mapper code was **already** correctly wired end-to-end (`mapEntry` → `SourceInteraction.wasAuthenticated` → sync payload → RPC → column) *before* this session. Live production check (761 rows) confirms `was_authenticated` is null for every one — the real Voice API itself returns null for this field on every existing historical call. Not a sync omission; a genuine current source-data gap. |

## Part B — Source fact synchronization repair

**Fixed** (`src/server/customer360/types.ts`, `voiceAgentInteractionSource.ts`,
`chatInteractionSource.ts`, `src/server/cma/cmaSyncMapping.ts`):

- `SourceInteraction` gained two fields: `fcr: boolean | null`,
  `intentConfidence: number | null`.
- `voiceAgentInteractionSource.ts`'s `mapEntry` now maps
  `fcr: typeof dto.fcr === 'boolean' ? dto.fcr : null` and
  `intentConfidence: typeof dto.intent_accuracy === 'number' ? dto.intent_accuracy / 100 : null`
  — never coerces a missing/non-boolean/non-number upstream value into
  a guessed default.
- `chatInteractionSource.ts`'s `mapRow` always sets both to `null` —
  chat has no equivalent concept on its API contract.
- `cmaSyncMapping.ts`'s `buildCmaSyncPayload` now includes both fields
  (previously deliberately excluded under a now-corrected assumption).
  A genuine `null` is still sent as an explicit overwrite, same
  "upstream snapshot always wins" contract every other field in this
  payload already follows — never omitted, never fabricated.
- The already-deployed `call_center_sync_interaction` RPC needed **no
  change** — it has presence-checked `fcr`/`intentConfidence` merge
  logic since the `20261024000000_cma_interaction_base_facts.sql`
  migration; it was simply never sent these keys before.

**Backfill mechanism (no new infrastructure)**: the existing manual
"Sync Now" admin control (`CmaSyncPanel.tsx` → `runManualCmaSync`,
`src/server/cma/cmaSyncRun.ts`) already accepts an explicit lookback-hours
override with no upper bound in its UI. Triggering it with a lookback
covering all historical `started_at` values (e.g. 24 × 400 hours) will
re-run `buildCmaSyncPayload` for every row in that window and upsert the
now-corrected `fcr`/`intentConfidence` values via the existing,
already-idempotent RPC — no new cron, no new endpoint, no new backfill
script. This is the "controlled manual synchronization/backfill
mechanism using the existing CMA Sync infrastructure" the brief asks
for.

**Idempotency / duplicate / preservation guarantees**: unchanged — the
same `(source, interaction_id)` unique constraint and presence-checked
merge the RPC already enforced before this session governs the two new
fields identically to every existing one. Business Data Scope is
untouched (no scope-filtering code was modified).

## Part C — Conversation evidence access

Transcripts are still fetched live, never persisted as a general
conversation store. What's new is a **minimal, versioned cache in
front of that fetch**, specifically to satisfy "avoid repeated fetching
of unchanged transcripts":

- **`src/server/qa/transcriptFetcher.ts`**: split `fetchRawVoiceTranscript`
  out of the existing `fetchQaTurnsForInteraction` (same fetch, same
  mapping call — `fetchQaTurnsForInteraction` now calls it internally,
  zero behavior change for existing QA callers). This preserves the raw
  `TranscriptEntry[]` shape (`{timestamp, speaker, text}`) BEFORE the
  `role`/`speakerLabel` normalization `voiceTurnsFromTranscript` applies
  — necessary because `computeVoiceTurnId` (shared turn-identity logic,
  `src/lib/qaTurnIdentity.ts`) needs the raw `speaker` value to stay
  turn-id-compatible with Human/Automated QA; using the normalized
  `role` instead would silently change turn ids (it collapses 'ai' and
  'agent' together).
- **`src/server/cma/cmaTranscriptEvidenceCache.ts`** (new): pure
  content-hash + TTL-freshness logic, plus a `getOrFetchTranscriptEvidence`
  orchestration function written against injected `readCache`/`writeCache`/
  `fetchLive` dependencies (same pattern Session 6's evaluators already
  use for their injected `verify`) — fully unit-testable with in-memory
  mocks, no real Supabase client or network call in the test suite.
  - A cached result within 24h is returned without any live fetch —
    including a cached `unavailable` result, so a transcript that
    genuinely 404s isn't re-fetched on every call either.
  - `fetchStatus` is one of `available` / `unavailable` (fetch threw —
    404/network) / `incomplete` (fetch succeeded, zero turns).
- **`supabase/migrations/20261112000000_cma_transcript_evidence_cache.sql`**
  (new, **not applied to production this session**): one table
  (`call_center.cma_transcript_evidence_cache`, one row per interaction,
  content-hashed, versioned) + 3 RPCs (`get`, `upsert` — idempotent,
  version-bumping only on genuine content change — and
  `purge_expired` for the explicit 30-day retention rule, never a new
  cron). Deny-all RLS, `service_role`-only grants, same conventions as
  every prior CMA migration.

## Part D — Connecting the evidence foundation

**`src/server/cma/cmaEvidenceOrchestrator.ts`** (new) is the glue — it
does **not** change `evaluateEscalationReasonEvidence` or any Session 6
logic. Given one real interaction's structured facts
(`{interactionId, outcome, escalationTrigger}`):

1. `escalationReasonNeedsTranscript` (pure) decides — from the
   structured facts alone — whether a transcript could possibly be
   needed, mirroring (never duplicating) the evaluator's own
   fast-path/ineligible decision. A clean fast-path or ineligible row
   never triggers a transcript fetch at all.
2. If needed, fetches evidence via the Part C cache, passing only the
   stripped `{timestamp, speaker}` shape into the evaluator (for turn-id
   computation) while keeping the full text turns in closure scope for
   the LLM question (Part E).
3. Looks up the current active finding (`call_center_cma_evidence_get_active`)
   so a re-evaluation explicitly supersedes it.
4. Calls `evaluateEscalationReasonEvidence` unchanged.
5. Persists via `call_center_cma_evidence_upsert`.

Deterministic test coverage (`cma-evidence-orchestrator-verify.mjs`,
26 assertions) confirms: a fast-path row never attempts a transcript
fetch or an LLM call; a contradictory row with no transcript stays
honestly `insufficient`; a contradictory row WITH a transcript asks the
LLM with the real text and records the result as `contradicted` (never
silently merged); a missing-transcript eligible row stays `insufficient`;
an explicit LLM `unresolved` category stays `unresolved`; and a repeated
evaluation of the same interaction reuses the cached transcript (one
live fetch across two runs) while the second run's finding explicitly
supersedes the first's.

## Part E — Targeted LLM integration

**`src/server/cma/cmaEscalationLlmVerifier.ts`** (new) reuses
`callGenericLlm` (`src/server/qa/genericLlmClient.ts`) exactly as-is —
no new provider, no new framework. `makeGenericLlmEscalationAsker(options)`:

- **Opt-in gate**: `options.enabled` must be explicitly `true`, or the
  function returns `null` before any network call. The safe default
  for any caller is `enabled: false`.
- Asks ONE specific question ("why was this call escalated, classify
  using only these categories") with the real structured API facts
  (`outcome`, `escalation_trigger`) as context and only the fetched
  transcript turns as evidence — never a generic "analyse this call"
  prompt, never asked to compute a percentage.
- Requires JSON-schema-constrained structured output
  (`reason_category` enum, `confidence`, `evidence_turn_indices`).
- Bounded retry (default 2) only for the documented retryable error
  codes (`rate_limited`/`llm_unavailable`/`inference_timeout`); a
  permanent validation error is never retried.
- Malformed/missing structured output, or a terminal failure, returns
  `null` — surfaced upstream as `unresolved`, never guessed.
- Records `modelId`/`promptVersion` (a small, additive, optional
  extension to `EscalationReasonVerificationResult` in
  `cmaEscalationEvidence.ts` — two new optional fields, no behavior
  change) so the persisted finding's `sourceObservation.raw` carries
  real model/prompt provenance.
- Evidence-reference validation against the real transcript is still
  `evaluateEscalationReasonEvidence`'s own job (Session 6, unchanged) —
  this module never second-guesses that.

**This module was never invoked against the real LLM endpoint in this
session** — only a deterministic mock exercises the orchestrator's
`askLlm` dependency in tests. Live execution requires a caller to
explicitly construct `makeGenericLlmEscalationAsker({ enabled: true, ... })`,
which no production route does yet.

## Part F — End-to-end reference case

Demonstrated entirely through the orchestrator's deterministic test
suite (no bulk reanalysis, no synthetic data sent to the live Voice
API — only mocked transcript/LLM dependencies):

| Case | Result |
|---|---|
| Supported escalation (trigger present + outcome=escalated) | Fast path, no transcript fetch, no LLM call, `value` = the real `escalation_trigger`. |
| Escalation requested but not executed (contradiction), no transcript | `insufficient`/`indeterminate`, never silently resolved either way. |
| Contradictory API and conversation evidence, transcript available | LLM asked with full text; result recorded as `contradicted`, not `validated` — the disagreement is preserved, not merged. |
| Missing transcript (eligible row, no trigger, no transcript) | `insufficient`, no value fabricated. |
| Unresolved outcome (LLM returns explicit `unresolved`) | Stays `unresolved`. |
| Repeated evaluation (idempotency) | One live transcript fetch across two runs (cache reused); second finding explicitly supersedes the first. |

This session does **not** change `CANON-ESC-RATE`'s governance status
or denominator — it connects evidence evaluation for one supporting
fact (`escalation_reason`), nothing more.

## Part G — Testing

New deterministic suites (all wired into `npm run verify:full`, all
mock-only — no real Supabase client, network call, or LLM call):

- `cma-source-fact-mapping-verify.mjs` (10 assertions) — DTO→SourceInteraction
  mapping for `fcr`/`intentConfidence`, including the 0-100→0-1 rescale
  and null-preservation.
- `cma-transcript-evidence-cache-verify.mjs` (22 assertions) — content
  hashing, TTL freshness, cache hit/miss, live-fetch failure handling,
  cached-unavailable-avoids-refetch, idempotency.
- `cma-evidence-orchestrator-verify.mjs` (26 assertions) — the full
  Part F reference case list above.
- `cma-interaction-synchronization-verify.mjs` updated (not replaced)
  to assert `fcr`/`intentConfidence` ARE now included and null-preserved,
  correcting its prior (now-wrong) "never includes" assertion.

Full run: `npm run typecheck` / `npm run verify:full` / `npm run build`
all pass clean, including every pre-existing suite — **no regression**
in the 19 existing operational CMA measures, Dashboard, Campaigns,
Analytics, Agent Detail, Human QA Quality Explorer, CMA authorization,
or Business Data Scope (none of that code was touched this session).

**Migration validation**: `supabase/migrations/20261112000000_cma_transcript_evidence_cache.sql`
was validated end-to-end in disposable PostgreSQL (fresh cluster, full
real migration history replay, the new migration layered on top, then
real SQL assertions) — see the "Migration validation results" section
below for the specific checks and outcome. **Not applied to production.**

## Part H — Measure ownership readiness

`docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` updated for the three
measures this session's Part B fix directly affects:

- **`CANON-AUTH-SUCCESS-RATE`** — corrected finding: the sync gap
  theory was wrong; the real blocker is the Voice API returning null
  for `was_authenticated` on every existing call. No code change can
  fix this; needs either new calls with a real value or VoiceForce
  confirmation.
- **`CANON-FIRST-CONTACT-RES`** (FCR) — sync gap fixed. Still
  `pending_decision`, blocked only on FCR-03 business approval, not on
  source data anymore.
- **`CANON-INTENT-CONFIDENCE`** — sync gap fixed, and this measure is
  already `decided`/operational (strategy A). Its only remaining step
  is running the existing manual backfill sync — marked "ready pending
  backfill run" (not claimed as fully owned yet, since the brief
  explicitly warns against claiming ownership merely because source
  data is now available; the governed calculation and screen
  consumption already existed before this session).

No canonical governance status was changed. No pending definition was
activated.

## Part I — Genuine outstanding limitations

- `was_authenticated` remains a genuine, unresolved source-data gap —
  not something this session (or any code change) can fix.
- The backfill sync run itself was **not executed** this session (no
  production writes were authorized beyond what's explicitly stated
  here) — `fcr`/`intentConfidence` will show real values only after an
  admin triggers "Sync Now" with an extended lookback.
- The real Generic Local LLM endpoint was never called live this
  session — only a deterministic mock exercises `askLlm` in tests.
- Chat has no transcript-evidence wiring yet (`makeVoiceLiveFetcher`
  throws if called with `'chat'`) — this session's reference case is
  voice-only `escalation_reason`, matching Session 6's own scope
  decision.
- `evaluateAndPersistEscalationReason` and the new transcript cache are
  not yet called from any production route or cron — they are a
  connected, tested foundation, not a live, running pipeline. The next
  session would need to decide where this gets triggered from (a new
  manual admin action, most likely, consistent with "no new cron
  jobs").

## Migration validation results (disposable PostgreSQL)

Fresh PostgreSQL 17 cluster, full real migration history (58 prior
migrations, in order) replayed, then
`20261112000000_cma_transcript_evidence_cache.sql` applied on top —
cluster torn down afterward, nothing applied to the real production
project (`dtbaczafdzgctkbqviod`). All 9 planned checks passed:

1. Full history + the new migration applied with no errors.
2. All 12 columns, all 4 check constraints, PK, unique index, and RLS
   (enabled, zero policies) present exactly as written.
3. The `(interaction_id, interaction_type)` unique index was never
   violated across 3 upserts — row count stayed at 1 throughout.
4. Upsert idempotency confirmed precisely: first call inserts
   `version=1`; a same-content-hash call keeps `version=1` (only
   `fetched_at`/`retention_expires_at` refresh); a different-content-hash
   call bumps to `version=2` and overwrites `turns`/`content_hash`. Row
   `id` stayed identical across all three calls — no ambiguous-column
   error, and the `UPDATE`/`RETURNING` statements are correctly
   table-qualified.
5. `get` returns the single row for an existing interaction and an
   empty set for a nonexistent one.
6. `purge_expired` deleted exactly one manually-backdated row, returned
   the correct count, and left a fresh row untouched.
7. RLS deny-all confirmed (`relrowsecurity = true`, 0 policies).
8. All 3 RPCs granted `EXECUTE` only to `postgres` (owner) and
   `service_role` — no `anon`/`authenticated`/`public`.
9. Purely additive — no `ALTER` on any existing table; coexists cleanly
   with the already-deployed `cma_interaction_evidence` table with no
   cross-interference.

No defect found. This migration is validated and ready for a future
session's deployment decision — it was **not** applied to production
this session, per Session 7's explicit boundary.
