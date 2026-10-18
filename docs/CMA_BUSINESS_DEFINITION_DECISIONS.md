# CMA Business Definition Decisions — the 4 Pending Measures

**For business approval. Not approved or activated by this session** — all four remain
`governed_algorithm_status = 'pending_decision'` in production, unchanged. This document presents
the competing definitions, the numerical evidence already gathered (this project's own prior
sessions, not fabricated for this document), and a recommendation for each — the decision itself
belongs to the business, per brief §4/§10.

---

## 1. First Contact Resolution (`CANON-FIRST-CONTACT-RES`)

### Competing implementations (6 found, register IDs `FCR-01`..`FCR-06`)

| ID | Source | Population | Zero-denom | Verified against ground truth? |
|---|---|---|---|---|
| FCR-01 | Upstream Voice API passthrough (unscoped callers) | upstream-opaque | n/a | **Discrepancy found** (minor): displayed 13.4% vs. true 13.1% over the full 756-row population — the upstream `total_calls` figure itself undercounts 19 of the 756 real rows its own pagination serves. Root cause unknown (upstream-opaque). |
| FCR-02 | `api/calls/data.ts` scoped recompute | current page only | **0%** (never null) | Not independently re-verified live (only exercised for non-admin scoped callers). |
| **FCR-03** | **Ratio Explorer/Dashboard canonical engine** (`ratioMath.ts computeFcr()`) | **complete window population** | **null** (never fabricated) | **PASS — exact match** against raw rows (15.3% = 20/131 for the verified 30-day window). |
| FCR-04 | Per-agent aggregator | agent's loaded page | null | Not independently re-verified (page-limited by design). |
| FCR-05 | Analytics global snapshot, 4th independent upstream endpoint | all-access only | n/a | Not independently re-verified; upstream-opaque. |
| FCR-06 | Analytics scoped sample | up to 100 rows | null | Reuses FCR-04's own formula unchanged — not a 7th independent definition. |

### Recommendation

**Adopt FCR-03's definition as canonical**: complete window population, `count(fcr=true) /
count(all fetched calls)`, zero-denominator → `null`. It is the only implementation with a
verified, exact match against raw ground truth. The upstream passthrough (FCR-01/FCR-05) has a
confirmed, if modest, discrepancy with an unknown root cause outside this codebase's control —
recommend it never be presented as authoritative once a canonical definition is approved.

---

## 2. Escalation Rate (`CANON-ESC-RATE`)

### Competing implementations (4 found, register IDs `ESC-01`..`ESC-04`)

| ID | Source | Denominator | Verified against ground truth? |
|---|---|---|---|
| ESC-01 | Upstream Voice API passthrough (Call Logs header, Live View) | upstream-opaque | **Materially wrong** — displayed 57.7% vs. an independently recounted **83.9%** over the identical 756-row population (full re-pagination of the exact same endpoint). A ~26-percentage-point understatement. A hypothesis that upstream only counts escalations with a recorded trigger reason was tested and rejected (only 38 of 634 real escalated rows have a trigger). **Root cause unknown — lives entirely inside the external Voice API.** This is the single most material finding of this whole measure-reconciliation effort. |
| ESC-02 | `api/calls/data.ts` scoped recompute | **every** call (including indeterminate outcome) | Not independently re-verified live. |
| **ESC-03** | **Ratio Explorer/Dashboard canonical engine** | **"handled" calls only** (`resolved` or `escalated`; indeterminate outcomes excluded) | **PASS — exact match**, 84.5% (109/129), and independently corroborates the 83.9% full-population recount that flagged ESC-01 as wrong. |
| ESC-04 | Analytics global snapshot, different upstream endpoint | upstream-opaque | Not independently re-verified. |

### Recommendation

**Adopt ESC-03's definition as canonical**: complete window population, denominator restricted to
calls with a determinate (`resolved`/`escalated`) outcome, zero-denominator → `null`. This is the
highest-priority of the four decisions — **the current unscoped upstream passthrough that Call
Logs and Live View actually display today is demonstrably wrong by a wide margin**, confirmed by
two independent methods (full-row recount and the canonical ratio engine) that agree closely with
each other and disagree sharply with what is shown on screen. Recommend: (a) adopt ESC-03's
definition as canonical, (b) report the upstream discrepancy to whoever owns the Voice API backend,
since this codebase cannot fix a bug inside an external system, and (c) consider whether Call
Logs/Live View should stop using the unscoped passthrough for this one field even before a full
CMA migration, given the magnitude of the error.

---

## 3. Average Handle Time (`CANON-AVG-HANDLE-TIME`)

### Competing implementations (6 found, register IDs `AHT-01`..`AHT-06`)

| ID | Source | Stale-duration (~4h) guard | Verified against ground truth? |
|---|---|---|---|
| AHT-01 | Upstream Voice API passthrough | none documented | **Discrepancy found** (minor): displayed 55s vs. true mean 52.2s over the full 756-row population. No stale/multi-hour outlier rows exist in the current dataset (max observed duration 586s), so the gap is not explained by AHT-02's own documented missing-guard caveat — root cause unknown, upstream-opaque. |
| AHT-02 | `api/calls/data.ts` scoped recompute | **no** | Not independently re-verified live. A single multi-hour dirty row could skew this figure unlike AHT-03/04. |
| **AHT-03** | **Ratio Explorer/Dashboard canonical engine** | **yes** (excludes durations ≥ 14400s) | **PASS — exact match**, 24s over the verified 30-day/131-row window. |
| AHT-04 | Per-agent aggregator | yes (agrees with AHT-03's rule) | Not independently re-verified (page-limited by design), but methodologically consistent with AHT-03. |
| AHT-05 | Analytics global snapshot, different upstream endpoint | none documented | Not independently re-verified; upstream-opaque. |
| AHT-06 | Analytics scoped sample | yes | Reuses AHT-04's own formula unchanged — not a 6th independent definition. |

### Recommendation

**Adopt AHT-03's definition as canonical**: complete window population, mean `duration_seconds`
over calls with a finite, non-stale (< 14400s / ~4h) duration, zero-denominator → `null`. Verified
exact against ground truth; the stale-duration guard is a real, deliberate correctness rule (a
single corrupted multi-hour duration should never silently distort an average), and three of the
six implementations (AHT-03/04/06) already independently agree on it.

---

## 4. Call Technical Performance (`CANON-CALL-TECH-PERF`)

### What actually exists (register IDs `TECHPERF-01`, `TECHPERF-02`) — a different situation from
the other three

Unlike FCR/Escalation Rate/AHT, this is **not three-or-more implementations disagreeing on a
formula for the same business concept** — it is **two implementations at two different grains of
the same underlying latency facts**, which is why this measure is governed `pending_decision`
rather than `decided`: no one has yet recorded whether the per-agent average is the "real" canonical
measure or merely a derived view of the per-call facts.

| ID | Grain | What it computes |
|---|---|---|
| TECHPERF-01 | **Per call** | The real, per-call Voice pipeline latency breakdown (turn/STT/LLM-TTFT/LLM/TTS-TTFB/orchestrator/tool/RAG), sourced directly from `GET /api/v1/analytics/call-metrics`, correlated by `call_sid`. This is the raw, authoritative fact. |
| TECHPERF-02 | **Per agent** | The mean of each component across all of one agent's calls matched to a Call Metrics row (`agentPerformanceAggregator.ts computeAgentCallTechnicalPerformance`), excluding calls with no matching metrics row. |

Both read from the same real source (`GET /api/v1/analytics/call-metrics`) — there is no conflicting
upstream-opaque passthrough or population-mismatch finding here, unlike the other three measures.

### Recommendation

**TECHPERF-01 (the per-call latency breakdown) is the canonical, authoritative fact-level
definition.** TECHPERF-02 (the per-agent average) is not a competing definition but a **derived
aggregate of the same facts at a coarser grain** — exactly the shape `groupBy: 'agent'` already
produces for every other measure in this evaluation engine (e.g. `CANON-AVG-SENT-SCORE` grouped by
agent). Recommend resolving this to `decided`, with `TECHPERF-01` as the governed per-call
definition and the per-agent view expressed as this same measure evaluated with `groupBy: 'agent'`,
not as a second, independently-maintained formula. This is the simplest of the four decisions and
does not require reconciling a genuine numerical disagreement — only recording the grain
relationship that already holds in the real code.

---

## 5. Numerical consequences of approving these recommendations

If the above four recommendations are approved and implemented through this evaluation engine
(not done by this session):
- **Escalation Rate** would change from the ~57.7% currently shown on Call Logs/Live View to the
  verified ~83.9–84.5% figure — a large, user-visible change that should be communicated before
  activation, not silently swapped.
- **FCR** and **AHT** would change by smaller amounts (≈0.3pp and ≈3s respectively, at the time of
  the last verification pass) — modest but real corrections.
- **Call Technical Performance** would see no numerical change — only a governance-status change
  (the existing per-call facts become "canonical," the per-agent view becomes an explicit
  `groupBy` of them rather than a second formula).

## 6. What this session did NOT do

Per brief §4/§10: no `governed_algorithm_status` was changed for any of these four measures in
production (confirmed still `pending_decision` before and after this session, §2 of
`docs/SESSION_CMA_3B_CALCULATION_CATALOGUE.md`). No calculation for any of them was activated
through the evaluation engine — `CMA_ALGORITHM_REGISTRY` deliberately contains no entry for
`CANON-FIRST-CONTACT-RES`, `CANON-ESC-RATE`, `CANON-AVG-HANDLE-TIME`, or `CANON-CALL-TECH-PERF`, so
requesting any of them returns `{ kind: 'not_yet_governed' }`, never a calculated value.
