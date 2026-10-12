# Automated QA Evaluation Architecture — Session 16.3

## Purpose

An independent, LLM-driven evaluator that assesses the same nine Human QA
quality parameters on an existing Voice or Chat interaction, structurally
separated from Human QA at every layer (persistence, prompt input, UI).
This is the foundation Session 16.4 will later compare against Human QA
judgments — this session builds and verifies the automated side alone.

## Generic Local LLM contract

`POST {VOICEBOT_BASE_URL}/api/v1/llm/generate` (same host and
`VOICEBOT_API_KEY` as every other Banking Voicebot integration this
project already uses — `api/_voicebot.ts`), with `response_format: {type:
"json_schema", json_schema: ...}`, `temperature: 0`. Limits: 8,192-token
context window (prompt + output), 4 concurrent requests, 120s timeout.
The client (`src/server/qa/genericLlmClient.ts`) is a dumb I/O wrapper —
no QA knowledge lives there; the API returns inference facts only (model
id, latency, token usage, errors), never QA judgments or schemas.

## Evaluation architecture

```
Call/Chat interaction
  -> src/server/qa/transcriptFetcher.ts (same upstream endpoints as Human QA)
  -> src/lib/qaConversation.ts (voiceTurnsFromTranscript / chatTurnsFromMessages — REUSED, not reimplemented)
  -> src/lib/automatedQaWindowPlanner.ts (context-window-bounded windowing)
  -> src/lib/automatedQaPrompt.ts + automatedQaSchema.ts (system/user prompt + JSON Schema)
  -> src/server/qa/genericLlmClient.ts (one call per window)
  -> src/lib/automatedQaValidation.ts (reject invalid/fabricated observations)
  -> call_center.automated_qa_evaluations / automated_qa_observations (persistence)
  -> src/lib/automatedQaRatios.ts (adapter into the canonical computeQaRatios)
  -> src/pages/AutomatedQaInspector.tsx (read-only UI)
```

## Human QA independence (non-negotiable, brief §5)

- The LLM prompt (`automatedQaPrompt.ts`) is built from the raw transcript
  alone — no `qa_reviews`/`qa_findings` read ever occurs in
  `src/server/qa/*` or `src/lib/automatedQa*` (verified by a source-level
  guard test, `automated-qa-human-review-blinding-verify.mjs`).
- `QaReviewDialog.tsx` (the Human QA review workspace) never imports or
  references anything Automated-QA-related — verified by the same guard
  test, so a Human QA reviewer cannot see automated results while
  conducting an independent review, structurally, not by convention.
- `AutomatedQaInspector.tsx` never imports `QaReviewDialog` — it is its
  own surface, reusing the `QaTurn` data shape and turn-highlighting
  convention, not the Human review component itself.
- Entry points (`AutomatedQaPanel.tsx` in both Interaction Detail dialogs,
  and a "Run Automated" column on the QA Review interaction list) are
  separate, clearly-labeled triggers — never embedded inside the Human
  QA Flag Issue/Good+Next workflow.

## Nine-parameter mapping

Uses the exact `QaParameterCode` strings from `src/lib/qaParameters.ts`
(e.g. `context_continuity_rate`), not a second naming scheme — the
brief's own illustrative uppercase names (§8) are not introduced as a
synonym; the existing codebase dictionary is authoritative.

## Applicability strategy

Unlike Human QA's Tier-1 (structural) / Tier-2 (judgment) split, the LLM
determines applicability for ALL nine parameters per interaction (no
pre-computed structural shortcut, since the LLM doesn't share Human QA's
turn-position-based Tier-1 logic). The prompt instructs it to add an
entry to `unassessable_parameters` rather than guess a value when no
genuine opportunity exists — both explicit clean (e.g. PASS) and explicit
exception observations are requested and stored (never exceptions-only,
or automated denominators would be uncomputable).

## Evaluation input design / prompt strategy

Single combined stage (applicability + quality assessment in one
schema-constrained call per window) rather than two separate API calls,
per the brief's own allowance for short conversations — real test
interactions here are short, and a single call halves token/latency cost
with no loss of correctness, since the schema's `unassessable_parameters`
array already captures the applicability decision explicitly.

## JSON Schema

`src/lib/automatedQaSchema.ts` — deliberately loose on `value`/
`reason_code` (a flat enum across all possible values, not a per-parameter
enum), since the API's supported JSON Schema keywords have no if/then/else
to express "this value is valid only for this parameter_code" cleanly.
`parameter_code` is a strict 9-value enum. The real per-parameter
constraint is enforced by `src/lib/automatedQaValidation.ts` after the
call returns — "validate, don't trust" regardless of how tight the
requested schema is.

## Evidence validation

`validateAutomatedObservations` rejects (never silently repairs): unknown
`parameter_code`; a `value` not allowed for that parameter; a missing or
wrong-vocabulary `reason_code` on a problem value; a `primary_turn_id` or
`evidence_turn_ids` entry not present in the evaluated window's own turn
set (a fabricated turn id is never "corrected" into a real one); a
duplicate/contradictory observation for the same
`(parameter_code, primary_turn_id)` opportunity (first one wins, the rest
are rejected with a diagnostic reason). `CANNOT_VERIFY` on
`response_grounding_rate` is accepted like any other problem value (still
needs its own reason code) — its "not a quality failure" status is
enforced downstream by the unchanged `computeQaRatios` exclusion rule, not
by relaxing validation.

## Transcript identity strategy

`transcriptFetcher.ts` fetches the SAME upstream endpoints
(`/api/v1/sessions/{id}` for voice, `/api/v1/chat/sessions/{id}` for chat)
Human QA's own client-side hooks use, then runs the raw response through
the EXACT SAME pure mapping functions (`voiceTurnsFromTranscript`,
`chatTurnsFromMessages`, `computeVoiceTurnId`) QaReviewDialog uses
client-side. This guarantees an automated evaluation and a Human review of
the same interaction compute identical turn ids, with zero duplicate
mapping logic to drift. The exact ordered `QaTurn[]` array evaluated is
persisted as `transcript_snapshot` (immutable, with a SHA-256
`transcript_hash`) — if the live transcript later changes, a past
evaluation stays bound to what it actually saw.

## Context-window management

`src/lib/automatedQaWindowPlanner.ts` splits the full turn list into
sequential, non-overlapping windows sized to the remaining transcript
token budget (8,192 total − system prompt − schema − max_output_tokens −
safety margin, each estimated via a length/4 heuristic). Every turn is
covered by exactly one window — never dropped, never double-counted.
**Trade-off, documented rather than hidden**: windows are sequential, not
overlapping, so a repetition/loop spanning a window boundary may not be
detected. Whenever an interaction needs more than one window, the
orchestrator adds an explicit `repetition_loop_rate` entry to
`unassessable_parameters` naming this limitation — never silently
under-reported as `NO_ISSUE`.

## Evaluation orchestration

One evaluation per interaction at a time, enforced by a Postgres partial
unique index (`automated_qa_evaluations_one_inflight_per_interaction`) —
a duplicate/concurrent `start` request for the same in-flight interaction
returns the existing evaluation (`alreadyInFlight: true`) rather than
starting a second one. Within one evaluation, windows run strictly
sequentially (never more than 1 concurrent LLM call per evaluation,
comfortably under the API's 4-concurrent-request ceiling even with
several evaluations running for different interactions at once).
Retryable errors (`rate_limited`, `llm_unavailable`, `inference_timeout`)
get up to 2 retries with backoff; permanent errors (`invalid_request`,
`invalid_json_schema`, `context_length_exceeded`, etc.) are never
retried.

**Synchronous execution, a scale-appropriate decision**: rather than
building a durable cron-polled job queue (this project has no existing
precedent for one, and the brief explicitly warns against assuming an
in-memory queue survives serverless execution), evaluation runs
synchronously inside the initiating POST request. This is appropriate at
this project's explicitly-stated development/integration-test scale
(brief §0) and the Generic Local LLM's documented sample latency (64ms)
is two orders of magnitude below even a conservative timeout budget.
`vercel.json` sets `functions["api/admin.ts"].maxDuration: 60` (the
Hobby-plan ceiling) as headroom; a genuinely stuck inference fails closed
as `FAILED` (retryable by starting a new evaluation) rather than hanging
indefinitely or silently claiming success.

## Persistence schema

`call_center.automated_qa_evaluations` / `automated_qa_observations` —
structurally parallel to, but entirely separate from, `qa_reviews` /
`qa_findings` (brief §14: machine-generated observations must never
appear human-authored). Multiple evaluations of the same interaction are
allowed (reproducibility, brief §20); each keeps its own full provenance
(model id, prompt/contract/schema version, transcript snapshot/hash,
token usage, latency, request ids). Lifecycle:
`queued → running → completed | partial | failed`. A `partial` evaluation
means some but not all turns were covered (one or more windows failed
after exhausting retries) — it is never presented as `completed`.

## Ratio calculation reuse

`src/lib/automatedQaRatios.ts` reuses `computeQaRatios` from Human QA's
own `qaRatios.ts` unchanged — the only adapter work is mapping an
observation's `evaluationId` into the `reviewId` field `computeQaRatios`
already groups interaction-level parameters by. Same numerators,
denominators, exclusions (N_A, CANNOT_VERIFY for grounding), and
directionality as Human QA — no second, conflicting ratio formula.

## Inspector UI

`src/pages/AutomatedQaInspector.tsx` (`/qa-review/automated/:evaluationId`,
gated on `qa.automated.view`) — read-only: evaluation header (interaction,
channel, agent, status, model, timestamp, transcript version, coverage),
the 9-parameter measurement grid (numerator/denominator, "No eligible
population" where appropriate — never a fabricated 0%), a findings table
(click a row to highlight its primary/evidence turns), the full
conversation with primary/evidence-turn highlighting, and a collapsible
Technical Details section (request id(s), model id, prompt/contract/schema
version, token usage, latency — never any secret or raw API key).

## Authorization

Two new permissions, both deliberately separate from `qa.review` and
`qa.analytics.view` (brief §19 — do not auto-grant automated-result access
to every Human QA reviewer):

- `qa.automated.run` — initiate an evaluation.
- `qa.automated.view` — inspect evaluation results.

Both granted by default only to `administrator`/`supervisor` (NOT
`qa_reviewer`). Enforced server-side via the same `requirePermission` +
`isAgentIdInScope`/Agent Scope pattern every other QA resource in
`api/admin.ts` already uses — never a role-name comparison. An
out-of-scope `evaluationId`/`interactionId` lookup 404s (not 403),
matching the established convention of not revealing a resource's
existence outside its data scope.

## Evaluation provenance

Every evaluation row carries: `model_id`, `prompt_version`,
`contract_version`, `schema_version`, `request_ids` (one per window),
`transcript_snapshot` + `transcript_hash`, `evaluated_turn_ids` /
`uncovered_turn_ids`, `unassessable_parameters`, `evaluation_completeness`,
`window_count`, `token_usage`, `latency_ms`. A completed/partial
evaluation is immutable once persisted (no update path exists beyond the
atomic `call_center_automated_qa_complete` write at completion time);
starting a new evaluation of the same interaction never overwrites a prior
one — all history is retained and listable.

## Error handling

Every Generic Local LLM error code from the documented spec
(`invalid_request_body`, `unauthorized`, `invalid_request`,
`invalid_json_schema`, `unsupported_model`, `context_length_exceeded`,
`output_truncated`, `rate_limited`, `llm_unavailable`,
`invalid_model_output`, `inference_timeout`) is classified as retryable or
permanent (`isRetryableLlmError`). An LLM service outage
(`llm_unavailable`) surfaces as an evaluation `FAILED` with that exact
error code/message — never silently recorded as a conversation-quality
finding.

## Known limitations

- Cross-window repetition/loop detection is limited to within a single
  window (documented above); very long interactions needing several
  windows will under-detect loops spanning a window boundary.
- Synchronous, single-evaluation-at-a-time execution is appropriate at
  this project's development/integration-test scale but would not scale
  to a high-volume production evaluation backlog without revisiting the
  job-orchestration decision (a genuine future scope change, not an
  oversight).
- `upstream_sid` is persisted as `null` today — the Voice/Chat APIs' own
  session id already serves as `interaction_id`; a distinct upstream SID
  field is reserved for a future API that distinguishes them.
- No Tool/RAG/source evidence input exists yet (the Interaction API the
  brief anticipates is still in development) — `response_grounding_rate`
  currently relies entirely on the LLM's own judgment plus `CANNOT_VERIFY`
  when it cannot establish grounding; an evidence-input boundary can be
  added additively once that API ships, without touching the schema's
  other fields.

## Future integration points (not built this session)

- **Interaction API / Tool-RAG evidence**: `automatedQaPrompt.ts` has no
  evidence-input parameter today; adding one is additive.
- **Session 16.4 (Human vs. Automated comparison)**: both measurement
  sources now share the identical parameter vocabulary, turn-identity
  scheme, and ratio engine (`computeQaRatios`), which is exactly the
  common ground a comparison view will need — deliberately not built or
  even sketched in this session, per the explicit stop condition.
