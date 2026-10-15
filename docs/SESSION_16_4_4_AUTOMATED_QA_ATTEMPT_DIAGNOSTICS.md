# Session 16.4.4 — Automated QA Attempt Diagnostics

Mode: implementation + deterministic verification, followed by a
controlled, approved activation. No live LLM/QA re-run was triggered at
any point in this session.

**Activation status (update, same session):** following a dedicated
migration/security review (which found and fixed two real issues — an
inaccurate `inserted` row count in `call_center_automated_qa_attempts_record`,
and a missing DB-side length backstop on `raw_response`), the migration
in §9 was reviewed, corrected, and **applied** to the production Supabase
project with explicit approval. Confirmed post-apply: the table, its 2
foreign keys, RLS, and all 3 RPCs (`service_role`-only, matching the
exact grant pattern of every pre-existing Automated QA RPC) exist
exactly as designed; the 7 pre-existing Automated QA RPCs and all
existing evaluation/observation data (21 evaluations, 61 observations)
are untouched. **Retention policy: 90 days is the adopted target**
(§8/§12) — `call_center_automated_qa_attempts_prune` exists and is
callable manually, but automatic/scheduled pruning is deliberately
**not implemented or activated** in this session; enforcement remains a
pending, separate decision.

## 1. Existing implementation reviewed

- `docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md` — the read-only
  investigation that motivated this session. Its concrete findings (§7):
  raw LLM responses are never persisted/logged; a retried window logged
  the *same* `request_id` twice, making retries structurally
  indistinguishable from stored data; the Inspector's left column goes
  fully blank on a failed evaluation with no in-region explanation.
- `src/server/qa/automatedQaEvaluator.ts` — the orchestrator: per-window
  retry loop, cross-array contradiction detection, placeholder-reason
  detection, turn-id aliasing, output-token-budget escalation.
- `src/server/qa/genericLlmClient.ts` — dumb I/O wrapper around the
  Generic Local LLM API; previously discarded the response body text
  immediately after `JSON.parse`.
- `src/lib/automatedQaValidation.ts` — per-entry observation validation,
  cross-array contradiction detection, placeholder-reason detection. All
  three already correctly scoped (confirmed again this session); none
  were touched.
- `api/admin.ts`'s `handleAutomatedQaPost` — persists the evaluation's
  terminal state via `call_center_automated_qa_complete` /
  `..._fail`; this is where the new attempt-diagnostics write is added,
  wrapped so it can never affect the evaluation's own outcome.
- `supabase/migrations/20261019000000_automated_qa_evaluation.sql` and
  `20261020000000_automated_qa_fail_persists_diagnostics.sql` — the
  existing persistence/authorization/diagnostic conventions this session
  follows exactly (uuid PK, timestamptz audit columns, snake_case, deny-
  all RLS, `security definer` RPCs under `public.call_center_*`, grant
  execute to `service_role` only).

No change was made to the nine QA parameter definitions, applicability
rules, evaluation prompt, retry correction prompt wording, scoring
calculations, evaluation response contract, model selection, Generic LLM
API contract, QA calibration, Human QA workflows, Call Data/Interaction
Trace integrations, or the Automated-QA/Human-QA independence boundary.

## 2. Attempt identity design

Every LLM call attempt (the initial call and every retry, in every
window) now produces one `QaAttemptDiagnostic`
(`src/lib/automatedQaAttemptDiagnostics.ts`):

- `attemptId` — a fresh `crypto.randomUUID()` per attempt.
- `windowIndex` — the window's own index (unchanged from the existing
  per-window planning).
- `attemptNumber` — 1-based, restarts at 1 for each window.
- `requestId` — `` `${windowBaseId}-a${attemptNumber}` ``. **This is a
  real fix, not just new plumbing**: previously (evaluator.ts, old line
  106) one `requestId` was generated once per *window* and reused
  unchanged across every retry attempt within it — the exact defect
  `AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md` §2.2 found (a
  retried evaluation's stored `request_ids` held the identical string
  twice). Every attempt now gets its own distinct id, and the existing
  `requestIds` array on `EvaluateInteractionResult` is unchanged in
  shape, only in content (distinct values instead of duplicates).
- `previousAttemptId` — links a retry to the attempt it replaced; `null`
  for a window's first attempt.

An evaluation with one initial request and one retry produces exactly
two `QaAttemptDiagnostic` records, linked by `previousAttemptId`,
verified in test #2/#3 of
`.tooling/scripts/automated-qa-attempt-diagnostics-verify.mjs`.

No historical evaluation row, and no historical `request_ids` value, is
rewritten — this only changes what *new* evaluations produce.

## 3. Diagnostic storage design

New table `call_center.automated_qa_evaluation_attempts`
(`supabase/migrations/20261021000000_automated_qa_attempt_diagnostics.sql`,
**not applied** — see §9). Deliberately a separate table linked by
`evaluation_id` (not embedded in `automated_qa_evaluations`), per brief
§6 ("avoid embedding unbounded raw responses into the main evaluation
record") — so a diagnostics-heavy evaluation never bloats the row the
Inspector/API reads on every normal request.

- Deny-all RLS (no policies) — identical to every other QA table.
- Every RPC is `security definer`, granted to `service_role` only,
  revoked from `public`/`anon`/`authenticated` — identical to every
  other QA RPC.
- `call_center_automated_qa_attempts_record(p_evaluation_id, p_attempts, p_now)`
  — one call per evaluation run, batch-inserts every attempt in one
  transaction. `on conflict (evaluation_id, window_index, attempt_number) do nothing`
  makes a duplicate persistence call for the same evaluation a safe no-op.
- `call_center_automated_qa_attempts_list(p_evaluation_id)` — full-row
  read, including `raw_response`. **Not called from `api/admin.ts`'s
  HTTP surface anywhere** — see §8.
- `call_center_automated_qa_attempts_prune(p_older_than)` — bounded
  retention (brief §6), prepared but not scheduled (see §8/§9).

## 4. Raw-response fidelity

`genericLlmClient.ts`'s `LlmResponse` gained one field, `rawResponseText`
— the exact response body `text()`, captured **before** `JSON.parse`,
on every return path:

| Path | `rawResponseText` |
|---|---|
| `fetch` throws (`network_error`) | `null` — no body was ever received |
| Non-JSON body (`invalid_model_output`) | the raw text, verbatim |
| Non-2xx with no documented `error_code` (`http_error`) | the raw text, verbatim |
| Documented success/failure response | the raw text, verbatim |

Nothing is normalized, corrected, or re-serialized — malformed JSON,
missing fields, duplicate entries, and unexpected fields all survive
exactly as the model/API sent them (verified by test #5's literal
`'not actually json {{{'` fixture).

Bounded storage: `boundRawResponse()` caps stored text at 60,000
characters (comfortably above the evaluator's own
`MAX_OUTPUT_TOKENS_CAP` of 6,144 tokens — a real response is never
truncated in practice), appending a `[truncated, N more characters
omitted]` marker rather than silently dropping the tail.

Security (brief §3): raw text is stored **only** in this server-side
table, written **only** by the service-role-gated RPC, from
`api/admin.ts`'s server-only request handler. It is never returned in
any HTTP response, never logged to `console` with its real content (the
one `console.error` call in `persistAttemptDiagnosticsSafely` logs only
the evaluation id and the *write failure's own* message — a DB/
constraint error, never the attempt's `raw_response`), and never placed
in `localStorage`/any browser API.

## 5. Versioning and correlation

`prompt_version`/`contract_version`/`schema_version` are **evaluation-
level**, not attempt-level — they were already pinned once per
evaluation (`automated_qa_evaluations.prompt_version` etc.,
`api/admin.ts`'s existing `PROMPT_VERSION`/`AUTOMATED_QA_CONTRACT_VERSION`/
`AUTOMATED_QA_SCHEMA_VERSION` constants). An attempt's own identity
(`attemptId`/`windowIndex`/`attemptNumber`/`requestId`) plus its parent
`evaluation_id` is sufficient to resolve which prompt/contract/schema
version governed it — no duplication of those three fields onto every
attempt row.

## 6. Validation error mapping

Each attempt records a coarse `outcome` plus, for the two application-
level semantic defects, a structured `validationDetail`:

- `success` | `transport_failure` | `parse_failure` | `llm_error` |
  `contradictory_applicability` | `uninformative_unassessability`.
- `transport_failure` ← `network_error`/`http_error` (never reached the
  LLM's own contract).
- `parse_failure` ← `invalid_model_output` (non-JSON body).
- `llm_error` ← every other documented `LLM_ERROR_CODES` value
  (`rate_limited`, `output_truncated`, `context_length_exceeded`, etc.)
  — the Generic Local LLM API's own contract rejected the request.
- `contradictory_applicability` — `validationDetail.contradiction` names
  the exact conflicting parameter codes plus their **raw** (pre-
  validation) occurrence counts in the model's own `observations` and
  `unassessable_parameters` arrays separately, and
  `detectedAt: 'cross_array_contradiction'` (the exact detector,
  `detectCrossArrayContradiction`, that found it).
- `uninformative_unassessability` — `validationDetail.placeholder` names
  the exact parameter codes and `detectedAt: 'placeholder_unassessability'`.
- `validationDetail.rejectedObservations` — every individually-rejected
  raw observation entry's reason (bad turn id, unknown parameter,
  duplicate opportunity, missing reason code), preserved **even on a
  successful attempt** where some entries were rejected but others
  accepted. This is new visibility only — enforcement is byte-for-byte
  unchanged: a rejected entry is still dropped from the real
  `observations`/`unassessableParameters` the evaluation persists
  (verified by test #8). Nothing here weakens validation, drops a
  conflicting entry silently, or invents a new evaluation outcome beyond
  the vocabulary `automatedQaEvaluator.ts` already produced
  (`errorCode`s `contradictory_applicability`/`uninformative_unassessability`
  are the exact existing codes, reused as-is for the `outcome` enum).

## 7. Retry attribution

Every retry attempt carries:

- `previousAttemptId` — the attempt it replaced.
- `retryReason` — the previous attempt's own error/defect code
  (`contradictory_applicability`, `uninformative_unassessability`,
  `output_truncated`, or a transient LLM error code).
- `correctionInstructionId` — which correction was applied:
  `consistency_retry_v1` (cross-array contradiction),
  `placeholder_retry_v1` (placeholder-reason correction),
  `output_truncated_budget_escalation` (the deterministic max-token
  escalation, not a prompt correction), or `transient_backoff_retry`
  (rate-limited/unavailable/timeout backoff, no prompt change).
- `attemptNumber`, `requestId`, and the retry's own `rawResponseText` and
  validation result, same shape as any other attempt.

None of retry eligibility, retry count (`MAX_RETRIES_PER_WINDOW = 2`,
unchanged), correction prompt wording, or evaluation prompt wording was
changed — this session only observes existing retry behavior.

## 8. Security and retention

- The raw-response-bearing table is reachable **only** through
  `security definer` RPCs granted to `service_role` — the same deny-all-
  RLS tier every other QA table already uses, which is also the most
  privileged tier this application's architecture has (direct Supabase
  project access).
- **No new HTTP endpoint was added to expose raw responses** (brief §8
  — "do not create a new public API merely to expose raw LLM
  responses"). `call_center_automated_qa_attempts_list` exists for
  server-side retrieval only; `api/admin.ts` never calls it.
- **Controlled retrieval procedure** (brief §8, since no existing admin
  diagnostic UI exists to reuse safely): an authorized engineer with the
  project's `service_role` key runs
  `select * from call_center.automated_qa_evaluation_attempts where evaluation_id = '<id>' order by window_index, attempt_number;`
  directly in the Supabase SQL editor (or any `service_role`-keyed
  script), or calls `call_center_automated_qa_attempts_list(p_evaluation_id)`
  the same way. This is a deliberately narrow, manual, logged-by-
  Supabase-itself procedure — not a new always-on surface.
- Retention: `call_center_automated_qa_attempts_prune(p_older_than)` is
  prepared but **not scheduled** this session (no cron wiring added —
  out of this session's guardrails). An administrator with
  `service_role` access can invoke it manually; wiring it to the
  existing daily-cron convention (`vercel.json`) is a future, separate
  decision.
- A diagnostic-storage write failure never turns a valid evaluation into
  a failure: `persistAttemptDiagnosticsSafely` (pure, dependency-
  injected) catches both a rejected write and a resolved `{error}`, logs
  only the evaluation id and the write failure's own message (never the
  attempt's raw content), and always resolves `{ok:false, ...}` rather
  than throwing — `api/admin.ts` awaits it with no surrounding
  try/catch, after the evaluation's own terminal-state RPC call has
  already succeeded and already been used to build the HTTP response.
  Verified deterministically in test #11 (write throws, write resolves
  with an error, write succeeds, empty-attempts no-op — all four
  resolve safely).

## 9. Database migration requirements

`supabase/migrations/20261021000000_automated_qa_attempt_diagnostics.sql`
was reviewed, corrected (see §14 — the `inserted` row-count bug and the
`raw_response` length backstop), and **applied** to the production
Supabase project (`dtbaczafdzgctkbqviod`) with explicit approval.
Post-apply verification confirmed: the table, its 2 foreign keys
(`evaluation_id → automated_qa_evaluations`, self-referential
`previous_attempt_id`), RLS enabled with no policies, and all 3 RPCs
exist; grants are `service_role`-only (identical pattern to every
pre-existing Automated QA RPC); the 7 pre-existing Automated QA RPCs and
all existing evaluation/observation rows (21 evaluations, 61
observations at the time of this check) are untouched.
`call_center_automated_qa_attempts_record` is now live —
`persistAutomatedQaAttempts()` in `api/admin.ts` will write real
diagnostics on the next Automated QA run, once that application code is
also deployed.

## 10. Inspector failed-state correction

`src/pages/AutomatedQaInspector.tsx`'s left column (Quality Measurements
+ Findings) now renders an explicit message —
`"Evaluation failed before producing quality measurements or findings."`
— when `status === 'failed'` and there are zero observations, instead of
the two gated blocks both silently rendering nothing
(`AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md` §4's documented gap).
Uses `typography.bodyMuted` and the existing `border-border`/`bg-card`
container convention (matching `SectionCard`) — no new hardcoded
colors/sizes, per `.claude/rules/ui-centralization.md`. The existing
error-code/message banner above the two-column grid, the existing
coverage values, the existing transcript panel, and the existing
evaluation history are all unchanged. `AutomatedQaInlinePanel.tsx`
(Call Logs' inline Automated QA tab) already shows `AutomatedQaFailedBanner`
for a failed evaluation and was not changed — it never had the blank-
region gap since it renders nothing else in that state (no separate
Quality-Measurements/Findings gate below the banner).

## 11. Automated verification results

```
npm run typecheck     -> clean
npm run verify:full   -> all suites 0 failed (expected negative-test
                          assertion line, same as every prior session,
                          is not a real failure)
```

New suite `.tooling/scripts/automated-qa-attempt-diagnostics-verify.mjs`
(52 assertions, wired into `verify:full`), covering exactly the brief
§9 checklist: single successful attempt; validation failure → successful
retry; validation failure → failed retry; transport failure; malformed
JSON; distinct attempt ids; distinct request ids; correct window
association across a multi-window evaluation; raw-response fidelity
(verbatim malformed body, null-on-transport-failure); structured
validation-error preservation (contradiction occurrence counts,
placeholder codes, individually-rejected entries); diagnostic-storage
failure resilience (throw / resolved-error / success / no-op, all four
deterministic); no-customer-data-leakage is enforced structurally (raw
text lives only in the new `attempts` field, never mixed into
`errorMessage`/other business fields — the existing evaluator test
suite's 52 assertions on `status`/`observations`/`errorCode`/etc. all
still pass unchanged, confirming existing evaluation persistence is
unaffected). All fixtures are deterministic (stubbed `global.fetch`,
same pattern as the pre-existing `automated-qa-evaluator-verify.mjs`) —
no live customer call or live LLM call was required.

## 12. Remaining limitations

- Attempt diagnostics will not actually persist until the application
  code in this session is also deployed (the migration alone is live,
  §9, but the write path lives in `api/admin.ts`).
- `prompt_version`/`contract_version`/`schema_version` are resolved via
  the parent evaluation row, not duplicated per attempt (§5) — a future
  session could denormalize them onto the attempt row if cross-
  evaluation attempt analytics ever need it without a join; not needed
  for this session's diagnosis use case.
- No diagnostic UI was built (by design, per brief §8) — retrieval is a
  manual, `service_role`-gated procedure. If diagnosing failures becomes
  a frequent task, a future session could add a narrow, permission-
  gated read surface; that is a new scope decision, not assumed here.
- **Retention: 90 days is the adopted target policy, not yet enforced.**
  `call_center_automated_qa_attempts_prune(p_older_than)` exists (live in
  the database as of §9) and can be invoked manually by an administrator
  with `service_role` access, but no automatic/scheduled pruning has
  been implemented or activated in this session, per explicit
  instruction. A future session would wire a `?action=prune` branch
  into the existing `/api/admin` `resource=automatedQa` dispatcher (no
  new serverless function, same Vercel Cron + bearer-secret convention
  `Action Required`'s `action=generate` already uses) calling this RPC
  with `now() - interval '90 days'`. Until that is built and approved,
  the table grows unbounded and enforcement remains a pending decision.
- This session did not re-run the specific historical failed evaluation
  from the investigation doc (`9db7c32f-...`) — its raw responses were
  never captured (that evaluation predates this session's capture
  mechanism), so per the brief's explicit instruction, that historical
  failure's raw output **cannot be reconstructed** and is not claimed to
  be.

## 13. Procedure for diagnosing the next failure

Once the migration (§9) is applied and a new evaluation fails with
`contradictory_applicability` or any other outcome:

1. Note the evaluation's `id` from the Inspector URL or
   `automated_qa_evaluations.id`.
2. As an authorized engineer with the project's `service_role` key, run:
   ```sql
   select window_index, attempt_number, outcome, error_code, error_message,
          retry_reason, correction_instruction_id, previous_attempt_id,
          validation_detail, raw_response
     from call_center.automated_qa_evaluation_attempts
    where evaluation_id = '<id>'
    order by window_index, attempt_number;
   ```
3. Compare attempt 1 vs. attempt 2 (if a retry occurred) side by side:
   raw response text, the structured `validation_detail`, and the
   `outcome`. This directly answers
   `AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md`'s open question —
   whether a recurring contradiction is a genuine model defect
   (identical/similar contradictory shape on both attempts) or a
   parsing/validation interaction (the retry's raw text shows the model
   actually tried to comply but in a shape validation rejected for an
   unrelated reason) — for every evaluation captured **going forward**.
4. Do not initiate a live QA re-run to manufacture a fresh failure for
   investigation purposes without explicit authorization (brief §10) —
   wait for or request a real failure, or use the existing deterministic
   test fixtures (§11) to reason about mechanism, not outcome-specific
   diagnosis.

## 14. Production-readiness assessment

**Database layer is now production-active** — the migration (§9) has
been applied. Two real issues were found and fixed during the dedicated
migration/security review before approval, both confirmed present in
the final applied SQL:

1. `call_center_automated_qa_attempts_record`'s returned `inserted`
   count was wrong — it incremented unconditionally per loop iteration
   instead of checking whether the `INSERT ... ON CONFLICT DO NOTHING`
   actually wrote a row. Fixed with `get diagnostics v_rows = row_count`
   immediately after each insert, summed only over real insertions. The
   underlying idempotency guarantee itself (no duplicate row ever
   created) was already correct — only the diagnostic count was wrong.
2. `raw_response` had no database-side size limit, relying solely on
   the application's `boundRawResponse()` (60,000 chars). Added
   `check (raw_response is null or length(raw_response) <= 100000)` as
   a defense-in-depth backstop.

Remaining assessment:

- The write path is provably non-blocking (§8/§11) — safe to enable
  without a feature flag or staged rollout.
- No change to evaluation scoring, applicability, prompts, retry
  policy, or the public Automated QA/Generic LLM API contract — safe to
  deploy independently of any other in-flight QA work.
- The one behavior change a live evaluation will exhibit once the
  application code is also deployed is cosmetic/diagnostic only:
  `request_ids` on `automated_qa_evaluations` will contain genuinely
  distinct values for a retried window (previously duplicated) — this
  is additive information, not a contract change (the field's
  type/shape is unchanged).
- Security advisors were checked post-apply: the new table produces
  exactly the same "RLS enabled, no policies" informational note every
  other deny-all-RLS table in this schema already produces (confirmed
  against `action_items`, `audit_events`, `automated_qa_evaluations`,
  `automated_qa_observations`, etc.) — not a new or unique finding.
- Retention enforcement (90-day target, §12) remains pending — explicitly
  not activated this session.
- Recommended before relying on this in a real incident: deploy the
  already-verified application code (this session's `git diff`,
  separately reviewed/committed) and confirm with the next real
  Automated QA run that no
  `[automatedQa] attempt-diagnostics write failed/threw` log line
  appears.
