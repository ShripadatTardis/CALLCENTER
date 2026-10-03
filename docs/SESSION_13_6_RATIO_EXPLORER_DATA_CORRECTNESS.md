# Session 13.6 — Ratio Explorer Data Correctness (DEC-RATIO-01)

**Scope:** correctness of existing-data ratios only — the channel hardcode in `callPopulationProvider.ts`, and the eligibility logic of ratios already registered with a genuine source field. Explicitly NOT in scope: the 16→17 backend-gap ratios, the 6 Trace/telemetry ratios, or any new instrumentation (DEC-RATIO-02).

---

## A. 30-ratio baseline — corrected to 31

Before writing any code, the registry (`src/server/analytics/ratioRegistry.ts`) was counted directly rather than trusting the prior audit's "30 ratios" figure. **The real count is 31** (21 core + 10 Conversation Quality, confirmed by both the backend and frontend registries, which are kept in lockstep). The "30" figure predates this session and appears to be a stale snapshot — most likely from before one Conversation Quality ratio's classification was finalized. This discrepancy is recorded honestly rather than silently absorbed.

| State | Before (this session's start) | After |
|---|---|---|
| `direct` (implemented) | 5: fcr, escalation_rate, resolution_rate, aht, successful_resolution_time | **6** — adds authentication_success_rate |
| `partial` | 3: completion_rate, authentication_success_rate, avoidable_escalation_rate | **2** — completion_rate, avoidable_escalation_rate (both confirmed still genuinely unfixable; see §B) |
| `backend_gap` | 17 | 17 (unchanged — see §D) |
| `awaiting_telemetry` | 6 | 6 (unchanged — see §D) |
| **Total** | **31** | **31** |

Full per-ratio table (unchanged rows omitted detail beyond state, since this session made zero behavioral change to them):

| Ratio | Family | State Before | State After | Reason |
|---|---|---|---|---|
| contact_rate | operations | backend_gap | backend_gap | No "connected" signal exists; unchanged |
| completion_rate | operations | partial | partial | `stage` field has no confirmed real value set (re-confirmed, not fixed) |
| resolution_rate | operations | direct | direct | Regression-tested, unchanged |
| fcr | operations | direct | direct | Regression-tested, unchanged |
| escalation_rate | operations | direct | direct | Regression-tested, unchanged |
| repeat_contact_rate | operations | backend_gap | backend_gap | No same-issue linkage; unchanged |
| aht | operations | direct | direct | Regression-tested, unchanged |
| successful_resolution_time | operations | direct | direct | Regression-tested, unchanged |
| autonomous_resolution_rate | intelligence | backend_gap | backend_gap | No resolution-mode flag; unchanged |
| **authentication_success_rate** | intelligence | **partial** | **direct** | **Implemented — see §B.1** |
| intent_accuracy | intelligence | backend_gap | backend_gap | Field is classifier confidence, not measured accuracy; unchanged |
| tool_success_rate | intelligence | backend_gap | backend_gap | No tool-call telemetry; unchanged |
| fallback_rate | intelligence | backend_gap | backend_gap | No turn-level event telemetry; unchanged |
| avoidable_escalation_rate | intelligence | partial | partial | No avoidable/unavoidable taxonomy (re-confirmed, not fixed) — see §B.2 |
| qa_pass_rate | quality | backend_gap | backend_gap | No persisted QA record; unchanged |
| compliance_pass_rate | quality | backend_gap | backend_gap | No persisted compliance record; unchanged |
| csat | quality | backend_gap | backend_gap | No survey capture; unchanged |
| nps | quality | backend_gap | backend_gap | No NPS response capture; unchanged |
| business_outcome_success | business | backend_gap | backend_gap | No domain-neutral outcome model; unchanged |
| conversion_rate | business | backend_gap | backend_gap | No conversion-event capture; unchanged |
| cost_per_resolution | business | backend_gap | backend_gap | No cost telemetry; unchanged |
| context_continuity_rate | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| followup_understanding_rate | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| intent_routing_accuracy | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| conversation_recovery_rate | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| unnecessary_clarification_rate | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| task_progression_rate | conversation_quality | awaiting_telemetry | awaiting_telemetry | Needs Interaction Trace API; unchanged |
| reference_resolution_accuracy | conversation_quality | backend_gap | backend_gap | Insufficient real evidence; unchanged |
| response_grounding_rate | conversation_quality | backend_gap | backend_gap | No RAG reference/chunk IDs; unchanged |
| repetition_loop_rate | conversation_quality | backend_gap | backend_gap | Needs a non-overlapping definition; unchanged |
| customer_correction_rate | conversation_quality | backend_gap | backend_gap | No reliable correction-detection signal; unchanged |

---

## B. The three `partial` ratios — precise findings

A meta-finding first: the session brief's premise ("three registered ratios already have... an implemented calculation path, but incomplete eligibility logic") did not match the real code. Inspection of `ratioMath.ts`'s `RATIO_CALCULATORS` and `ratioService.ts`'s `IMPLEMENTED_RATIOS` showed **zero** calculation path existed for any of the 3 `partial` ratios before this session — they were pure registry metadata, identical in runtime behavior to the 17 `backend_gap` ratios (`not_instrumented`, empty summary/trend/breakdown/interactions). This session treated "partial" as the correct set to inspect (it is the registry's own distinct "field exists, eligibility unclear" category), and for each asked: can a defensible calculation now be built from real data + established semantics, without inventing anything?

### B.1 authentication_success_rate — IMPLEMENTED

| | |
|---|---|
| Source field | `was_authenticated: boolean \| null` (confirmed real, `src/types/api/calls.ts:148`) |
| Prior eligibility defect | Registry claimed "no distinct attempted signal exists" |
| Finding | **False** — this product already treats `was_authenticated === null` as a distinct "no evidence on record" state everywhere it's displayed (`InteractionDetailDialog`'s secondary facts row, `CustomerDetail`'s "Authentication: No evidence on record"). Null-vs-non-null IS the real attempted/not-attempted signal; it was simply never wired into the ratio calculation. |
| Corrected predicate | Denominator = calls where `was_authenticated` is non-null (attempted). Numerator = those where `was_authenticated === true`. |
| Null handling | `null`/`undefined` → excluded from denominator entirely (never counted as a failure). `true`/`false` → both counted as "attempted"; only `true` counts toward the numerator. |
| Deterministic evidence | `.tooling/scripts/ratio-math-verify.mjs` — 9 new cases: all-success, all-failure (legitimate 0%), mixed, null-excluded, missing-field-excluded, no-eligible-population→null, empty-array→null, numerator≤denominator invariant, exact mixed-with-nulls value. All pass. |
| Live-data verification | **Limitation, documented honestly**: across 700 of 716 real call-data records fetched directly from the deployed API during this session, `was_authenticated` is `null` on every single row — no `true`/`false` value appears anywhere in the currently live dataset. The ratio is correctly implemented and will show a real percentage the instant the backend populates a non-null value for any call; today it correctly renders **"No eligible population"** rather than a fabricated number. This matches the Customer Detail "No evidence on record" observation made independently in an earlier session for the same underlying dataset — internally consistent, not a new anomaly. |

### B.2 avoidable_escalation_rate — remains unavailable (confirmed, not fixed)

`escalation_trigger` is a real, populated free-text field, but no normalized avoidable/unavoidable taxonomy exists anywhere in the application — not in the field's real values, not in any classification table, not in any established UI pattern. Building this ratio would require inventing a business taxonomy (deciding which trigger strings count as "AI/technical failure" vs. "genuine complexity"), which the session's explicit "no semantic invention" rule forbids. Left `partial`, with the registry's `eligibilityNote` updated to record that this was re-investigated, not merely carried forward unexamined.

### B.3 completion_rate — remains unavailable (confirmed, not fixed)

`CallDataEntryDto.stage` has no confirmed real value set — every reference to a stage enum in this repository traces to Lovable-era mock data, never a live-verified API response (established in Session R3, re-confirmed this session: no new live evidence has appeared). No denominator can be defensibly built on an unconfirmed field. Left `partial`, registry note updated to record the re-confirmation.

---

## C. Channel architecture

### Provider inventory

| Provider | Source | Voice | Chat | Channel provenance |
|---|---|---|---|---|
| `callPopulationProvider.ts` (the only `AggregationProvider` ratioService.ts uses) | `GET /api/v1/call-data` via `fetchCompleteCallPopulation` | Yes | **No** | Every row originates from the Voice call-data endpoint; there is no Chat-backed population anywhere in this file or any other `AggregationProvider` implementation in the repository (confirmed by searching the whole `src/server/analytics/` tree — only one provider exists). |

### The explicit question: was `channel: 'voice'` a misclassification, or was the provider itself Voice-only?

**Finding B (per the session brief's own framing): the provider is genuinely Voice-only.** `channel: 'voice' as const` in `callPopulationProvider.ts` was already accurate for every row it has ever produced — it is not a bug, and no row was ever mislabeled. The real issue was the opposite kind of risk: `RatioInteractionRefResult`/`RatioInteractionRefDto`'s `channel: 'voice' | 'chat'` type is a legitimate forward-looking contract (for a future Chat-backed provider), but nothing downstream actually verified the two mapping functions and components built around it stayed honest to that contract. Per the brief's explicit instruction, no Chat rows were fabricated and no Chat population source was invented.

The mapping logic was extracted into a standalone, directly-testable pure function (`mapCallToInteractionRef`, `callPopulationProvider.ts`) with a deterministic test (`ratio-channel-verify.mjs`) proving it can never produce `'chat'` given today's architecture — the hardcoded literal is now explicit, documented, and verified, not merely an uncommented literal a future reader might mistake for a bug.

### A real correctness bug found and fixed during this inspection

While tracing drill-through end-to-end (per §9–§12 of the session brief), `InteractionInspector.tsx` was found to have a genuine identity-stability bug, unrelated to the channel question itself:

- It looked up the Voice interaction via `useCallData({ search: interaction.interactionId })` — but `/call-data`'s `search` parameter only matches `caller_number`/`caller_name`, **never** `call_id` (a fact already documented repeatedly elsewhere in this codebase, e.g. `CampaignDetail.tsx`, `CustomerDetail.tsx`). This lookup could never genuinely succeed by design.
- Its fallback, `?? data?.interactions[0]`, meant that whatever the (non-matching) search happened to return, the component would silently display the *first* result as if it were the clicked interaction — a real risk of showing the wrong customer's call.

**Fixed** by adding `phoneNumber` to `RatioInteractionRefResult`/`RatioInteractionRefDto` (populated from the already-fetched `call.caller_number`, at zero extra cost) and rewriting `InteractionInspector.tsx` to use the exact same proven phone+call_sid lookup (`src/lib/callLookup.ts`'s `findCallBySidAndPhone`, established in Session 13.5) that `LiveView.tsx` and `CampaignDetail.tsx` already use — stable identity, and a genuine "not found" state instead of a dangerous first-row fallback. The component now also branches on `interaction.channel`, routing a (currently unreachable, never-fabricated) `'chat'` row straight to the existing `ChatSessionDetailDialog`, so it is honestly channel-aware rather than silently Voice-only by omission.

### Drill-through behavior

- **Voice**: `InteractionInspector` resolves via `findCallBySidAndPhone(phoneNumber, interactionId, role)` → shared `InteractionDetailDialog` (Call Logs/Campaign Detail/Live View's same component). Verified live (see §F).
- **Chat**: routes to the existing `ChatSessionDetailDialog` directly (no lookup needed, matching `CustomerDetail.tsx`'s established pattern for chat rows) — present in code for contract-honesty, not reachable with today's Voice-only population, and not claimed as working with real data.

---

## D. Remaining unavailable ratios (unchanged, confirmed not touched)

**16→17 backend-gap ratios** (one more than the prior "16" baseline, see §A's count correction): contact_rate, repeat_contact_rate, autonomous_resolution_rate, intent_accuracy, tool_success_rate, fallback_rate, qa_pass_rate, compliance_pass_rate, csat, nps, business_outcome_success, conversion_rate, cost_per_resolution, reference_resolution_accuracy, response_grounding_rate, repetition_loop_rate, customer_correction_rate. None were implemented, none were given proxy/estimated/inferred values. DEC-RATIO-02 was not started.

**6 Trace/telemetry-dependent ratios**: context_continuity_rate, followup_understanding_rate, intent_routing_accuracy, conversation_recovery_rate, unnecessary_clarification_rate, task_progression_rate. Unchanged — still `awaiting_telemetry`, no LLM-based transcript inference was performed or considered.

---

## E. Regression — the five pre-existing implemented ratios

| Ratio | Regression result |
|---|---|
| fcr | `ratio-math-verify.mjs` unchanged assertions pass; `ratio-runtime-state-verify.mjs` confirms still `direct`-eligible |
| escalation_rate | Same as above |
| aht | Same as above |
| resolution_rate | Same as above |
| successful_resolution_time | Same as above |

No calculation, eligibility rule, or DTO shape for any of the five was altered. `RATIO_CALCULATORS`/`RATIO_ELIGIBLE_POPULATION`/`IMPLEMENTED_RATIOS` all gained exactly one new entry each (`authentication_success_rate`) with no existing entries removed or modified.

---

## F. Verification

- `npm run typecheck` — 0 errors. `npm run build` — clean. `npx eslint` on every touched file — 0 errors.
- `npm run verify:full` — all suites green, including:
  - `ratio-math-verify.mjs` — 26/26 (17 pre-existing + 9 new Authentication Success Rate cases)
  - `ratio-dimensions-verify.mjs` — 4/4 (unchanged, re-run to confirm no regression)
  - `ratio-channel-verify.mjs` (new) — 8/8
  - `ratio-runtime-state-verify.mjs` (not part of the automated gate, run manually to confirm no regression) — 22/22, including the explicit "5 ratios still direct-eligible" check
- HIG design review performed on the one touched UI file (`InteractionInspector.tsx`) — see completion report for the result.
- Live browser verification against the deployed app — see completion report.

## G. Decision Register

`DEC-RATIO-01` marked implemented to the extent actually proven — see `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`. The channel finding is recorded as an architectural fact (Voice-only provider), not a false claim of cross-channel support. `DEC-RATIO-02` was not touched.

## H. Noted but explicitly not fixed this session

Per the session brief's §32: the Campaign Settings stale-cross-version-mapping defect discovered during Session 13.4 (documented in `docs/SESSION_13_4_CAMPAIGN_CONFIGURATION_HISTORY_EXPOSURE.md` §4) remains unfixed — it is unrelated to Ratio Explorer and is left for a later, bounded Campaign correctness session.
