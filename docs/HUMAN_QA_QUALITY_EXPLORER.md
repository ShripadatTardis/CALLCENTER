# Human QA Quality Explorer (Session 16.2)

This document describes the Human QA Quality Explorer — an aggregate analysis view built
on top of Session 16.1's Human QA review workflow. It does **not** redefine any
parameter, numerator, denominator, or exclusion rule. For those, `docs/MANUAL_QA_MEASUREMENT_CONTRACT.md`
remains the single authoritative source; this document only describes how the Explorer
*scopes, filters, and aggregates* data that the Measurement Contract already defines.

## 1. Analytical purpose

The Explorer exists to let a QA Head or similar role answer, with evidence, not just a
percentage:

> "Our Context Continuity Rate is 91%. Why is it not 100%?"

and navigate: **91% → failed observations → failure reasons → actual conversations →
exact evidence turns.**

It is built on the analytical chain:

```
Submitted Human QA Reviews
           |
           v
    Quality Observations (qa_findings)
           |
           v
   Parameter Measurements (computeQaRatios)
           |
           v
      Quality Ratios (displayed per parameter)
           |
           v
     Failure Reasons (reason-code distribution)
           |
           v
    Reviewed Interactions (grouped by interactionId)
           |
           v
  Exact Conversation Evidence (QaReviewDialog, read-only, jumped to the primary turn)
```

## 2. Data source — submitted reviews only

The Explorer's population is **exclusively** `call_center.qa_reviews` rows with
`status = 'submitted'`, and their `qa_findings`. It explicitly excludes:

- `in_progress` reviews (shown only as a *count*, "Reviews in progress", never folded
  into any ratio)
- abandoned/never-submitted drafts
- automated or API-generated quality judgments — there are none in this schema; Human
  QA and any future automated analysis (Session 16.3+) are and will remain separate
  measurement sources (see §9 below)

This is enforced server-side: `call_center_qa_findings_list` and
`call_center_qa_reviews_population` are both Agent-Scope-filtered RPCs; the findings RPC
has always been submitted-only (Session 16.1); the population RPC intentionally returns
both statuses so the UI can show "N in progress" without a second round trip, but the
Explorer's own ratio/trend/agent/reason computations only ever consume
`status === 'submitted'` rows from it.

## 3. Audit findings that shaped this design

Before writing any aggregation code, the existing implementation was inspected (not
assumed from the Session 16.1 summary):

- **`mergeFlagFindings`'s Tier-1 auto-clean observations are genuinely applicable by
  construction**, not a blanket assumption. `computeTier1Applicability` runs
  structurally over the ordered turn list *before* any finding is ever written —
  Context Continuity is skipped on the first agent turn, Follow-up Understanding is
  skipped when responding to the customer's first utterance. So a Tier-1 PASS finding in
  `qa_findings` was only ever written for a turn the system could establish, from turn
  position alone, was genuinely eligible. This is a real, defensible denominator
  contribution — not something this session needed to "fix."
- **Tier-2 parameters (Reference Resolution, Unnecessary Clarification,
  Repetition/Loop, Customer Correction, Conversation Recovery, Response Grounding) are
  never auto-recorded** — a `qa_findings` row for one of these only exists when a
  reviewer explicitly engaged with it via Flag Issue. Absence of a row is correctly
  "not assessed," already excluded from that parameter's denominator by
  `computeQaRatios` (Session 16.1, unchanged by this session).
- **`computeQaRatios` (src/lib/qaRatios.ts) already gets every unit/exclusion rule
  right**: N_A excluded from every denominator; `response_grounding_rate` additionally
  excludes CANNOT_VERIFY; `repetition_loop_rate` is rolled up to one assessment per
  **review** (interaction-level), not counted per turn. This session reuses that
  function directly for every ratio shown — it is never reimplemented.
- **Multiple reviews CAN exist for the same (interaction, channel)** — confirmed live on
  this project's own Supabase instance during this session's audit (one interaction
  already had 1 submitted + 1 in-progress review, same reviewer, from Session 16.1.1's
  own live verification). The schema was explicitly built to allow this (calibration:
  a different reviewer independently reviewing the same interaction). See §5.
- **`call_center_qa_review_get`'s ownership check blocked evidence drill-down for
  anyone but the original reviewer**, including for a *submitted* review. This is
  correct for the review *workflow* (an in-progress review is a private draft) but
  wrong for the Explorer's required "ratio → interaction → evidence" chain for any
  authorized analyst. Fixed via `qaReviewViewAuthorized` (api/admin.ts) — see §8.
- **Turn IDs and agent identity** are unchanged from Session 16.1 (deterministic
  synthesized voice turn IDs, `ChatMessage.id` for chat; `qa_reviews.agent_id` stamped
  and Agent-Scope-validated at review start) — reused as-is, nothing new to resolve.
- **"Eligible interactions"** (the coverage denominator) is not persisted anywhere in
  `call_center` — interactions live in the external Voice/Chat Partner APIs. See §6.

## 4. Nine parameter measurements

Unchanged parameter codes, values, and ratio math from the Measurement Contract — the
Explorer's "Quality Measures" grid shows, for each of the 9 parameters:

- current rate (`formatFractionAsPercent`, or "—" / "No eligible population" when the
  denominator is 0 — never a fabricated 0% or 100%)
- numerator / denominator, with the eligible population size
- directionality ("Higher is better" / "Lower is better" — a lower-is-better measure is
  never inverted into a misleading positive score)
- a click-through to every individual failed/affected observation behind that number

## 5. Duplicate / revision policy (explicit, documented)

A reviewed interaction may have more than one **submitted** review (independent
calibration reviews by different reviewers, or a deliberate re-review). The policy,
chosen because the schema explicitly supports independent multiple reviews and the
brief requires a deliberate, documented choice rather than silent double-counting:

- **Population-level counts that are about *interactions*** (reviewed-interactions
  count, review coverage) **deduplicate by `(channel, interactionId)`** — a second
  independent review of the same interaction still counts that interaction once.
- **Parameter ratios (`computeQaRatios`) do NOT deduplicate** — each submitted review
  is treated as an independent, complete Human QA assessment, and its findings
  contribute to the ratio independently of any other review of the same interaction.
  This is the smallest defensible choice: collapsing two independent reviewers'
  assessments into one would silently discard a genuine disagreement that calibration
  exists to surface.
- **Interaction-level conclusions** (Request Completion, FCR, Human Assistance
  Required, Business Outcome) follow the same rule — each submitted review's own
  conclusion is counted; two reviews of one interaction with different conclusions both
  appear in the breakdown, never silently reconciled to one.

## 6. Review coverage

"Eligible interactions" is the one figure the Explorer cannot source purely from
`call_center.qa_*` tables, because those only know about **reviewed** interactions.
It is computed by reusing the same bounded, already-authorized Voice/Chat population
fetch the Interaction Quality list and Agent Detail pages already use
(`useCallData`/`useChatLogs`), filtered client-side by the Explorer's own agent/channel
selection. This carries the same known limitation already documented elsewhere in this
app: Voice is this agent's share of the most-recent-100 call-data rows (company-wide),
not a true all-time total; Chat has no date-filter support today, so a submission-date
range narrows Voice's eligible count but not Chat's. The Explorer surfaces this via a
"Data notes" popover next to Review Coverage rather than silently presenting the figure
as exact.

| Measure | Meaning |
|---|---|
| Eligible interactions | Bounded Voice/Chat population matching the current filters (see limitation above) |
| Submitted reviews | `qa_reviews` rows with `status='submitted'` matching scope+filters |
| Reviewed interactions | Distinct `(channel, interactionId)` among submitted reviews |
| Review coverage | Reviewed interactions / Eligible interactions, or **"No eligible population"** (never 0%) when the denominator is 0 or unknown |
| Findings | Total `qa_findings` rows matching scope+filters |
| Reviews in progress | `qa_reviews` rows with `status='in_progress'` — never counted toward any ratio |

## 7. Filter semantics

Minimum filters implemented: **Channel** (Voice/Chat/All), **Agent** (stable `agentId`,
never display-name matching), **Submission date range**, **Reviewer**.

**Date semantics — read this before trusting any date-filtered number.** Every date
filter in this Explorer is **review submission date** (`qa_reviews.submitted_at`), not
interaction date. This is a deliberate, documented deviation from the brief's
"recommended default" of interaction date: interaction date is not persisted anywhere
in `call_center` (interactions live in the external Voice/Chat Partner APIs, correlated
only by `interaction_id`), so filtering the aggregate by interaction date would require
one external API lookup per submitted review merely to render a dashboard — exactly the
N+1 pattern the brief's own performance section (§22) warns against. Submission date is
a real, always-persisted, already-indexed field, and in this reviewer-contemporaneous
workflow it tracks interaction date closely in practice. The UI labels every date field
"Submitted from/to", never "Interaction date," so the two are never silently mixed.

Reason-code and parameter filters are applied via click-through from the Quality
Measures grid and the Failure Reasons table, not as standing filter-bar controls, to
keep the primary filter bar to the stated minimum set.

## 8. Authorization

New permission: **`qa.analytics.view`** — "View Human QA Quality Explorer." Distinct
from `qa.review` (conducting a review), per the brief's explicit caution against
granting broad analytical access merely because a user can submit a review. Default
grants: `administrator`, `supervisor` — **not** `qa_reviewer` by default (adjustable
later via the existing Role Management permission matrix, same as every other
permission in this schema).

Enforcement:

- `GET /api/admin?resource=qa&action=findings|population` requires `qa.analytics.view`
  and is Agent-Scope-filtered server-side (same `toAgentAccess`/`isAgentIdInScope`
  predicate used everywhere else in this schema since Session 14.3) — a restricted
  agent's findings/reviews never appear in any aggregate, trend, or count.
- `GET /api/admin?resource=qa&action=review` (evidence drill-down) now accepts either
  `qa.review` or `qa.analytics.view` at the permission gate, then applies
  `qaReviewViewAuthorized` (api/admin.ts, unit-tested in
  `qa-analysis-authorization-verify.mjs`): the review's own author can always view it;
  a non-author can view it **only** when it is `submitted` **and** they hold
  `qa.analytics.view`. An in-progress review stays strictly private to its author even
  from an analyst — it is a draft, not yet the shared reference record. Every mutation
  path (`initTurns`/`submitTurn`/`setConclusions`/`submit`) is completely unchanged:
  strictly owner-only, regardless of `qa.analytics.view`.
- Customer Category Scope is not separately applied here: Session 14.3 established
  Agent Scope, not Customer Category Scope, as the dimension that governs Call/Chat/QA
  data (Customer Category Scope governs Customer 360 only) — unchanged in this session,
  consistent with every other QA endpoint since Session 16.1.

## 9. Relationship to the existing Ratio Explorer

The Human QA Quality Explorer and the automated Ratio Explorer are **separate
measurement sources** and are not merged. Human QA = submitted manual reviews only;
Ratio Explorer = existing operational/automated measurements. Where terminology
overlaps (the 9 parameter codes are literally the same ids as 9 of the Ratio Explorer's
"Conversation Quality" ratios, per Session 16.1 §0), this Explorer never flips any
Ratio Explorer `availability` value and never presents a Human QA percentage as if it
were an automated one. A future session (16.4, explicitly out of scope here) will build
the Human-vs-Automated comparison this separation is deliberately preserving room for.

## 10. Performance / data access

Two bulk, already-scoped RPC calls per filter change — `call_center_qa_findings_list`
and `call_center_qa_reviews_population`, both Agent-Scope-filtered and
channel/date/reviewer-filtered server-side — feed every ratio, trend, reason
distribution, and agent comparison via pure client-side functions
(`src/lib/qaAnalysis.ts`, built directly on the already-tested `computeQaRatios`). No
transcript or individual-review detail is fetched until a user explicitly drills into
one interaction's evidence. This mirrors the existing Ratio Explorer's own pattern of
computing aggregates from one bounded row-set rather than per-metric requests, and
respects the project's Vercel Hobby-plan 12-function ceiling — no new serverless
function was added; both endpoints dispatch through the existing
`api/admin.ts?resource=qa` route.

## 11. Known data limitations (explicit, not papered over)

- **Eligible interactions is a bounded figure**, not a true census — see §6.
- **Chat has no submission-date-independent "interaction date" source**, so a
  submission-date filter narrows Voice's eligible count more precisely than Chat's.
- **Reviewer filter shows a truncated user id**, not a resolved display name — resolving
  it would require a `users.view`-gated fetch that `qa.analytics.view` holders are not
  guaranteed to also hold; deferred rather than silently widening the permission
  surface.
- **No ratio in this Explorer is estimated or invented.** Every parameter with zero
  eligible observations in the current scope displays "No eligible population" or "—",
  never a fabricated percentage.

## 12. Future automated-comparison integration point

This document and `computeQaRatios` deliberately keep "Human QA" as a labeled,
independent dimension (never silently merged with any automated value) so that a future
session can add, per parameter: `Human QA`, `Automated`, `Agreement` — without
restructuring anything built in this session. That comparison, precision/recall,
disagreement adjudication, and any corrective-action workflow are explicitly deferred
to Sessions 16.3–16.5.
