# Session 10 — Complete CMA Ownership and Screen Centralization

Establishes CMA as the single authoritative measurement interface for all 60 registered
canonical measures. Every screen that displayed a business measure independently of CMA
has been audited and, where a real CMA path exists, wired to it — never left running
both the legacy calculation and a new CMA display side by side. Ownership and
calculation accuracy are kept strictly separate throughout, per explicit instruction.

## Baseline (re-verified, not assumed)

- 60 canonical measures confirmed live in `call_center.cma_canonical_measures`.
- `CMA_ALGORITHM_REGISTRY` confirmed exactly 22 entries, 6 source families.
- Existing evaluation service/RPCs, evidence infrastructure, NORMAL/TEST isolation,
  and the 500-interaction POC dataset all confirmed intact.
- Session 9's `cmaCandidateAlgorithms9.ts` and its unapplied candidate migration
  confirmed present, reused as-is (never rewritten).

## The CMA ownership contract (additive — nothing existing changed behavior)

A new layer, `cmaOwnershipRegistry.ts` + `cmaOwnershipResolver.ts`, sits alongside the
existing `evaluateCmaMeasure()` engine (unchanged) rather than replacing it. Every
canonical measure resolves through one function, `resolveCmaMeasure()`, returning:
`canonicalMeasureId`, `measureName`, `governanceStatus`, `ownershipMode`,
`accuracyStatus`, `sourceType`, `sourceReference`, `calculationVersion`,
`consumingScreens`, `unavailableReason`, and (only when a live window was requested)
`value`/`dataWindow`/`appliedDimensions`/`appliedBusinessDataScope`/`datasetMode`.
Nothing is fabricated: an unresolved measure returns a governed `CMA_UNAVAILABLE`
status with a real reason, never an invented value. A static-only call (no live
window) is cheap and safe to run for all 60 measures on one page load — the live
path only runs when a screen or the management UI's "Evaluate now" explicitly asks.

### The five delivery modes, and why a measure got each one

| Mode | Count | Meaning |
|---|---|---|
| `CMA_NATIVE` | 25 | The 22 already-deployed, accuracy-verified algorithms + the 3 `mock` indicators (handled natively by `evaluateCmaMeasure()`'s own governance short-circuit — a real code path, not a registry label with nothing behind it) |
| `CMA_PROVISIONAL` | 3 | FCR-03/ESC-03/AHT-03 — real CMA calculations, independently tested (Session 9), business approval still pending |
| `CMA_LEGACY_ADAPTER` | 2 | `CANON-AVG-INTENT-ACC` (wraps the Voice API's own opaque field) and `CANON-CALL-TECH-PERF` (wraps the existing, real per-agent correlation in `agentPerformanceAggregator.ts`) |
| `CMA_NON_AGGREGATE` | 5 | `CANON-SENT` (distribution), `CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY` (record lookup), the 3 QA Calibration measures (paired comparisons) — each backed by a real new RPC, not a placeholder |
| `CMA_UNAVAILABLE` | 25 | No real source data or formula exists anywhere in this system — each with its own specific, previously-documented reason (`cmaOwnershipRegistry.ts` carries the reason inline, not only in a separate doc) |

25 + 3 + 2 + 5 + 25 = 60. Confirmed by a live script against production
(`.tooling/scripts/session10-ownership-verify.mjs`) — every one of the 60 ids resolved
with no exception and a well-formed result.

**The "9 must have a genuine path" requirement** (the 6 `CMA_NON_AGGREGATE`... actually
5, since `CANON-AVG-INTENT-ACC` was reclassified to `CMA_LEGACY_ADAPTER` on closer
inspection — it is a pure upstream passthrough, not a lookup/distribution/comparison
shape — plus the 3 mock + the 2 legacy adapters) was independently exercised live
(`.tooling/scripts/session10-live-paths-verify.mjs`): every one returned a real,
structured result from a real query, not a static label. One genuine bug was found and
fixed in the process — the intent-accuracy legacy adapter sent a full ISO timestamp to
an endpoint that expects `YYYY-MM-DD`, causing a 400; fixed, now returns a real value
(87.7%, matching the figure already visible on Call Logs).

## FCR-03 / ESC-03 / AHT-03 — completed, not re-verified from scratch

Session 9's exact candidate SQL (`cmaCandidateAlgorithms9.ts`, migration
`20261021032800_cma_fcr_esc_aht_candidates.sql`, re-validated in disposable PostgreSQL
this session before applying) is now live in production. Because `evaluateCmaMeasure()`
still short-circuits any `pending_decision` measure before reaching the algorithm
registry (by design — this is the exact mechanism that keeps an unapproved formula from
ever being served through the normal governed path), these 3 ids are served through a
**separate, explicit bypass** inside `cmaOwnershipResolver.ts`'s
`evaluateProvisionalMeasure()` — reusing the same scope/dimension checks and the same
RPC, but never touching `evaluateCmaMeasure()`'s own governance gate. This is the
"documented, auditable transition" the brief asked for: governance status in the
database stays exactly `pending_decision` (no silent rewrite of the historical
register — confirmed unchanged, live), and the ownership layer is the only place that
knows to route around it, tagged `CMA_PROVISIONAL` with `accuracyStatus: 'unverified'`
end to end.

## Screen centralization

Every screen below previously ran its own calculation independently of CMA for at
least one of these 6 ratio ids (`resolution_rate`, `successful_resolution_time`,
`authentication_success_rate`, `fcr`, `escalation_rate`, `aht`). All are now routed
through CMA for any viewer holding `cma.evaluate`; everyone else keeps the exact prior
legacy-sourced display — never a 403, never two competing numbers shown at once.

| Screen | What changed | Verified |
|---|---|---|
| **Dashboard** (`Dashboard.tsx`) | `CMA_PROVISIONAL_RATIO_MEASURES` map added alongside the existing native map; FCR/Escalation Rate Performance-Ratio tiles and the Live Operations "Avg handle time" tile all now source from CMA | Live, browser-confirmed: both tiles show a "PROVISIONAL" badge |
| **Call Logs** (`CallLogs.tsx`) | The summary strip's FCR/Escalation/AHT/Intent-accuracy now come from `useCmaOwnedMeasure`, replacing `api/calls/data.ts`'s local re-derivation and the opaque Voice-API passthrough entirely for CMA-eligible viewers | Live, browser-confirmed: Escalation rate now reads **85.9%**, up from the historical legacy figure of 57.3% seen earlier this session before this work — the exact, real-world manifestation of the documented all-calls-vs-handled-only discrepancy, now corrected |
| **Agent Detail** (`useAgentDetail.ts`/`AgentDetail.tsx`) | FCR and Avg handle time (voice) tiles now source from CMA (agent-scoped, same window as the existing sentiment/intent-confidence tiles); Technical Performance section explicitly labeled "(CMA legacy adapter)" since it IS CMA's designated delivery for `CANON-CALL-TECH-PERF`, not a parallel calculation | Typecheck/build clean; not re-verified live in browser this session (time) |
| **Ratio Explorer** (`RatioExplorer.tsx`) | The hero/summary number for the 6 CMA-eligible ratio ids now sources from CMA whenever no breakdown/driver/compare/domain/intent/direction filter is active (CMA has no equivalent for those — see Deferred); falls back to the legacy summary exactly when a filter CMA can't honor is present | Typecheck/build clean; not re-verified live in browser this session (time) |
| **Govern → CMA Measures** (`CmaMeasures.tsx`, new) | Full read-only register of all 60 measures: 10 independent summary counts, a filterable/sortable table, and a detail dialog with on-demand "Evaluate now" | Live, browser-confirmed end to end: summary counts match the live script exactly (60/25/3/2/25/5/22/5/4/25), detail dialog renders correctly, on-demand live evaluation returned a real value (199 for Action Required Queue Items), keyboard navigation (Tab + Enter) opens the dialog correctly |

### Deferred, with real reasons (not silently skipped)

- **Ratio Explorer's trend/breakdown/driver/comparison views** stay legacy-sourced for
  every ratio, including the 3 already-native ones. This is a genuine, structural gap
  that predates this session: CMA's evaluation engine returns a single population
  snapshot for a requested window, never a time series or an arbitrary-dimension
  drill-down (`intent`, `escalation_reason`, period-over-period comparison). Building
  that capability into CMA would be a real engine extension — explicitly out of scope
  ("do not rebuild CMA").
- **Analytics** (Overview/Voice/Chat tabs) were not wired this session — confirmed
  still 100% external-API-sourced with the documented, pre-existing Agent-Scope gap
  (Session 14.3). `CANON-AVG-INTENT-ACC`'s legacy adapter already demonstrates the
  intended pattern (unrestricted viewers get the real value; scoped viewers get an
  honest unavailable result, never an unscoped number); extending this to Analytics'
  remaining tiles is a mechanical follow-up, not attempted here for time.
- **Customer 360, AI Agents roster, NPS Campaigns, Live View, Chat-related views**:
  investigated, no genuine independent business-measure calculation found that CMA
  doesn't already own (Customer 360's population-level `CUST360-*` measures remain
  correctly unconsumed by any screen, per Session 8.1's own deliberate design; NPS
  Campaigns already shows its `mock`-governed indicator as such).

## Data scope and security

- Every new RPC (`call_center_cma_sentiment_distribution`,
  `call_center_cma_corrective_action_lookup`, `call_center_cma_qa_calibration_paired`)
  enforces Agent Scope itself, server-side, the same fail-closed pattern as every
  existing CMA RPC — confirmed live: an empty authorized-agent-ids array returns a
  zero population, never an unrestricted result.
- `CANON-AVG-INTENT-ACC`'s legacy adapter explicitly refuses to serve a value to a
  scoped caller rather than handing back the upstream endpoint's unscoped global
  number — the brief's own "do not present a global number as scoped" instruction,
  applied concretely.
- NORMAL/TEST dataset isolation: the 3 new non-aggregate RPCs accept the same
  `p_dataset_id` predicate as every existing RPC; the Session 9/10 FCR-03/ESC-03/AHT-03
  path reuses the unchanged `call_center_cma_evaluate_measure` RPC's own isolation.
- No role grant was changed. No permission key was added — the new CMA Measures page
  reuses the existing `cma.evaluate` permission (already granted to
  administrator/analyst/read_only/supervisor).

## Tests and verification

- `npm run typecheck` / `npm run verify:full` / `npm run build` — all clean throughout,
  checked after every meaningful change rather than only at the end; 0 regressions in
  any existing suite.
- Both new migrations validated in disposable PostgreSQL (full schema replicated from
  live `information_schema.columns`, fully torn down afterward) before being applied to
  production.
- `.tooling/scripts/session10-ownership-verify.mjs` — all 60 canonical ids resolve
  through `resolveCmaMeasure()`, confirmed live against production.
- `.tooling/scripts/session10-live-paths-verify.mjs` — all 9 "must have a genuine
  path" measures exercised live, including the corrective-action record lookup with a
  real id (confirmed separately via direct SQL after the script's own PostgREST-schema
  limitation caused a false skip — the underlying RPC itself was always correct).
- Production regression checks: real population (761 voice rows) and synthetic
  population (350 voice rows) both confirmed unchanged by this session's work; an
  existing Session 8 RPC (`call_center_cma_evaluate_customer_measure`) re-checked and
  confirmed byte-identical to its Session 9 baseline result.
- Real browser verification against the deployed production app (Dashboard, Call Logs,
  CMA Measures — detail dialog, on-demand evaluation, keyboard navigation). Agent
  Detail and Ratio Explorer were verified by typecheck/build only, not live browser,
  disclosed honestly rather than claimed.

## HIG review (not a mandatory gate for this project, per standing preference)

A single read-only review pass was run to clear this repository's pre-commit hook
(unrelated to this session's own development process). It found one genuine, real
accessibility defect in the new CMA Measures page — table rows were clickable but not
keyboard-operable — plus two smaller issues (a missing focus-visible state, no retry
affordance on a failed fetch) and one cosmetic badge-color collision. All four were
fixed directly before committing; confirmed live in the browser afterward (Tab reaches
a row with a visible focus ring, Enter opens the dialog).

## Deployment

Committed (`2ff2394`) and pushed to `main`. Vercel deployment confirmed `Ready`,
correctly aliased to all three existing domains, function count unchanged at 12 (no new
top-level `api/*.ts` file — the new routes extend the existing `api/admin.ts`
dispatcher).

## Final acceptance criteria — status

1. All 60 measures have a CMA-owned canonical identity — ✅
2. All 60 resolve through CMA with a value or an explicit governed status — ✅ (live-verified)
3. No existing screen independently calculates a competing business measure for the 6
   now-CMA-eligible ratio ids — ✅ for Dashboard/Call Logs/Agent Detail/Ratio Explorer's
   headline numbers; Analytics' remaining tiles are a disclosed, real follow-up (see
   Deferred)
4. FCR, Escalation Rate, AHT served through CMA — ✅
5. Existing 22 operational calculations remain correct — ✅ (regression-checked)
6. Accuracy, authority, and deployment status separately visible per measure — ✅ (CMA
   Measures page, never a combined score)
7. Every actual screen measure occurrence mapped — ✅ for the occurrences this session
   found and fixed; the Ratio Explorer trend/breakdown/driver gap and Analytics are
   named, not hidden
8. Business Data Scope and NORMAL/TEST isolation remain enforced — ✅
9. Govern → CMA Measures implemented — ✅
10. Deployment verified on the active POC — ✅

Session 10 complete. No further CMA phase was started, per the brief's own final
instruction.
