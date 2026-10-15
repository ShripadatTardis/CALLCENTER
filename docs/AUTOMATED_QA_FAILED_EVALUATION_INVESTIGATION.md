# Automated QA — Failed Evaluation Investigation

Mode: READ-ONLY diagnostic. No code, prompt, or data changes were made. No QA
re-run was triggered. This document reports findings only.

## 1. Reproduction

Target: Inspector URL
`https://callcenter-three-livid.vercel.app/qa-review/automated/9db7c32f-e29a-406c-8864-b4787dd08d6a`
(production, confirmed by the user's screenshot — header "Oct 14, 06:09 PM",
status `failed`, channel `Voice`, flow `inbound-banking-default`, "0/32 turns
(PARTIAL)", model `Qwen/Qwen2.5-7B-Instruc...`; red error banner; left
workspace blank; right Conversation panel renders a real transcript).

Queried the live record directly from Supabase
(`call_center.automated_qa_evaluations`, `id = 9db7c32f-e29a-406c-8864-b4787dd08d6a`)
rather than driving the browser, since the question is answerable from stored
data and source code. Key stored fields:

```
interaction_id: a1cfba0f-93c8-4c6b-aaed-54eda474248c
channel: voice
agent_id: inbound-banking-default
status: failed
model_id: Qwen/Qwen2.5-7B-Instruct-AWQ
prompt_version: v2   contract_version: v1   schema_version: v1
request_ids: ["qa-3mj4s45gy1w-0", "qa-3mj4s45gy1w-0"]   (duplicate — see §2.3)
evaluated_turn_ids: []
uncovered_turn_ids: [... all 32 turn ids ...]
unassessable_parameters: []
evaluation_completeness: PARTIAL
window_count: 1
error_code: contradictory_applicability
error_message: "The model classified the same parameter(s) as both assessed
  and unassessable in one response: context_continuity_rate,
  followup_understanding_rate, reference_resolution_accuracy,
  unnecessary_clarification_rate, repetition_loop_rate,
  customer_correction_rate, conversation_recovery_rate."
```

This matches the screenshot's banner text verbatim. `call_center.automated_qa_observations`
for this `evaluation_id` returns **zero rows** — confirmed by direct query, not
inferred.

## 2. Root cause with evidence

### 2.1 Trace of the evaluation

- Interaction ID: `a1cfba0f-93c8-4c6b-aaed-54eda474248c` (a real backend voice
  `call_sid` — confirmed NOT a Supabase `customer_interactions` row; `select
  count(*) from call_center.customer_interactions where id::text = '...'`
  returns 0, consistent with this codebase's known architecture that voice
  calls live only in the external Voice API).
- Evaluation/run ID: `9db7c32f-e29a-406c-8864-b4787dd08d6a` (the
  `automated_qa_evaluations.id` primary key).
- Model: `Qwen/Qwen2.5-7B-Instruct-AWQ`. Prompt version `v2` (the current
  version — `src/lib/automatedQaPrompt.ts`'s `PROMPT_VERSION`, bumped from v1
  in Session 16.3.8 to strengthen N/A-vs-CANNOT_VERIFY guidance).
- Stored evaluation response: the two persisted arrays
  (`evaluated_turn_ids: []`, `unassessable_parameters: []`) plus
  `error_code`/`error_message`. **Raw LLM output is NOT available** — neither
  persisted to the database nor logged anywhere in
  `src/server/qa/automatedQaEvaluator.ts` or `genericLlmClient.ts` (grepped
  both files for `console.`/`log(` — zero matches). This is a real,
  consequential gap: it makes it structurally impossible to answer, from
  stored evidence alone, exactly which parameter codes appeared in which of
  the model's two response arrays, or whether the retry's response differed
  from the first attempt. See §7 recommendation.
- Validation failure detail: `contradictory_applicability` — the response's
  `observations` and `unassessable_parameters` arrays both contained an entry
  for the same 7 parameter codes (see §3).
- Persisted failure state: `status = 'failed'`, `evaluated_turn_ids = []`,
  `uncovered_turn_ids` = all 32 turn ids, `observations` table rows = 0. This
  is the intended fail-closed persistence contract added in
  `supabase/migrations/20261020000000_automated_qa_fail_persists_diagnostics.sql`
  (a prior, already-shipped fix — its own header comment documents fixing an
  earlier version of this exact defect class, where a failed evaluation used
  to drop `model_id`/turn-coverage/etc. entirely). Nothing here indicates a
  regression of that fix — all diagnostic fields ARE populated correctly.

No API keys, raw customer PII beyond what's already in the UI transcript, or
other sensitive values are reproduced in this document.

### 2.2 Why `contradictory_applicability` fired — LLM vs application responsibility

Source: `src/server/qa/automatedQaEvaluator.ts` lines 126–156,
`src/lib/automatedQaValidation.ts`'s `detectCrossArrayContradiction()` (lines
164–174).

The contract (`src/lib/automatedQaPrompt.ts`'s system prompt, lines 33–51) is
explicit and correctly worded: the model must assess each applicable
parameter OR add it to `unassessable_parameters` — **never both**. The
validator (`detectCrossArrayContradiction`) is a straightforward set
intersection: it takes the parameter codes present in `validation.accepted`
(the already-schema/turn-id-validated `observations`) and the codes present
in `unassessable_parameters`, and flags any code appearing in both. This is
correctly scoped and does not weaken or second-guess which side is "right" —
by design (comment at lines 131–138) it never silently drops one array's
entry, since doing so could fabricate a misleading 100%-PASS measurement for
a parameter the model itself said had no real opportunity.

On conflict, the orchestrator retries **exactly once** per window
(`contradictionRetried` boolean gate, not the general `MAX_RETRIES_PER_WINDOW
= 2` counter — the retry budget for *this specific defect* is 1, not 2),
sending `buildConsistencyRetryInstruction()` (prompt.ts lines 72–81), which
names the exact 7 conflicting parameters and instructs the model to
re-decide ONLY those, leaving every other parameter's assessment untouched.

The persisted `request_ids` array has **two identical values**
(`"qa-3mj4s45gy1w-0"` twice) rather than two distinct ids. This is explained
by the code: `requestId` is generated once, **outside** the per-window
`while` loop (evaluator.ts line 106), then pushed to `requestIds` inside the
loop on every attempt (line 120) — so a retried window always logs the same
id twice. This is itself a minor diagnosability defect (see §7) — it means
even the one externally-visible identifier that distinguishes "first attempt"
from "retry attempt" is not actually distinguishing, which compounds the raw-
output gap in §2.1: there is no way, from `request_ids` alone, to tell that a
retry happened at all, let alone inspect it separately.

**Determination: cannot be conclusively attributed to either a model-output
defect or an application-validation defect from available evidence, and this
is itself the primary finding.** Two explanations are consistent with the
stored data and both remain open:

- **(a) Model defect, persisting across the retry.** The 7B model produced
  the same contradictory shape on the retry attempt despite the targeted
  correction (plausible: a 7B instruction-following model given a 9-
  parameter structured-output task is exactly the class of model the
  original `output_truncated` tuning history (evaluator.ts's own comments at
  lines 25–31) shows already strains under this contract's volume).
- **(b) A validator/parsing interaction, not a true model contradiction.**
  E.g. if the model's retried response changed shape in a way that satisfies
  the instruction's *intent* (one collection per parameter) but not its
  literal JSON structure (for example, nesting corrections, or emitting a
  near-duplicate key) such that `validateAutomatedObservations`'s per-entry
  parsing (automatedQaValidation.ts lines 63–76) accepted entries it
  shouldn't have, or the model emitted genuinely duplicate `unassessable_parameters`
  entries for the same code that collided with surviving valid `observations`.

Both are falsifiable with the raw response text, which this investigation
does not have access to. **No validation logic was found to be incorrect** —
`detectCrossArrayContradiction` does exactly what its contract requires, and
nothing in the retry-instruction wording (§2.2's citation) appears
ambiguous on a careful read. The investigation did not find evidence of an
application bug; the open question is specifically about model behavior,
which cannot be settled without raw output.

### 2.3 What makes the 7 contradicted parameters notable (observation, not a conclusion)

The 7 conflicting codes are `context_continuity_rate`, `followup_understanding_rate`,
`reference_resolution_accuracy`, `unnecessary_clarification_rate`,
`repetition_loop_rate`, `customer_correction_rate`, `conversation_recovery_rate`
— **7 of the 9 total parameters** (`src/lib/qaParameters.ts`). The two NOT
contradicted are `task_progression_rate` and `response_grounding_rate`.

A structural difference exists between the contradicted and non-contradicted
sets, though this investigation can only report it as a correlation, not a
proven cause (no raw output to confirm the mechanism):

- `task_progression_rate` has no conditional applicability rule at all —
  `src/lib/qaApplicability.ts`'s own comment states it is "eligible on every
  agent turn by definition." It is the one parameter with no judgment call
  about *whether* to assess it, only *how*.
- `response_grounding_rate` is the one parameter whose prompt instructions
  (automatedQaPrompt.ts lines 37, 44) give the model a **third** value
  (`CANNOT_VERIFY`) specifically so it is never forced into the
  binary "applicable vs. not" decision that produces the two-array
  structure in the first place — a grounding claim it can't check still gets
  a same-side answer (CANNOT_VERIFY, not `unassessable_parameters`).
- The 7 contradicted parameters are exactly the ones requiring a genuine,
  conversation-specific applicability judgment (does a follow-up exist? did a
  reference need resolving? was there an unnecessary clarification? etc.) —
  the harder category this feature was built to let the model reason about
  per `qaApplicability.ts`'s Tier-1/Tier-2 split and the prompt's own framing.

This is consistent with — but does not prove — a genuine small-model
reasoning failure under a 9-parameter, 2-array structured-output contract,
rather than an application-side defect specific to these 7 codes (there is no
special-casing of these 7 anywhere in the validator or schema; they are
treated identically to the other 2 in all application code reviewed).

## 3. Explanation of "0/32 PARTIAL"

Source: `src/pages/AutomatedQaInspector.tsx` line 278,
`src/server/qa/automatedQaEvaluator.ts` lines 230–241.

`0/32` is `evaluation.evaluatedTurnIds.length / (evaluatedTurnIds.length +
uncoveredTurnIds.length)` — **not** a count of "eligible" or "in-scope" turns,
but the sum of turns the evaluator actually finished evaluating plus turns it
gave up on. For this evaluation: `evaluatedTurnIds = []` (the single window
never reached the success path — evaluator.ts only pushes to
`evaluatedTurnIds` at line 186, inside the success branch that this window's
persistent contradiction never reached; it `break`s at line 155 instead), and
`uncoveredTurnIds` = all 32 real turn ids (pushed at line 212 because
`!succeeded`). The transcript genuinely has 32 turns (16 customer + 16 agent,
confirmed by counting `transcript_snapshot` — matches).

`evaluationCompleteness` is `'PARTIAL'` because `allTurnsCovered` requires
`evaluatedTurnIds.length > 0 AND uncoveredTurnIds.length === 0`
(evaluator.ts line 230) — with 0 evaluated turns this can never be `true`
regardless of failure mode, so `PARTIAL` is the only value a fully failed
evaluation can ever show (never `COMPLETE`).

**Determination: the displayed "0/32 PARTIAL" is accurate, not misleading.**
It correctly states that the single evaluation window covering all 32 turns
failed outright and zero turns were successfully evaluated. It is arguably
*terse* for a genuinely 100%-failed window (a user could momentarily read it
as "some turns evaluated, some not," when the real meaning is "the entire
evaluation failed") — see §7's UI recommendation — but the underlying numbers
are correct.

## 4. Explanation of the blank left panel

Source: `src/pages/AutomatedQaInspector.tsx` lines 289–293, 302–371.

The page's layout has two independently-gated blocks inside the left column:

- **"Quality Measurements" cards** — gated by `evaluation.status !== 'failed'`
  (line 306). For this evaluation (`status: 'failed'`), this condition is
  `false`, so this entire block — including its heading — renders nothing.
- **"Findings" table** — gated by `observations.length > 0` (line 371).
  `observations` is populated from `evaluation?.observations` (line 123),
  which is empty for this evaluation (confirmed: 0 rows in
  `automated_qa_observations` for this `evaluation_id`). This block also
  renders nothing.

The red error banner (lines 289–293) is **above** this two-column grid, not
inside the left column — so once both left-column blocks suppress
themselves, the left column (`<div className="min-w-0 space-y-3">`, line
305) is left with zero rendered children: a genuinely empty `<div>`, exactly
matching the user's "completely blank" observation. This is not a crash, a
data-loading bug, or a stale/missing-data edge case the code failed to
anticipate — both conditionals are deliberate, explicit checks, and the
screen is not actually broken.

**Determination: this is a real UI presentation gap, not a functional bug.**
There is no empty-state/explanatory message inside the left column itself for
a failed evaluation with zero observations — a user looking at that specific
region has no in-region indication of *why* it's empty (the connection to the
error banner above it is implicit, not stated). The expected failed-
evaluation UI, by the apparent intent of the two gates, is "don't show
measurements/findings that don't exist" — which is correct — but it should be
replaced with an explicit "No measurements or findings were produced — this
evaluation failed before completing." placeholder rather than nothing at all.
See §7.

## 5. LLM vs application responsibility (summary)

| Component | Assessed | Verdict |
|---|---|---|
| System/retry prompt wording | `automatedQaPrompt.ts` | Clear, correctly scoped, not ambiguous on inspection |
| Cross-array contradiction detector | `automatedQaValidation.ts` | Correct; does exactly what its contract requires |
| Retry orchestration | `automatedQaEvaluator.ts` | Correct; 1 targeted retry, fails closed as designed |
| Turn-coverage/PARTIAL computation | `automatedQaEvaluator.ts` | Correct; `0/32 PARTIAL` accurately reflects total window failure |
| Failure persistence | `20261020000000_...sql` migration | Correct; all diagnostic fields populated (this was itself a prior fix) |
| Model's structured output | Unknown (not persisted/logged) | **Cannot be determined** — the open question |
| Inspector failed-state UI | `AutomatedQaInspector.tsx` | Presentation gap — no explanatory empty state (not a logic bug) |
| `request_ids` attempt tracking | `automatedQaEvaluator.ts` line 106 | Minor defect — identical id pushed per attempt, reduces diagnosability |

No weakening of validation is recommended or was performed. The validator is
doing its job (rejecting a genuinely contradictory response rather than
guessing); the gap is in **observability** (raw output never captured) and
**UI communication** (blank panel), not in the enforcement logic itself.

## 6. Data consistency findings (Interaction Detail vs. Automated QA Inspector)

- Only **one** `automated_qa_evaluations` row exists for this interaction
  (`interaction_id = a1cfba0f-93c8-4c6b-aaed-54eda474248c`) — confirmed by
  query (`order by started_at desc` returns exactly 1 row, this one). There
  is no newer/older evaluation that could cause a stale-vs-current mismatch.
- Both surfaces resolve the "current" evaluation through the **same** hook:
  `useAutomatedQaEvaluationsForInteraction(interactionId, channel)`, used
  identically by `AutomatedQaPanel.tsx` (inside `InteractionDetailDialog.tsx`,
  line 320) and by `AutomatedQaInspector.tsx` (line 96) for its own history
  list. `AutomatedQaPanel`'s "View" button (line 68) navigates to
  `/qa-review/automated/${latest.id}` — the exact same evaluation row id the
  Inspector page is keyed by, both the same `id` column, no parallel ID
  scheme.
- Channel is consistently `"voice"` in both places (hardcoded in
  `InteractionDetailDialog.tsx` line 320's `channel="voice"` prop, and
  `evaluations.channel = 'voice'` in the stored row).
- Same transcript source: the Inspector reads `evaluation.transcriptSnapshot`
  (line 120), the same `transcript_snapshot` jsonb column queried directly
  above, which matches the real voice-call turns (OTP verification, KYC
  lookup, balance/transaction questions — consistent with the screenshot's
  description).
- **Determination: no consistency defect found.** The architecture
  structurally prevents the two surfaces from diverging for this record —
  there is one evaluation row, one id, one hook, one navigation path.

## 7. Recommended minimal corrections (not implemented — investigation only)

1. **Persist (or at minimum log server-side) the raw model response text on
   a validation failure**, at least for `contradictory_applicability` and
   `uninformative_unassessability` — the two defects the retry-correction
   mechanism exists to handle. Without it, this exact investigation cannot be
   completed past "the validator is correct; the model's behavior on retry
   is unknown." Should redact/bound length and never store secrets — the
   response is structured QA output, not a secret, so this is a storage
   question, not a security one.
2. **Give each attempt within a window its own distinct `requestId`** (e.g.
   suffix the existing id with `-attempt0`/`-attempt1`) so `request_ids`
   becomes a real diagnostic trail instead of a duplicate value.
3. **Add an explicit empty-state message to the Inspector's left column**
   for `status === 'failed'` (e.g. "No measurements or findings — this
   evaluation failed before producing results.") instead of leaving the
   two-block region fully blank with no in-region explanation.
4. Optional, lower priority: consider whether `0/32 PARTIAL` should render
   a more explicit "Evaluation failed — no turns evaluated" framing when
   `status === 'failed'` specifically, distinct from a genuinely partial
   multi-window result where some turns did succeed — the current single
   `X/Y PARTIAL` format doesn't visually distinguish "100% failed" from
   "mostly succeeded, one window failed."

None of these were implemented, per the investigation's read-only mandate.

## 8. Regression tests required (once corrections are implemented)

- A failed single-window evaluation (as reproduced here) renders the new
  empty-state message in the Inspector's left column, and nothing else
  changes in rendering for `status !== 'failed'` cases.
- `request_ids` for a window that retries once contains 2 **distinct**
  values; a window that succeeds on the first attempt still contains exactly
  1 value (no regression to the non-retry path).
- If raw-response persistence/logging is added: confirm it is written only
  on a validation failure (never on a successful response, to avoid
  unnecessary data retention), is properly bounded/redacted, and that a
  deterministic test can assert its presence without needing a live LLM call
  (e.g. by injecting a fixture response through the existing test harness
  pattern already used by `src/server/qa/automatedQaEvaluator.ts`'s test
  suite, if one exists — not located/verified as part of this investigation).
- A multi-window evaluation where only one window fails still correctly
  shows a partial-but-nonzero `X/Y PARTIAL` (distinct from the all-zero case
  this investigation covers) if the §7.4 UI distinction is implemented.

## 9. Interaction Trace API relevance (assessment only — not integrated)

Per the brief, this is an assessment, not an integration — nothing from the
Interaction Trace API (Session 16.4.3, a separate, concurrently-run
integration in this same working tree, not yet committed) was wired into any
Automated QA code path as part of this investigation.

**What the Trace API would NOT help with**: it would not explain the
`contradictory_applicability` failure itself. That defect is about the
QA-evaluation LLM's own structured-output consistency on a *second*,
independent generic-LLM call (`callGenericLlm` in
`src/server/qa/genericLlmClient.ts`) — the Trace API instead records what the
*production banking voicebot* actually did during the call (tool calls, RAG
calls, routing/frame decisions, auth/escalation/feedback/guardrail events).
These are two unrelated systems; the Trace API has no visibility into the QA
evaluator's internal LLM call or its response.

**What it could plausibly help with, if ever wired in (not recommended here,
and expressly out of scope per the brief's hard guardrail against feeding
trace data into QA evaluation input without separate review)**:

- `frame_context.router_decision` / `slot_fill_status` per turn could give
  independent, backend-recorded evidence for *human* reviewers investigating
  whether a specific turn was a genuine repetition/loop
  (`repetition_loop_rate`) — this transcript's own content shows the agent
  asking "You have a savings account and a current account. Which one would
  you like?" twice in a row (turns at `08:20:48` and `08:20:55`), which is
  exactly the kind of real, human-visible repetition `repetition_loop_rate`
  exists to catch, and is independently corroborated by the raw transcript
  already in this evaluation's `transcript_snapshot` — the Trace API doesn't
  add new information for this specific instance, since the transcript
  already shows it, but could add router-level evidence of *why* the repeat
  happened for a human reviewer's own investigation.
- `tool_calls[]` (e.g. a KYC/balance lookup tool call per turn) could give a
  human reviewer independent corroboration for `response_grounding_rate`-type
  questions. Notably, `response_grounding_rate` was one of the 2 parameters
  that did NOT contradict in this failure — consistent with it being the one
  parameter concretely answerable from real recorded data (if/when tool-call
  evidence exists) rather than requiring the harder, more subjective
  applicability judgment the other 7 require.

**Current limitations**: the Trace API integration (per
`docs/SESSION_16_4_3_INTERACTION_TRACE_INTEGRATION.md`, written by a
concurrent, separate session) is explicitly read-only evidence display for
human investigation and was built with a hard guardrail (its own §7) that
nothing from it feeds Automated QA's evaluation prompt or scoring. Even once
integrated, it would not retroactively explain this specific already-failed
evaluation unless a human investigator cross-references it manually against
this interaction's turns — it is not, and should not become, an automatic
input to the QA evaluator itself.
