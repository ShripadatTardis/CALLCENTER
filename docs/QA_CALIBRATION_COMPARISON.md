# QA Calibration & Comparison — Session 16.4

## 1. Purpose and scope

A **measurement reliability and diagnostic capability**, not a replacement for either QA system. It lets a supervisor compare a submitted Human QA review against a completed/partial Automated QA evaluation of the same interaction, for the same nine canonical parameters (`src/lib/qaParameters.ts`), and see:

- Where the two agree.
- Where they disagree.
- Where they disagree on whether a parameter even applied.
- Which parameters most need calibration.
- The exact evidence behind each judgment.

**Human QA is never treated as ground truth.** Neither source's scoring logic, measurement contract, or persistence is modified by this session — this is a read-only, additive view computed entirely from data both sides already persisted (Sessions 16.1–16.3).

## 2. Architecture audit — what already existed

Before writing any comparison code, the following were confirmed directly against the live schema and codebase (not assumed from prior session summaries):

- **`call_center.qa_reviews` / `qa_findings`** (Session 16.1) and **`call_center.automated_qa_evaluations` / `automated_qa_observations`** (Session 16.3) are structurally parallel, independent tables — exactly as documented in `MANUAL_QA_QUALITY_FRAMEWORK.md` §4 and `AUTOMATED_QA_EVALUATION_ARCHITECTURE.md`.
- **Turn ids are provably identical by construction.** The Automated QA evaluator computes turn ids via the exact same pure functions (`src/lib/qaConversation.ts`, `src/lib/qaTurnIdentity.ts`) Human QA's own client-side review workspace uses. A shared `primary_turn_id` on a `qa_finding` and an `automated_qa_observation` for the same interaction is therefore a **real, verifiable correspondence** — not an assumption this session introduces.
- **Every data-fetching endpoint this page needs already existed, already permission- and Agent-Scope-enforced:**
  - `?resource=qa&action=listForInteraction` / `fetchQaReview` (single review + findings) — already used by the Human QA review workflow.
  - `?resource=qa&action=population` (`fetchQaAnalysisPopulation`) — already used by the Human QA Quality Explorer (Session 16.2), already `qa.analytics.view`-gated.
  - `?resource=automatedQa&action=listForInteraction` / `fetchAutomatedQaEvaluation` — already used by the Automated QA Inspector and Interaction Quality listing (Session 16.3/16.3.8).
  - **No new API route, RPC, or database migration was needed for this session.** This page is pure composition of existing, already-tested services (`src/lib/qaComparison.ts` + `src/hooks/qa/useQaCalibration.ts`), consistent with "do not create a second measurement engine."
- **Human QA has no persisted transcript snapshot or hash.** `call_center.qa_reviews` has no `transcript_snapshot`/`transcript_hash` column — Human QA reads the live transcript client-side at review time and never persists what it saw. This is the single biggest scope-shaping finding of this session (see §4).

## 3. Pairing eligibility (Part B1/B2)

A comparison pair requires one **submitted** Human QA review and one **completed or partial** Automated QA evaluation of the same `(channel, interaction_id)`, both within the caller's Agent Scope.

- Draft (`in_progress`) reviews are never eligible.
- `queued`/`running`/`failed` evaluations are never eligible. `partial` IS included — a partial evaluation still has real, independently-covered observations for whichever windows succeeded; excluding it would discard genuine usable evidence, and its coverage gap is already a first-class, surfaced concept elsewhere in this methodology.
- The **latest** review and **latest** evaluation are never assumed to be "the" pair. The Calibration page's version selectors (`QaCalibration.tsx`) list every eligible review and evaluation for the selected interaction (reviewer, submission date, review id / evaluation date, prompt version, model, evaluation id) and default to the latest of each — but any historical version is independently selectable. The dashboard-level Summary and Insights (§6/§7) DO default to each pair's latest-of-each, as a documented, bounded default for an aggregate view (`useQaCalibrationBatch`).

## 4. Transcript comparability (Part B3)

```
humanHash, automatedHash -> 'matched' | 'mismatch' | 'unknown'
```

Because Human QA never persists a transcript hash (§2), **every pair in this system currently evaluates to `'unknown'`** — never fabricated as `'matched'` merely because both sides share an interaction id. This is implemented so it costs nothing to fix later (`transcriptComparability()` in `src/lib/qaComparison.ts` already handles a real hash on both sides); until Human QA persists one, the function is a documented pass-through to `'unknown'`.

Per the brief: an `'unknown'` (or `'mismatch'`) pair is **still shown and inspectable** (version selectors, nine-parameter matrix, evidence drill-down all work normally), but is **excluded from "Validated comparable pairs"** in the Summary, and its `TranscriptComparabilityBadge` carries an explicit tooltip explaining why. Today this means the "Validated comparable pairs" count is always 0 — an honest reflection of a real, documented data-contract gap, not a hidden limitation.

**Recommended follow-up (not implemented — would touch Human QA's own write path, `call_center_qa_review_start`/`_init_turns`, which this session was told not to modify):** add a `transcript_hash` column to `qa_reviews`, captured at review-start time from the same transcript fetch the reviewer already performs. Additive, no scoring-logic change — a clean candidate for a future session.

## 5. Nine-parameter comparison methodology (Part C)

Implemented in `src/lib/qaComparison.ts`, pure and deterministic, reusing `computeQaRatios`/`computeAutomatedQaRatios` unchanged for every numerator/denominator/rate — **no second ratio formula**.

For each parameter, per pair:

1. **Ratios first.** `humanRatio = computeQaRatios(review.findings)[code]`, `automatedRatio = computeAutomatedQaRatios(evaluation.observations)[code]` — these already apply every documented exclusion (N_A, CANNOT_VERIFY for grounding, interaction-level rollup for repetition/customer-correction) exactly as the Measurement Contract defines them.
2. **Applicability-level classification** (from the two denominators alone):
   - Both `0` → **Both not applicable**.
   - Exactly one `0` → **Applicability mismatch** (the side names the gap — "Human QA recorded no eligible opportunity... but Automated QA assessed at least one turn" or the reverse).
3. **Turn-level correspondence** (both denominators `> 0`): build `turnId -> value` maps from each side's real (non-`N_A`) observations for this parameter, then intersect by turn id (§2's by-construction guarantee).
   - No overlapping turns → **Not comparable** (real evidence on both sides, but nothing to directly compare — never manufactured into an agreement or disagreement).
   - Overlapping turns exist: any turn where **either** value is `CANNOT_VERIFY` is tracked separately (`cannotVerifyTurnIds`) and excluded from the agree/disagree tally entirely (Part C5 — never counted as agreement, disagreement, PASS, or FAIL). Of the remaining comparable turns: all agree → **Agreement**; any disagree → **Disagreement** (the per-turn breakdown, including which specific turns disagreed, is preserved in `turnComparisons` for the drill-down — the pair-level classification is the conservative "any mismatch" rule, documented here rather than left implicit).
   - If every overlapping turn involved `CANNOT_VERIFY`, the parameter rolls up to **Not comparable** with an explicit reason, rather than silently resolving to anything else.
4. **Non-overlapping turns on either side** (`humanOnlyTurnIds` / `automatedOnlyTurnIds`) are always preserved and surfaced as a documented "coverage difference" — never silently dropped, never blended into the agreement/disagreement count.

Directionality (higher-is-better vs. lower-is-better) is never special-cased in the comparison engine itself — it is already fully encoded in the ratio each side supplies (`computeQaRatios`' own directionality handling, unchanged), so e.g. a shared `ISSUE` value on a lower-is-better parameter like Unnecessary Clarification is correctly an **Agreement** (both sides found the same issue), never inverted into a "good" reading.

## 6. Dashboard (Part D)

Route: **`/qa-review/calibration`**, page `QaCalibration` (`src/pages/QaCalibration.tsx`), placed under the existing **Improve** sidebar group next to "Interaction Quality" (`src/components/layout/pillarNav.ts`).

- **D1 Summary**: paired-interactions count, eligible-pairs count, validated-comparable count (§4 — currently always 0, with denominator/explanation shown), and classification counts (Agreement / Disagreement / Applicability mismatch / Not comparable, with "Both not applicable" folded into the "Not comparable" display tile since both represent "no defensible judgment comparison was possible," distinctly labeled from the drill-down's finer classification) — every percentage-shaped number shows its explicit denominator, never a bare percentage.
- **D2 Parameter matrix**: the real nine rows, Human QA rate (numerator/denominator), Automated QA rate (numerator/denominator), and the derived classification badge — all drawn from the live `compareAssessments()` result for the selected (review, evaluation) pair, never hardcoded illustrative values.
- **D3 Evidence drill-down**: clicking a parameter row expands Human QA's finding(s) (value, reason code, note) and Automated QA's observation(s) (value, agree/disagree-with-Human, CANNOT_VERIFY callout) side by side, with turn text. Turn text is sourced from the **Automated QA evaluation's own persisted `transcript_snapshot`** (Human QA has none — §2/§4) — accurate for every turn the automated evaluation covers; a human-only turn outside that snapshot shows its turn id without fabricated text rather than guessing. Links out to the original Automated QA Inspector (`/qa-review/automated/:id`, a real deep link) and to the Interaction Quality listing for the Human QA review (no deep-link route exists for an individual review dialog today — documented limitation, §9).
- **D4 Filters**: Channel, Agent, Parameter, Comparison classification, Automated prompt version — applied client-side over the already-bulk-fetched comparison batch (no additional network round-trip per filter change, matching the Explorer's own established pattern).

## 7. Calibration insights (Part E)

All computed from the same filtered comparison batch, purely descriptive:

- **Applicability mismatch concentration** — which parameter(s) most often have one side find an opportunity the other didn't.
- **Judgment disagreement concentration** — which parameter(s) most often have both sides assess the same turn(s) but reach different values.
- **Coverage divergence** — mean (Automated denominator − Human denominator) per parameter, over pairs where both sides had at least one eligible observation.
- **Disagreement by prompt version** — disagreement count per parameter per `prompt_version`, counted **only** over cells that were actually classified `agreement`/`disagreement` (never blending in `applicability_mismatch`/`not_comparable` cells, which would misrepresent a coverage gap as a judgment disagreement).

Every insight view carries an explicit on-page disclaimer: descriptive only, never a correctness verdict, never a "prompt vX is better" claim — satisfying the brief's explicit restriction.

## 8. Authorization (Part F)

- Route-level: `ProtectedRoute permission="qa.analytics.view"` (that component only supports one permission).
- Page-level (`QaCalibration.tsx`): an explicit additional check requires `qa.automated.view` too, with a clear in-page message if only one is held — this page surfaces both Human aggregate analytics and Automated evaluation results, so holding only one side's permission is insufficient by design.
- Every underlying data fetch is Agent-Scope-filtered **server-side** by the existing, already-tested endpoints this session composes (`toAgentAccess`/`isAgentIdInScope`, unchanged) — no new server-side authorization code was written, and no hidden-UI-control security exists (every endpoint re-enforces scope regardless of what the client requests).
- Read-only throughout: no review or evaluation is ever mutated, no Automated QA evaluation is ever triggered from this page.

## 9. Known limitations (explicit)

- **Transcript comparability is always `'unknown'` today** — Human QA persists no transcript hash (§4). "Validated comparable pairs" will read 0 until that gap is closed in a future session.
- **No deep link exists to open one specific Human QA review** (`QaReviewDialog` is opened via local page state in `QAReview.tsx`, not a route) — the drill-down's "Original Human QA review" link goes to the Interaction Quality listing, not directly into the dialog.
- **Dashboard Summary/Insights are bounded to the 50 most-recently-paired interactions** (`useQaCalibrationBatch`'s `limit`), to avoid an unbounded fan-out of per-pair detail fetches on a page that otherwise needs none. A `truncated` flag is surfaced in the UI when this cap is hit. Appropriate at this project's current data volume; would need revisiting at materially larger scale.
- **Turn-level agreement rolls up per parameter as "any disagreement → Disagreement"** — a pair with 9 agreeing turns and 1 disagreeing turn for a parameter is classified Disagreement at the pair level; the per-turn detail (which turns agreed) remains visible in the drill-down, not discarded.
- **`repetition_loop_rate` and `customer_correction_rate`** are interaction/customer-level on both sides (at most one real finding/observation per review or evaluation) — the general turn-intersection algorithm still applies correctly to this shape (a map with at most one entry), not special-cased, but a "turn-level" comparison for these two parameters is really an interaction-level one in practice.
- **No automated correctness verdict is ever produced.** This session implements measurement **comparison**, not adjudication, corrective-action routing, or any claim about which side is right — all explicitly deferred per the brief (Session 16.5+).

## 10. Future calibration extensions (documented now, not built)

- Persisting a transcript hash on `qa_reviews` to make "Validated comparable" meaningful (§4).
- A real deep link to a specific Human QA review (§9).
- Precision/recall-style framing once enough paired data exists ("Automated QA correctly detected N% of Human QA's confirmed findings") — the `HUMAN_QA_QUALITY_EXPLORER.md` §10 future-comparison model this session's data shapes were deliberately kept compatible with.
- Disagreement adjudication and corrective-action routing (Session 16.1's documented, still-deferred §11 vocabulary).
