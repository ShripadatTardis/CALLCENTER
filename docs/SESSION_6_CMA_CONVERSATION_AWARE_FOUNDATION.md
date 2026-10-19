# Session 6 — CMA Conversation-Aware Measurement Foundation

Extends the Central Measures Authority (CMA) toward progressive
ownership of measures derivable from existing VoiceForce records, by
building a small, typed evaluation foundation that uses the
VoiceForce Conversational Agent's own existing analysis as input
rather than independently re-analysing every conversation. No existing
CMA calculation, registry, synchronization pipeline, evaluation API,
dimension, or authorization mechanism was touched. This foundation was
committed, pushed, and deployed to production in Session 6.1 — see
the "Session 6.1 — Deployment and production verification" section at
the end of this document for the commit, migration, and verification
record.

## Part A — Evidence inventory (verified against real code and real production data, not assumed)

| Fact category | Real finding |
|---|---|
| **Transcripts** | Never persisted in Supabase. Fetched live, per request, from the external VoiceForce API (`src/server/qa/transcriptFetcher.ts`). `automated_qa_evaluations.transcript_snapshot` stores an immutable snapshot taken at evaluation time — not a live store. Turn identity is already computed deterministically (`src/lib/qaTurnIdentity.ts`) and is reused as-is by this session's reference implementation, never a second id scheme. |
| **VoiceForce API analytical fields** | The API DTO (`src/types/api/calls.ts`) declares `sentiment_score`, `escalation_trigger`, `actual_outcome_code`, `actual_outcome_name`, `structured_outputs`, `intent`, `intent_confidence`, `was_authenticated`. Only `intent`, `outcome`, `sentiment_score`, `was_authenticated`, `escalation_trigger`, `duration_seconds`, `category_id` have a Supabase column at all (`call_center.customer_interactions`). `actual_outcome_code`/`actual_outcome_name`/`structured_outputs`/`intent_confidence` as columns don't exist to be populated. |
| **Real production nullability** (761 real voice rows, confirmed live) | `sentiment_score` 761/761, `outcome` 761/761, `intent` 761/761 — fully populated. `escalation_trigger` 38/761 — sparse but real when present. `intent_confidence`, `was_authenticated`, `fcr` — **0/761**, because the sync RPC (`20261024000000_cma_interaction_base_facts.sql`) only writes those columns `case when p_payload ? 'key'`, and the current sync payload simply doesn't send those keys. This is a sync-payload gap, not a schema gap or an API-unavailability gap — directly relevant to Part D's classification. |
| **Existing QA evidence structures** | `call_center.automated_qa_evaluations`/`automated_qa_observations` already carry essentially the full shape this session's §7 contract needs: finding+evidence (`observations`, `unassessable_parameters`), validation status (`status`, `evaluation_completeness`), evaluator/version (`model_id`, `prompt_version`, `contract_version`, `schema_version`), provenance (`request_ids[]`, `transcript_snapshot`+`transcript_hash`), timestamps, error reporting. This is why this session's new typed contract is a **generalization**, not a reinvention — QA's own tables stay QA-specific and untouched. |
| **Existing LLM integration** | One already exists: `src/server/qa/genericLlmClient.ts` (a dumb, provider-agnostic POST wrapper to the project's own "Generic Local LLM API", same `VOICEBOT_BASE_URL`/`VOICEBOT_API_KEY` host as the rest of the Voice/Chat integration — not OpenAI/Anthropic) + `src/server/qa/automatedQaEvaluator.ts` (the orchestration: windowing, bounded retries, JSON-schema-constrained structured output, temperature 0). This session's reference implementation reuses this exact client/pattern rather than building a second provider integration. |
| **Supersession/versioning precedent** | `call_center.campaign_configuration_versions` already has the reusable shape: `previous_version_id` self-reference, `status in ('active','superseded')`, a partial unique index enforcing exactly one active version per parent. This session's new table reuses this precedent directly. |

## Part B/C — Evaluation model and evidence contract

Implemented exactly the brief's sequence (existing API analysis + stored
evidence → assessment → fast path / verification / derivation →
governed finding), as small, pure, dependency-free TypeScript rather
than a framework:

- **`src/server/cma/cmaEvidenceTypes.ts`** — the typed
  `CmaInteractionEvidenceFinding` contract (brief §7's required
  fields: interaction identity, fact identity, finding/eligibility,
  source observation, evidence references, validation status,
  confidence, evaluation method, evaluator version, timestamp,
  supersession), plus `computeEvidenceEvaluationId` — a deterministic,
  dependency-free hash giving the same (interaction, fact, evaluator
  version, normalized inputs) the same id every time, the mechanism
  that makes re-evaluation idempotent (brief §8/§15).
- **`src/server/cma/cmaEvidencePathSelector.ts`** — `selectCmaEvidencePath`,
  a pure decision function any future interaction-fact evaluator can
  reuse. Deliberately conservative: a contradiction between two
  structured facts is **never** silently resolved by picking a side —
  it always routes to verification (if context exists) or
  `unsupported_inference` (if it doesn't), never straight to
  `fast_path`.
- **`supabase/migrations/20261110000000_cma_interaction_evidence_foundation.sql`**
  (written, validated, **not applied to production**) —
  `call_center.cma_interaction_evidence`, generalizing
  `automated_qa_evaluations`' provenance shape for arbitrary
  CMA-relevant facts, with the same supersession-chain precedent as
  `campaign_configuration_versions`. Two RPCs,
  `call_center_cma_evidence_upsert`/`_get_active`, `service_role`-only,
  deny-all RLS — same conventions as every prior migration.

Recalculation vs. re-evaluation (brief §8) is structurally enforced:
a dashboard window/filter change only ever reads already-validated
findings (a future `call_center_cma_evidence_get_active` call, or a
future CMA RPC join against this table) — it never re-invokes
`evaluateEscalationReasonEvidence` or calls an LLM. Only new/changed
evidence (a different `escalationTrigger`/`outcome`) or a new
`evaluatorVersion` produces a different `computeEvidenceEvaluationId`
and therefore a genuinely new evaluation.

## Part D — Measure ownership classification

All 60 registered canonical measures were classified by real
calculation strategy (A–F), cross-checked against the live
`CMA_ALGORITHM_REGISTRY`, the real `cma_canonical_measures` table, and
real production data. Full detail:
`docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv`.

| Strategy | Count | Meaning |
|---|---|---|
| A — ALREADY_CMA_OWNED | 19 | Matches the 19 operational registry entries exactly |
| B — DIRECTLY_DERIVABLE | 7 | Stored facts already exist; blocked on a business-rule decision or an authorization-integration gap, not on data |
| C — API_INFORMED | 9 | The VoiceForce Trace API already has a structured field (`tool_calls`, `final_plan.action`, `router_decision`, `escalation_event` cause, etc.) that is simply not yet ingested into Supabase — this is the exact class of measure this session's foundation targets next |
| D — TARGETED_INTERPRETATION | 0 | No catalogued measure genuinely requires raw-transcript interpretation beyond what C's structured Trace-API fields already cover |
| E — TELEMETRY_DEPENDENT | 1 | Call Technical Performance — needs real external instrumentation (`/api/v1/analytics/call-metrics`), not an LLM |
| F — SOURCE_UNAVAILABLE / governance-blocked | 24 | Genuinely no source exists, the engine's aggregate shape doesn't fit, or it's a single-record lookup rather than a population measure |

No governance status was changed. No pending definition (FCR, Escalation
Rate, AHT, Call Technical Performance) was activated.

## Part E — Reference implementation

**Chosen fact: `escalation_reason` on voice interactions.** Selection
rationale, against the brief's own criteria: real API evidence exists
today (`escalation_trigger`, confirmed non-null on 38/761 real
production rows); it has a clear, already-governed use (feeds a future
`CANON-AVOIDABLE-ESC-RATE`/escalation-cause measure, currently
`unimplemented`, strategy C); it directly demonstrates the brief's own
explicit warning (§6: *"do not confuse a requested escalation with an
executed transfer"*) — a real production call can carry a non-null
`escalation_trigger` without `outcome='escalated'` (escalation
requested but not actually executed), which this evaluator treats as a
genuine contradiction, never silently merged into one side.

Implemented in `src/server/cma/cmaEscalationEvidence.ts`
(`evaluateEscalationReasonEvidence`), with an injectable `verify`
function so production code can wire it to `callGenericLlm` while
every test uses a deterministic in-memory mock — **no real LLM is ever
called by this foundation's tests**.

Behavior, by case:
1. **No escalation requested or executed** → `ineligible`, no value
   fabricated, no LLM call.
2. **Fast path** — `escalation_trigger` present and consistent with
   `outcome='escalated'` → the structured field is accepted as the
   validated reason without any new LLM call.
3. **Contradiction, no transcript** — trigger present but
   `outcome≠'escalated'` (requested-but-not-executed) and no
   transcript available to resolve it → honestly reported as
   `indeterminate`/`insufficient`, never guessed either way, no LLM
   call (there's no context to verify with).
4. **Missing evidence, no transcript** — `outcome='escalated'`, no
   trigger, no transcript → `unresolved`, no value fabricated.
5. **Verification path** — missing or contradictory evidence **with**
   a transcript available → a single, focused structured question is
   sent to the verifier (never "analyse this conversation and provide
   all metrics"); the returned category is validated against a fixed
   vocabulary, and any cited transcript turn is checked against the
   *real* transcript before being trusted — an invalid citation is
   rejected, not trusted blindly.
6. **Contradiction resolved via transcript** — recorded as
   `validationStatus='contradicted'`, not `'validated'`, even though a
   value was found — the disagreement between the two structured
   facts is preserved for human review, never hidden.
7. **Idempotency/versioning** — `computeEscalationReasonEvaluationId`
   gives identical inputs the identical id on repeat calls; changing
   `evaluatorVersion` (e.g. a future prompt bump) changes the id;
   `supersedesEvaluationId` is carried through explicitly when a prior
   evaluation id is supplied.

## Part F — Tests

`.tooling/scripts/cma-escalation-evidence-verify.mjs` — 30 deterministic
assertions against the real compiled module (esbuild-bundled, not
reimplemented), covering every brief §15 scenario: valid API finding,
missing API finding, conflicting API/structured evidence, missing
transcript, unsupported-inference refusal, selective escalation to a
mocked targeted LLM, unresolved interpretation (both verifier failure
and explicit "unresolved" category), an invalid cited transcript turn
being rejected, repeat-call idempotency, and evaluator-version/
supersession handling. Explicitly confirmed: the fast path and the
no-transcript contradiction/missing-evidence cases never invoke the
verifier at all (asserted directly, not just implied). No real LLM
service is called anywhere in this suite. Wired into `verify:full`.

Scope isolation (brief §15) is not separately re-tested here: this
foundation operates purely on already-scope-filtered interaction
inputs handed to it by a caller — the real Business Data Scope
enforcement this session relies on is the existing, already-verified
`toAgentAccess`/`evaluateCmaMeasure` mechanism (Session 5), not
duplicated at this layer.

**Persistence migration validation** (disposable PostgreSQL only, never
production): all 10 planned checks passed — table/function creation,
first-upsert shape, re-evaluation supersession chain, the
one-active-row-per-fact partial unique index, `get_active` returning
exactly the active row, no cross-fact/cross-interaction collisions,
`service_role`-only grants, deny-all RLS, the `confidence` range check
constraint, and jsonb round-tripping. **One real defect found and
fixed during validation**: the upsert RPC's `UPDATE ... WHERE id =
v_prior_id` had an ambiguous column reference (matching both the
PL/pgSQL variable and the table column), which caused every
re-evaluation attempt to fail outright — not a hypothetical edge case,
a real bug that would have broken the supersession chain on its first
real re-evaluation. Fixed by qualifying the column
(`cma_interaction_evidence.id = v_prior_id`) directly in the
not-yet-applied migration file; re-validated clean after the fix. The
disposable cluster was stopped and its data directory deleted — nothing
was ever applied to production.

## Regression verification

`npm run typecheck` / `npm run verify:full` (now including the 30 new
assertions) / `npm run build` — all clean, re-confirmed after every
change in this session. No existing CMA calculation, registry entry,
dimension, RPC, or screen integration (Dashboard, Campaigns, Analytics,
Agent Detail, Human QA Quality Explorer, Business Data Scope
enforcement) was modified.

## What is genuinely ready for incremental rollout

- **The typed evidence contract and path-selector** (`cmaEvidenceTypes.ts`,
  `cmaEvidencePathSelector.ts`) are generic — any future fact evaluator
  can reuse them without new design work.
- **The reference implementation** (`cmaEscalationEvidence.ts`) is a
  real, tested, API-informed-and-selectively-verified evaluator for one
  fact. It is not wired into any production screen or CMA measure yet —
  that would require (a) authorization to apply the migration, (b) a
  real `VoiceForce` endpoint capable of serving the Generic Local LLM
  contract for this specific question (not verified live this session —
  only mocked), and (c) a decision on which canonical measure, if any,
  should consume it (the natural candidate, `CANON-AVOIDABLE-ESC-RATE`,
  is currently `unimplemented`/strategy C and would need its own
  governance/activation step, not performed here).
- **The persistence migration** is validated and ready to apply in a
  future session once explicitly authorized.

## Next eligible measures for implementation (ranked, per the transition register)

1. `CANON-AUTH-SUCCESS-RATE`/`CANON-INTENT-CONFIDENCE` — already
   `decided` and operational; only blocked because the sync payload
   doesn't send `wasAuthenticated`/`intentConfidence`. The smallest
   possible next step: confirm with the Voice API whether those fields
   are genuinely available and extend the sync payload — no new CMA
   code needed.
2. Wire `CANON-CHAT-SESSION-SPAN` and `CANON-ACTION-REQUIRED-QUEUE-ITEMS`
   into an actual consuming screen (both are operational today with
   zero consumers).
3. Customer 360's three `decided`-but-unregistered measures, once
   Customer Category Scope is integrated into the evaluation pipeline.
4. `CANON-QA-PASS-RATE`/`CANON-COMPLIANCE-PASS-RATE` — need a business
   rule decision, not new data.
5. The 9 Trace-API-informed (`C`) measures — require a new, scoped
   ingestion path for Trace API fields (`tool_calls`, `final_plan.action`,
   `router_decision`, `escalation_event` cause) into Supabase before any
   of them can move past `unimplemented`. This is the direct
   continuation of this session's foundation and its most natural next
   session.

## Genuine outstanding limitations

- The Generic Local LLM endpoint was never called live this session —
  only a deterministic mock was exercised. Whether the real endpoint
  can actually answer a focused "why did this call escalate" question
  in the documented structured-output contract is unverified.
- No Trace-API ingestion exists yet — the 9 `C`-strategy measures
  remain `unimplemented` until a future session builds that sync path.
- This foundation covers exactly one fact (`escalation_reason`); no
  other interaction-level fact has been ported onto the new contract
  yet (deliberately — brief §13: "avoid unnecessary architecture
  expansion").
- No screen or production route calls `evaluateEscalationReasonEvidence`
  or the new `cma_interaction_evidence` table yet — this session's
  reference implementation and its persistence are deployed but not
  yet wired to any caller, so normal measurement queries, dashboards,
  and the existing 19 operational algorithms are entirely unaffected.

## Session 6.1 — Deployment and production verification

Session 6.1 committed, deployed, and verified in production the
already-complete Session 6 foundation (no new design or
implementation — deployment only, per that session's own brief).

- **Pre-deployment re-verification**: `npm run typecheck`,
  `npm run verify:full` (includes the 30 `cma-escalation-evidence-verify.mjs`
  assertions plus every other existing deterministic suite — zero
  regressions), and `npm run build` all passed clean. The evidence
  migration was independently re-validated end-to-end in a fresh
  disposable PostgreSQL 17 cluster (full real migration history replay
  + the new migration + 8 targeted checks: clean apply, table/check
  constraints, the one-active-per-fact partial unique index actually
  rejecting a duplicate, the upsert RPC's previously-fixed
  ambiguous-column bug confirmed still fixed with no regression, correct
  supersession chaining, `get_active` returning only the active row,
  `service_role`-only grants, and confirmation the migration is purely
  additive with no `ALTER` on any existing table).
- **Commit**: `5ef3fa2` — `feat(cma): add conversation-aware evidence
  foundation`. Staged exactly the Session 6 implementation/test/doc
  files (`src/server/cma/cmaEvidenceTypes.ts`,
  `cmaEvidencePathSelector.ts`, `cmaEscalationEvidence.ts`, the
  migration, the esbuild bundle, the verify script, the two Part G
  docs, and the `verify:full` wiring in `package.json`). `.env` and the
  pre-existing Session 5 doc edit were deliberately left unstaged and
  untouched.
- **Migration deployed**: applied directly (via the Supabase
  management API) to the production project `dtbaczafdzgctkbqviod`,
  recorded in its migration history as version `20261019041938`, name
  `cma_interaction_evidence_foundation` — unchanged from the
  disposable-Postgres-validated file. No synthetic data was written to
  production (deliberately — the brief's own prohibition); production
  verification was limited to read-only schema/grant/RLS inspection.
- **Production verification (read-only)**:
  - `call_center.cma_interaction_evidence` exists with all 18 expected
    columns and correct nullability, matching the migration exactly.
  - Both new RPCs (`call_center_cma_evidence_upsert`,
    `call_center_cma_evidence_get_active`) show `EXECUTE` granted only
    to `postgres` (owner) and `service_role` — no `anon`, `authenticated`,
    or `public` grant.
  - `relrowsecurity` is `true` on the new table with zero rows in
    `pg_policies` — deny-all RLS confirmed, exactly as designed.
  - The migration is additive only — no existing table, RPC, or
    production CMA calculation was altered; the existing 19-entry
    `CMA_ALGORITHM_REGISTRY`, the sync pipeline, and every other
    production screen are unaffected, since nothing yet calls the new
    table or RPCs (see the outstanding-limitations note above).
- **GitHub push**: `5ef3fa2` pushed to `origin/main`
  (`ShripadatTardis/CALLCENTER`), fast-forward from `275dd7c`.
- **Vercel deploy**: the GitHub push auto-triggered a new Production
  deployment (`callcenter-mct4f36kw-sk-tardis-projects.vercel.app`),
  which reached `Ready` in 38s and is aliased to the live production
  domains (`callcenter-three-livid.vercel.app` and the project's other
  aliases). Serverless function count stayed at 12 (Hobby-plan
  ceiling unaffected — no new `api/*` route file was added).
- **Post-deploy smoke check**: the production Dashboard route returns
  HTTP 200; `GET /api/admin?resource=me` with no auth returns 401 (the
  correct unauthenticated response), not a 500 — confirming the
  existing auth-gated API surface is intact after the deploy.
