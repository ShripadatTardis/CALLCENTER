# Session 16.4.4.1 — Automated QA Diagnostics UI

## Objective

Expose the existing Session 16.4.4 LLM attempt diagnostics
(`call_center.automated_qa_evaluation_attempts`, read via the existing
`call_center_automated_qa_attempts_list` RPC) to authorized development/
support users inside Automated QA Inspector. Read-only. No change to
evaluation logic, prompts, scoring, applicability rules, validation
logic, or retry strategy.

## Baseline (confirmed against the live database before implementing)

- `call_center.automated_qa_evaluation_attempts` columns confirmed via
  `information_schema.columns`: `id, evaluation_id, window_index,
  attempt_number, request_id, model_id, outcome, error_code,
  error_message, raw_response, validation_detail, retry_reason,
  correction_instruction_id, previous_attempt_id,
  requested_max_output_tokens, prompt_tokens, completion_tokens,
  latency_ms, started_at, completed_at, created_at`.
- `call_center_automated_qa_attempts_list(p_evaluation_id)` confirmed
  live, granted to `service_role` only (no `anon`/`authenticated` grant
  — unchanged by this session).
- The 16.4.4 migration's own comment explicitly documented that this RPC
  was deliberately **not** wired into `api/admin.ts`'s HTTP surface at
  the time — "run via a locally-held service-role script ... not through
  the deployed application." This session's brief is an explicit,
  deliberate decision to now build that UI surface, with the access
  controls described below. Nothing about the RPC's own grants changed.

## Access control

New permission: **`automated_qa.diagnostics.view`**, added via
`supabase/migrations/20261023000000_automated_qa_diagnostics_permission.sql`
(prepared, **not applied** — see "Stop conditions honored" below).
Initial grant: **Administrator only**. Any future role grant happens
entirely through the existing Role Management UI (`role_permissions` is
already editable there) — no code change required for that.

Deliberately a **separate, narrower permission** from `qa.automated.view`
(brief §2): holding it is necessary but not sufficient. Every request
also re-checks that the caller is authorized to view the *underlying
evaluation* — the exact same `call_center_automated_qa_get` +
`isAgentIdInScope` check the existing `action=get` branch already uses.
A diagnostics-only grant can never be used to read an evaluation outside
the caller's own Business Data Scope; conversely, holding
`qa.automated.view` alone does **not** grant diagnostic access.

Enforced **server-side only** (`requirePermission` in `api/_auth.ts`,
unchanged) — the client-side `hasPermission` check in
`EvaluationDiagnosticsPanel.tsx` only controls whether the section
renders/fetches at all; it is UX, not the real gate.

Every successful diagnostic read is recorded via the existing
`recordAuditEvent` mechanism (`action: 'automated_qa.diagnostics.viewed'`,
`resourceType: 'automated_qa_evaluation'`, `resourceId: evaluationId`,
metadata `{ attemptCount }` — **never** the raw response text or any
attempt content itself).

## Server-side read API

One new branch on the **existing** `GET ?resource=automatedQa` dispatcher
in `api/admin.ts` (`action=diagnostics&evaluationId=...`) — no new Vercel
function, respecting the project's 12-function Hobby-plan ceiling.

Flow (exactly as specified):
```
Authenticated user
  -> requirePermission('automated_qa.diagnostics.view')   [401 / 403]
  -> call_center_automated_qa_get + isAgentIdInScope        [404 if out of scope]
  -> call_center_automated_qa_attempts_list (existing, service_role-only RPC)
  -> recordAuditEvent (ids/counts only)
  -> response, Cache-Control: no-store
```

Returns only the requested evaluation's own attempts (there is no
"list all diagnostics" variant). The service-role Supabase key is never
sent to the client — it's used server-side exactly like every other
`api/admin.ts` route already does. `Cache-Control: no-store` is set on
the response to prevent a shared/persistent cache (CDN, proxy) from
retaining a response that may carry raw LLM output derived from customer
conversation content.

## Client-side data flow

- `src/services/qa/automatedQaService.ts` — new `AutomatedQaAttemptDiagnostic`
  type + `fetchAutomatedQaDiagnostics(evaluationId)`.
- `src/hooks/qa/useAutomatedQa.ts` — new `useAutomatedQaDiagnostics(evaluationId, enabled)`,
  gated by the caller on both "a real evaluation id" and "the viewer
  holds the permission" so an unauthorized viewer never even issues the
  request (server-side `requirePermission` remains the real enforcement
  regardless).
- `src/lib/automatedQaDiagnosticsDisplay.ts` — pure, deterministically
  testable display/comparison helpers (outcome→badge-variant mapping,
  truncation-likelihood check, contradiction extraction, retry counting,
  attempt sort order). No network/DOM access, no logging.
- `src/components/qa/EvaluationDiagnosticsPanel.tsx` — the UI itself,
  gated on `hasPermission(user, 'automated_qa.diagnostics.view')` and
  returning `null` entirely for anyone without it.
- Wired into `src/pages/AutomatedQaInspector.tsx`, positioned below the
  re-run-error banner and above the existing two-column layout (so the
  existing layout is never disturbed), collapsed by default.

## UI

**EVALUATION DIAGNOSTICS** — a collapsible section, available for both
successful and failed evaluations, to authorized users only.

- **Summary**: Evaluation ID, Status, Model, Prompt/contract/schema
  versions, Coverage, LLM attempt count, Retry count, Final outcome.
- **Attempt list**: attempt number, window index, request ID, outcome
  (badge), error code, retry reason, correction instruction id. Rows are
  selectable (click or Enter/Space).
- **Selected attempt detail**:
  - **A. Raw LLM response** — exact text, in a read-only, scrollable,
    monospace `<pre>` block rendered as a React text child (never
    `dangerouslySetInnerHTML` — raw LLM output can never be interpreted
    as HTML). A Copy button is shown only because the whole panel is
    already gated on the diagnostics permission. A truncation note
    appears when the text is at or past the application-layer bound
    (60,000 chars, from Session 16.4.4's own `RAW_RESPONSE_MAX_CHARS`).
  - **B. Structured validation results** — the attempt's
    `validation_detail` pretty-printed JSON, same read-only viewer.
  - **C. Retry relationship/details** — retry reason, correction
    instruction id, and a "View previous attempt" link when
    `previousAttemptId` resolves to another attempt in the same list.
- **Contradictory-applicability comparison** (brief §5) — when 2+
  attempts carry a `validation_detail.contradiction` block, each is
  shown in its own card (parameter codes, observation/unassessable
  occurrence counts, detector stage) — reading only what was actually
  stored, never recomputed or invented.

Terminology is deliberately never bare "History" anywhere in this
component — the Inspector's own header already has an unrelated
"History (N)" dropdown for separate evaluation **runs**; this section
always says "LLM attempts"/"Evaluation Diagnostics" to avoid confusing
the two concepts (brief §6's explicit requirement).

## Empty/error states

- No diagnostics captured at all → explicit message distinguishing it
  from an error: "No attempt diagnostics are available for this
  evaluation — it may predate diagnostic capture (Session 16.4.4), or
  diagnostic persistence did not record for this run."
- Retrieval failure / permission denied (reachable only if the server
  rejects despite the client-side gate, e.g. a stale session) → "Could
  not retrieve diagnostics (permission denied or retrieval failed)."
- Single-attempt evaluation → list shows one row, Retries = 0, no
  comparison section (needs 2+ contradictory attempts).
- Transport failure with no raw response → a specific message
  distinguishing "failed before a response body was received" from the
  generic "no raw response recorded."

## Testing

New `.tooling/scripts/automated-qa-diagnostics-verify.mjs`, wired into
`npm run verify:full`. 30 assertions against the **real compiled**
pure logic (esbuild-bundled, same convention as every other
`*-verify.mjs` in this repo — `src/lib/automatedQaDiagnosticsDisplay.ts`,
`src/lib/automatedQaAttemptDiagnostics.ts`'s new
`toCamelAttemptDiagnosticRow`, and `api/_auth.ts`'s existing
`evaluatePermission`/`isAgentIdInScope` composed exactly as the real
route composes them):

- Authorized access (administrator, permission + in-scope agent → 200)
- Unauthorized rejection (unauthenticated → 401; authenticated but
  missing the diagnostics permission, even while holding
  `qa.automated.view` → 403)
- Business Data Scope isolation (diagnostics permission alone is not
  sufficient for an out-of-scope agent → 404; same caller, in-scope
  agent → 200; null/unresolved agent id fails closed)
- Outcome-vocabulary / badge-variant completeness (every value the
  database check constraint allows has a mapping)
- Raw response fidelity + truncation indication (threshold boundary
  cases; no transform function exists that could mutate raw text)
- Structured validation comparison (only attempts with a real stored
  contradiction are selected; occurrence counts read verbatim, never
  recomputed)
- Single vs. multiple attempts / retry counting (including across
  multiple windows)
- Correct attempt ordering (window_index, then attempt_number — matches
  the RPC's own `ORDER BY`)
- Missing diagnostic records (empty-array inputs never throw)
- Regression guard for the camelCase bug found during live verification
  (see below): ordinary columns are camelCased, `validation_detail`'s
  nested parameter-code keys are preserved byte-for-byte snake_case

`npm run typecheck` — clean (all 3 tsconfigs). `npm run verify:full` —
all green, 0 failures (the one `FAIL:` string in the output is the
pre-existing, expected negative-test for an unknown customer theme
configuration).

A static scan of every new/changed file confirmed **no** `console.*` call
anywhere touches attempt data (satisfying "do not expose raw responses in
application logs"), and **no** `localStorage`/`sessionStorage` reference
anywhere in the new service/hook/component files (satisfying "do not
persist raw responses in browser storage").

## Migration activation (explicitly authorized)

Following an explicit "Session 16.4.4.1 — Complete Activation" approval,
and after re-confirming scope (two additive inserts only — one
`call_center.permissions` row, one `call_center.role_permissions` grant —
no table/schema change) and target database (`dtbaczafdzgctkbqviod`, the
same production Supabase project used throughout this engagement, with
both rows confirmed absent beforehand), the migration was applied.
Verified immediately after: `automated_qa.diagnostics.view` exists in
`call_center.permissions` with exactly one grant, to `administrator`.

## Bug found and fixed during live verification

Live-testing the real `fcbc8d43-8cc7-4b5c-87a5-413619268ed8` evaluation
(2 attempts, both `contradictory_applicability`) surfaced a real defect:
the Contradictory-applicability comparison showed **"observations: 0 ·
unassessable_parameters: 0"** for both attempts, when the actual stored
data (confirmed by direct SQL earlier in this engagement) was 1 for
each.

**Root cause**: the `action === 'diagnostics'` handler converted every
attempt row with the generic, *recursive* `toCamelCaseDeep` helper.
`validation_detail` is semi-structured diagnostic JSON whose object
*keys* are sometimes real stored data — specifically, a QA parameter
code (e.g. `context_continuity_rate`) used as a key inside
`observationOccurrences`/`unassessableOccurrences` — not schema field
names. The recursive converter silently rewrote those keys to camelCase
(`context_continuity_rate` → `contextContinuityRate`), so every lookup
against the real stored parameter code returned `undefined`, displayed
as `0`.

**Fix**: added `toCamelAttemptDiagnosticRow()` to the existing
`src/lib/automatedQaAttemptDiagnostics.ts` (Session 16.4.4's own module)
— an explicit, one-level field rename for every ordinary column, with
`validation_detail` passed through **completely verbatim**, never
recursed into. `api/admin.ts`'s diagnostics branch now uses this instead
of the generic deep converter. A regression test was added to
`.tooling/scripts/automated-qa-diagnostics-verify.mjs` reproducing the
exact raw row shape and asserting the real snake_case parameter-code key
survives untouched while every ordinary column is still correctly
camelCased. Re-verified live after the fix: both attempts now correctly
show `observations: 1 · unassessable_parameters: 1`, matching the
ground-truth SQL investigation exactly.

This was a pure data-shaping bug in the new route — no evaluation
record, RPC, or any Session 16.4.4 code was touched.

## Browser verification (completed)

Authenticated as Administrator, live-loaded
`/qa-review/automated/fcbc8d43-8cc7-4b5c-87a5-413619268ed8` (the real,
previously-investigated failure — never re-run) on the local dev server
against the real production database. Confirmed, with screenshots at
each step:

- **EVALUATION DIAGNOSTICS** section renders (collapsed by default),
  labeled "(authorized diagnostic access only)".
- **Summary**: Evaluation ID, Status `failed`, Model
  `Qwen/Qwen2.5-7B-Instruct-AWQ`, Versions `v2 / v1 / v1`, Coverage
  `0/12 turns`, LLM attempts `2`, Retries `1`, Final outcome
  `contradictory_applicability` — all matching the real record.
- **Attempt list**: both real attempts (`qa-nngncy2yojm-0-a1`/`-a2`),
  correct outcome badges, error codes, retry reason, correction
  instruction id.
- **Both attempts inspected individually** (A/B/C all present):
  - Attempt 1 — real request id, timing, 1604/697 tokens, the exact
    2,695-character raw response (verbatim JSON, matching the earlier
    SQL dump), the exact structured validation JSON (pretty-printed,
    `observations: 1 · unassessable_parameters: 1` after the fix), Copy
    button confirmed working (visual "✓ Copied" confirmation).
  - Attempt 2 — real request id, 1740/544 tokens, 1,916-character raw
    response, retry reason `contradictory_applicability`, correction
    instruction `consistency_retry_v1`, and a working **"View previous
    attempt"** link that correctly re-selects Attempt 1.
- **Contradictory-applicability comparison**: both attempts shown
  side-by-side, correct detector stage (`cross_array_contradiction`) and
  correct occurrence counts for `context_continuity_rate` in both.
- **Security checks**: confirmed via direct `curl` that an unauthenticated
  request to the diagnostics endpoint returns `401` with
  `Cache-Control: no-store` already present on the response (not only on
  the authorized 200 path). The authorized/unauthorized/scope-isolation
  decision logic itself was already covered by the 30 unit assertions in
  `automated-qa-diagnostics-verify.mjs` (re-run clean after the fix).
- No console errors at any point (one unrelated browser-extension
  exception observed, not from this application).

VoiceForce/KATON and light/dark were not re-exercised via a live
generate-theme-css.mjs pass this round, since the only UI change in this
activation round was the single-line theme-token fix described below
(no new token, no structural change) — the same reasoning the
Session 16.5.1 HIG review already applied to comparable one-line fixes.

## Functional guardrails honored

No change to: Generic Local LLM API, evaluation prompts, QA parameter
definitions, QA scoring, applicability rules, validation logic, retry
strategy, attempt persistence, existing evaluation records, Human QA,
Corrective Actions, or Interaction Trace. Confirmed by diff — every
changed/new file is additive UI/API-glue/permission-seed only; nothing
under `src/server/qa/automatedQaEvaluator.ts` or the applicability/
validation modules was touched.

## Centralized UI compliance

Before committing, the staged UI files went through the HIG commit gate
three times (fix → re-review each round), per this project's standard
procedure. Round 1 (high=0, 1 medium/3 low/1 advisory) fixed: the
Copy button's sub-24px touch target (added `min-h-6` + padding); four
hardcoded typography-size literals replaced with existing
`typography.tableHeader`/`typography.microCaption`/`typography.tableBody`
roles (plus the truncation note reusing the existing
`--type-microCaption-size` token instead of a bare `text-[10px]`);
silent clipboard-failure (now shows "Couldn't copy" with auto-reset);
missing screen-reader announcement of the Copy/Copied state change
(added a visually-hidden `role="status" aria-live="polite"` span); and
missing `aria-hidden="true"` on decorative icons. Round 2 (high=0, 1
medium/3 low/1 advisory) fixed the one remaining item: the Collapsible
disclosure trigger and the "View previous attempt" button had no
`focus-visible:` style, unlike the attempt-list rows which already did
— both now use the identical `focus-visible:outline
focus-visible:outline-2 focus-visible:outline-cyan-500` treatment.
Round 3 confirmed that fix and found nothing new — `high=0`, gate
passed, recorded via `hig-gate.mjs --pass`.

No new design tokens were introduced. The one newly-introduced hardcoded
value found in self-review — `EvaluationDiagnosticsPanel.tsx`'s
truncation note, originally `text-amber-700 dark:text-amber-400` — was
**corrected** per explicit instruction, to
`text-[var(--status-caution-text)]`, the same themed CSS variable
`Badge`'s `warning` variant already reads (`--status-caution-text`,
defined in both `voiceforce.config.ts` and `katon.config.ts`, with
light/dark pairs already resolved by the variable itself — no separate
`dark:` class needed). This was a newly-introduced value in this
session's own new code, not a pre-existing one, so it did not fall under
the Rule 12 "don't undertake unrelated legacy migration" carve-out —
it was simply fixed.

The pre-existing hardcoded `amber-*`/`emerald-*`/`cyan-*` colors already
present in `AutomatedQaInspector.tsx` from earlier sessions (flagged,
out of scope, in the Session 16.5.1 HIG re-review) were **not** touched —
those predate this session's changes and remain the documented,
disclosed, separate follow-up they already were. The two `cyan-*`
literals in the new `EvaluationDiagnosticsPanel.tsx` (row-selection
highlight, focus ring, "View previous attempt" link) are this app's
established, pervasive link/focus-accent color — the identical pattern
`FindingsList.tsx` already uses byte-for-byte, confirmed reused (not
newly invented) in 39+ files project-wide per the Session 16.5.1 HIG
review.

Everything else reuses existing tokens: `Badge`'s
`positive`/`destructive`/`warning` variants (driven by `--status-*` CSS
vars), `typography.*`, and the exact `h-[30px] ... text-[11px]`
table-header recipe already established in
`FindingsList.tsx`/`ManualQaInlinePanel.tsx`.

## Stop conditions honored

No commit, no push, no deploy. The diagnostics-permission migration was
applied **only** after explicit authorization (see "Migration
activation" above) — no other migration, and no table/schema change of
any kind. No evaluation records modified. No QA evaluation
initiated/rerun. No interference with the (already-deployed) Session
16.5.1 work — this session's application-code changes remain entirely
additive/new-file: `api/admin.ts` (one new branch + the
`toCamelCaseDeep` bug fix), `AutomatedQaInspector.tsx` (an additive
import + one new section), `src/lib/automatedQaAttemptDiagnostics.ts`
(one new exported function, Session 16.4.4's own module), and otherwise
entirely new files.

## Remaining limitations

None outstanding from this activation round. Full authorized-path live
verification is now complete (see above), the data-shaping bug found
during it is fixed and regression-tested, and the one newly-introduced
hardcoded color has been corrected to a theme token. The pre-existing,
already-disclosed `AutomatedQaInspector.tsx` color pattern remains a
deliberate, separate, out-of-scope follow-up, unchanged from the prior
report.
