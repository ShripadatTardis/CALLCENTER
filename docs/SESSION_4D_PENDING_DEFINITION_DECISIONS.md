# Session 4D — Pending Business Definition Decisions (for approval)

Condensed from `docs/CMA_BUSINESS_DEFINITION_DECISIONS.md`'s full analysis
into a short decision table, per this session's brief. **No governance
status was changed.** All four measures remain `pending_decision` in
production, exactly as before this session.

| Measure | Proposed definition | Eligible population | Numerator / Denominator | Source facts | Expected user-visible impact | Remaining ambiguity |
|---|---|---|---|---|---|---|
| **First Contact Resolution** (`CANON-FIRST-CONTACT-RES`) | Adopt **FCR-03** (Ratio Explorer/Dashboard canonical engine) | Every call in the window | Numerator = calls with `fcr=true`; Denominator = all fetched calls in window | `customer_interactions.fcr` | Small — ≈0.3 percentage points different from what's shown today | None — FCR-03 is the only implementation with a verified exact match against raw ground truth |
| **Escalation Rate** (`CANON-ESC-RATE`) | Adopt **ESC-03** (Ratio Explorer/Dashboard canonical engine) | Calls with a determinate outcome only (`resolved` or `escalated`; indeterminate excluded) | Numerator = `outcome='escalated'`; Denominator = determinate-outcome calls | `customer_interactions.outcome` | **Large** — would change from ~57.7% (current upstream passthrough shown on Call Logs/Live View) to ~83.9–84.5% (verified by two independent methods). This is a real, user-visible jump that needs to be communicated before activation, not silently swapped | **Highest-priority finding of this whole effort.** The current on-screen figure is demonstrably wrong by ~26 points; root cause is inside the external Voice API, outside this codebase's control — recommend reporting it to whoever owns that backend regardless of this decision's timeline |
| **Average Handle Time** (`CANON-AVG-HANDLE-TIME`) | Adopt **AHT-03** (Ratio Explorer/Dashboard canonical engine) | Calls with a finite, non-stale duration (< 14,400s / ~4h) | Numerator = sum(`duration_seconds`) over eligible calls; Denominator = count of eligible calls (mean) | `customer_interactions.duration_seconds` | Small — ≈3 seconds different from what's shown today | None — verified exact match; 3 of the 6 competing implementations already independently agree on the stale-duration exclusion rule |
| **Call Technical Performance** (`CANON-CALL-TECH-PERF`) | Adopt **TECHPERF-01** (per-call latency breakdown) as the canonical fact-level definition; the per-agent average becomes this same measure evaluated with `groupBy:'agent'`, not a second formula | Calls with a correlated Call Metrics row | n/a (a latency breakdown, not a ratio) — turn/STT/LLM-TTFT/LLM/TTS-TTFB/orchestrator/tool/RAG timings | `GET /api/v1/analytics/call-metrics`, correlated by `call_sid` | **None numerically** — both existing implementations already read the same source; this is a governance-status change only (recording that the per-agent view is a derived grouping, not a competing definition) | Simplest of the four — no genuine numerical disagreement to resolve, only the grain relationship to record |

## What approval would actually change

- Escalation Rate: a large, real, user-visible number change on Call Logs/Live View/Dashboard — needs a communication plan, not a silent activation.
- FCR / AHT: small corrections, low risk to communicate.
- Call Technical Performance: no numbers change; only becomes queryable through the governed evaluation engine (currently blocked entirely — `CMA_ALGORITHM_REGISTRY` has no entry for any of these 4 ids, so all four return `{kind:'not_yet_governed'}` today, never a calculated value).

## Decision needed

For each of the 4 rows: approve the proposed definition as canonical, or provide an alternative. This session implemented none of them — approval would be a separate, future activation step (adding entries to `CMA_ALGORITHM_REGISTRY` and a production migration), not something this document triggers automatically.
