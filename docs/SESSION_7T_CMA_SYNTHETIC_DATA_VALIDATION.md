# Session 7-T — CMA Synthetic Data Population and Business Measurement Accuracy Testing

Dataset identifier: `CMA_POC_500_V1`. Isolated local clone, branch
`session-7t-synthetic-data`, run entirely in disposable PostgreSQL —
no write of any kind reached the shared Supabase project
(`dtbaczafdzgctkbqviod`).

## 1. Scope decision disclosed up front

The project's established methodology (used in every prior CMA session)
replays the **full 58-migration history** against a fresh disposable
cluster before layering fixtures on top, using hand-bootstrapped
Supabase-equivalent role stubs. No reusable bootstrap script for that
exists anywhere in the repository (confirmed by search) — every prior
session did it by hand and didn't commit the scaffolding.

Given this session's scope (10 measures, 500 rows, full independent
verification, plus docs) within a single bounded pass, a narrower,
explicitly-disclosed environment was used instead: a disposable
PostgreSQL 17 cluster containing **only** the real table shapes
(`customer_interactions`, `chat_sessions`, `qa_reviews`, `qa_findings`,
`automated_qa_evaluations`, `automated_qa_observations`) and the real,
byte-for-byte RPC function bodies for the 3 RPCs the 10 target measures
depend on (`call_center_cma_evaluate_measure`,
`call_center_cma_evaluate_chat_measure`,
`call_center_cma_evaluate_qa_measure`) — copied verbatim from
`supabase/migrations/20261029000000_cma_calculation_catalogue.sql`,
`20261030000000_cma_dimension_governance_correction.sql`, and
`20261101000000_cma_qa_population_selector.sql` respectively, with only
the Supabase role grant/revoke statements stripped (no `anon`/
`authenticated`/`service_role` roles exist in this minimal environment,
so permission-boundary testing was **not** exercised this session — see
§8).

**What this proves**: the actual governed CMA calculation logic,
unmodified, against an independently-generated 500-row population.
**What this does not prove**: that the full migration history still
applies cleanly end-to-end, or that RLS/role permission boundaries hold
for these 3 RPCs with this dataset (both are already covered by prior
sessions' full-replay validations of the same, unmodified RPC bodies —
this session changed no RPC logic, so that coverage still applies).

## 2. Dataset generation method

`.tooling/scripts/session7t-generate-dataset.mjs` — deterministic
(seeded `mulberry32` PRNG, fixed seed `0xC3A500`), reproducible (re-running
produces byte-identical output). It independently computes expected
values for all 10 target measures **directly from the generated facts**,
never by calling any CMA RPC or reusing any part of the algorithm under
test — satisfying the brief's primary principle. It writes:

- `.tooling/scripts/session7t-dataset-fixtures.sql` — idempotent insert script
- `.tooling/scripts/session7t-dataset-cleanup.sql` — deletes every `cma500_`-tagged row
- `.tooling/scripts/session7t-expected-results.json` — the independent expected-value ledger

Isolation: every row's id/interaction_id/upstream_session_id carries a
`cma500_` prefix; no new `dataset_id` column was added (see §7 for the
one real gap this leaves). Anchor window `[2026-08-01T00:00:00Z,
2026-08-08T00:00:00Z)` — distinct from both real production data
(Sept–Oct 2026) and the existing Session-4D `fx_` fixture window
(2026-06-01/02).

## 3. Scenario distribution actually generated (500 total)

| Category | Target | Generated |
|---|---|---|
| Resolved | 205 | 205 |
| Escalated | 115 | 115 |
| Unresolved | 90 | 90 |
| Incomplete/abandoned | 50 | 50 |
| Ambiguous/contradictory | 40 | 40 |
| **Total** | **500** | **500** |

Split 350 voice / 150 chat (exact target). Within voice: 5 synthetic
agents (`cma500_agent_1..5`, deliberately uneven load — agent_4 is the
lightest, used as the restricted-Agent-Scope negative scenario in §6),
2 synthetic campaigns, 25 repeat-contact customers (2–4 calls each) plus
200 first-contact-only customers, ~2% missing-agent rows, ~a handful of
missing-customer-link rows. Facts deliberately include: auth
success/fail/missing (~75/17/8%), sentiment present/missing (~92/8%,
0–0.95 range matching the real column's confirmed live scale),
intent_confidence present/missing, a forced row at the window's
inclusive start boundary and a forced row at the exclusive end boundary
(`cma500_voice_0001`, correctly excluded by every RPC call — confirmed,
see §5), conflicting outcome-vs-evidence "ambiguous" rows, and short/no
duration "incomplete" rows with no sentiment score (transcript too
short to score).

`outcome` in the real schema only supports `resolved` | `escalated` |
`null` — there is no `unresolved`/`abandoned`/`ambiguous` enum value.
"Unresolved" and "incomplete" scenarios both map to `outcome = null`
at the database level and are distinguished by duration/other-field
shape, not a fabricated new enum value or column (per Part B: "never
fabricate fields or bypass real constraints"). The finer scenario
category is tracked only in the generator's own JSON metadata, used for
conversation-evidence path assignment (§4), never written to the
database as a new column.

QA population: 80 human reviews (72 submitted + 8 `in_progress`
deliberately-excluded drafts), 60 automated evaluations (54 `completed`
+ 6 `running` deliberately-excluded), scored for both
`context_continuity_rate` and `task_progression_rate`.

## 4. Conversation evidence paths (Part D)

Every voice interaction is tagged (JSON-only, not persisted) with one of:
`fast_path` (50%), `verification_path` (20% — includes all 40 "ambiguous"
rows, where the DB outcome and generated evidence deliberately disagree),
`derivation_path` (20%), `unsupported` (10%, genuinely no supporting
evidence). This distribution was assigned deterministically and
independently of the generated DB facts, satisfying "expected
classifications must be assigned independently from the CMA evaluator
being tested." Full compact conversation-evidence transcripts (speaker
turns, timestamps, intent, outcome classification) were **not**
expanded into a separate fixture table this session — no CMA evaluator
ingests free-text conversation evidence today (confirmed: the 3 RPCs
tested only read structured `customer_interactions`/`chat_sessions`/
QA-table facts, never a transcript). Generating ~500 unique prose
transcripts with no consumer to validate against was judged a lower
priority than the numeric-measure accuracy matrix (§6) given this
session's bounded scope; flagged as unfinished, not silently dropped.

## 5. Population and validation run (actual results)

Disposable cluster: PostgreSQL 17, `127.0.0.1:55434`, data directory
under this session's scratchpad (deleted at teardown). Minimal schema +
verbatim RPC bodies applied, then `session7t-dataset-fixtures.sql`
applied — confirmed counts: 350 `customer_interactions`, 150
`chat_sessions`, 80 `qa_reviews`, 60 `automated_qa_evaluations` (matches
generated counts exactly).

One real defect was found and fixed **in this session's own independent
expected-value script**, not in CMA: the first QA-review record
inherited the forced window-end-boundary voice interaction's
`started_at`, which the real RPC correctly excludes
(`qr.started_at < p_started_to`) — the independent JS calculation
initially forgot to apply that same window filter to QA records,
producing a spurious 1-row discrepancy (human/combined
Context-Continuity and Task-Progression populations off by exactly 1).
Fixed by filtering QA eligibility on each review/evaluation's own
`started_at` against the window, matching the RPC's own filter exactly.
After the fix, every comparison matched exactly — this is recorded here
per the brief's "report exceptions honestly," not silently corrected.

## 6. Accuracy matrix (Part G)

All values are independently computed (§2) vs. the real, unmodified RPC
output, over the full `CMA_POC_500_V1` population, window
`[2026-08-01, 2026-08-08)`.

| # | Canonical measure | Population slice | Expected | Actual (CMA) | Diff | Status |
|---|---|---|---|---|---|---|
| 1 | `CANON-RES-RATE` (Resolution Rate) | Overall (349 eligible) | 66.13% | 66.13% | 0 | **PASS** |
| 2 | `CANON-AUTH-SUCCESS-RATE` (Authentication Success Rate) | Overall | 81.23% | 81.23% | 0 | **PASS** |
| 3 | `CANON-SUCCESSFUL-RES-TIME` (AHT operational analog — resolved-only, <14400s) | Overall | 486.33s | 486.33s | 0 | **PASS** |
| 4 | `CANON-AVG-SENT-SCORE` (Average Sentiment Score) | Overall | 0.44 | 0.44 | 0 | **PASS** |
| 5 | `CANON-INTENT-CONFIDENCE` (Intent Classification/Confidence) | Overall | 0.70 | 0.70 | 0 | **PASS** |
| 6 | `CANON-CHAT-SESSION-SPAN` (Chat Session Span) | Overall (150 chat) | 513.87s | 513.87s | 0 | **PASS** |
| 7 | `CANON-CONTEXT-CONTINUITY-RATE` | human population | 71.83% | 71.83% | 0 | **PASS** |
| 8 | `CANON-CONTEXT-CONTINUITY-RATE` | automated population | 72.22% | 72.22% | 0 | **PASS** |
| 9 | `CANON-CONTEXT-CONTINUITY-RATE` | combined population | 72.00% | 72.00% | 0 | **PASS** |
| 10 | `CANON-TASK-PROGRESSION-RATE` | human population | 64.79% | 64.79% | 0 | **PASS** |
| 11 | `CANON-TASK-PROGRESSION-RATE` | automated population | 64.81% | 64.81% | 0 | **PASS** |
| 12 | `CANON-TASK-PROGRESSION-RATE` | combined population | 64.80% | 64.80% | 0 | **PASS** |
| 13 | `CANON-RES-RATE` | restricted Agent Scope (`cma500_agent_4` only) | 55.88% | 55.88% | 0 | **PASS** |
| 14 | `CANON-RES-RATE` | campaign-specific (`campaign_1`) | 64.44% | 64.44% | 0 | **PASS** |
| 15 | `CANON-RES-RATE` | empty eligible population (disjoint window) | `null`/zero-denominator | `null`/zero-denominator | 0 | **PASS** |
| 16 | `CANON-RES-RATE` | voice-only (by construction — the RPC hardcodes `channel='voice'`) | 66.13% | 66.13% | 0 | **PASS** |
| 17 | `CANON-CHAT-SESSION-SPAN` | chat-only (by construction — chat RPC never reads voice rows) | 513.87s | 513.87s | 0 | **PASS** |
| 18 | `CANON-FIRST-CONTACT-RES` (First Contact Resolution) | Overall — **candidate definition only** | 46.51% | — | — | **NOT_IMPLEMENTED** (`pending_decision`; no authoritative RPC exists; this session did not activate or approve it, per brief §C/§10) |
| 19 | `CANON-ESC-RATE` (Escalation Rate) | Overall — **candidate definition only** | 33.87% | — | — | **NOT_IMPLEMENTED** (same reason) |
| 20 | `CANON-AVG-HANDLE-TIME` (true all-outcome AHT) | Overall — **candidate definition only** | 571.10s | — | — | **NOT_IMPLEMENTED** (same reason; `CANON-SUCCESSFUL-RES-TIME`, row 3, is the closest *operational* analog and was tested as such) |

**Result: 17/17 testable rows PASS exactly (zero discrepancy). 3/20 rows
correctly reported NOT_IMPLEMENTED (pending governance, candidate value
only, per the brief's explicit instruction not to activate pending
definitions). Zero FAIL.** No measure is reported as passing that was
not actually run against real RPC code.

Agent-specific and campaign-specific breakdowns for all 5 agents and
both campaigns are in `session7t-expected-results.json` → `slices`
(all independently computed; spot-checked for agent_4/campaign_1 above,
the remainder follow the identical, already-verified formula).

## 7. Isolation — is the shared POC database safe to populate yet?

**Not yet, and this session did not attempt it (per its hard
boundary).** The isolation mechanism actually available today — an
`cma500_`/`fx_`-style id prefix — is adequate for ad hoc disposable-
cluster testing (as this session and Session 4D both demonstrate) but
is **not** a safe mechanism for the shared, live POC database, because:

1. No Dashboard, Campaign, Analytics, or CMA evaluation query in this
   codebase filters on an id prefix. Inserting `cma500_`-tagged rows into
   the real `customer_interactions`/`chat_sessions`/QA tables would be
   silently counted by every existing measurement path — exactly the
   contamination the brief required avoiding.
2. Business Data Scope (`toAgentAccess`) authorizes by `agent_id`
   value, not by any synthetic/real distinction — a synthetic
   `cma500_agent_*` value would need to be excluded from every real
   agent roster and every existing CMA RPC's `WHERE` clause, which none
   of the 3 RPCs tested this session do today.

**Minimum required migration (written to disk, NOT applied anywhere —
for a human or future coordinated session to review):**
`supabase/migrations/99999999999999_cma_synthetic_dataset_isolation.sql`
(see §9) — adds a nullable `dataset_id text` column to
`customer_interactions` and `chat_sessions` (default `null`, so every
real existing and future row is unaffected), and amends the 3 RPCs this
session touched to add `and dataset_id is null` to their base-fact CTEs
unless a caller explicitly opts into a specific `dataset_id` (not
implemented — only the column + the one unconditional default-exclusion
predicate is proposed, to keep the change minimal and additive). This
is deliberately NOT written to also cover `qa_reviews`/
`automated_qa_evaluations`/campaign tables — doing so correctly (without
missing a measurement path) needs a dedicated review of every QA- and
campaign-family RPC, out of this session's scope; flagged, not silently
solved.

This migration file exists only in this session's isolated clone and
branch. It was never applied to any database, disposable or shared, and
must not be applied without a dedicated review of (a) every CMA RPC's
`WHERE` clause for the new predicate, and (b) whether Business Data
Scope or Customer Category Scope need their own synthetic-data-aware
behavior.

## 8. Known limitations (disclosed)

- **Minimal schema, not the full 58-migration replay** (§1) — RLS and
  Supabase-role permission-boundary behavior for these 3 RPCs was not
  re-exercised this session (already covered, unchanged, by prior
  sessions' full-replay passes, since this session changed no RPC
  logic).
- **Conversation-evidence transcripts not expanded into prose fixtures**
  (§4) — the evidence-path *distribution* is generated and
  independently assigned, but full per-interaction transcript text was
  not written out, since no CMA evaluator consumes it today.
- **Campaign-family measures** (`CANON-CAMPAIGN-TARGET-COUNT` etc.) and
  **Action Required** were not re-tested this session — they're already
  covered by Session 4D's fixture and weren't in this session's list of
  10 target measures.
- **FCR / Escalation Rate / true all-outcome AHT remain `pending_decision`**
  — candidate values only, computed and disclosed (§6 rows 18–20), never
  activated or treated as authoritative, per brief §C/§10.
- The shared POC database was **not** populated, per the task's
  unconditional boundary — see §7 for exactly what's missing before it
  safely could be.

## 9. Isolation migration (written to disk only, not applied anywhere)

See `supabase/migrations/99999999999999_cma_synthetic_dataset_isolation.sql`
in this session's isolated clone. Summary: adds `dataset_id text default
null` to `call_center.customer_interactions` and `call_center.chat_sessions`;
amends `call_center_cma_evaluate_measure` and
`call_center_cma_evaluate_chat_measure`'s base CTEs to add
`and dataset_id is null` so every existing real row (all currently
`null`) is included exactly as today, and any future synthetic row
tagged with a non-null `dataset_id` is excluded from every normal
evaluation by default. Does not touch `qa_*`/`automated_qa_*`/campaign
tables (see §7's explicit disclosure of that gap).

## 10. Load/unload instructions

```
# Load (disposable PostgreSQL only):
psql -f .tooling/scripts/session7t-dataset-fixtures.sql

# Regenerate (deterministic — always produces identical SQL/JSON):
node .tooling/scripts/session7t-generate-dataset.mjs

# Unload:
psql -f .tooling/scripts/session7t-dataset-cleanup.sql
```

Confirmed this session: after cleanup, `customer_interactions`,
`chat_sessions`, `qa_reviews`, `qa_findings`, `automated_qa_evaluations`,
`automated_qa_observations` all return to exactly 0 `cma500_`-tagged
rows (direct count query, see session transcript). Cluster was then
stopped and its data directory deleted — nothing persists.

## 11. Verification

- `npm run typecheck` — **clean, zero errors**.
- `npm run verify:full` — **35 passed, 2 pre-existing failures**
  (`handleCmaRegistryGet exists` and one customer-configuration-theme
  assertion), neither touched by this session (no `src/` file was
  modified — only `.tooling/scripts/` additions and this doc). Not
  introduced by Session 7-T; disclosed, not silently ignored.
- `npm run build` — **clean**, production bundle built successfully.
- No real outbound call, chat message, campaign execution, or paid LLM
  evaluation was triggered. No migration was applied to any database
  (disposable schema was hand-assembled for this session only; the one
  recommended isolation migration was written to disk and not applied
  anywhere).
