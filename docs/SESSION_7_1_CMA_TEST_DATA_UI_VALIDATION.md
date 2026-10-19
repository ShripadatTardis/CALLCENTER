# Session 7.1 — CMA Source Integration, 500-Interaction Test Population, and UI Validation

Completes the Session 7/7-T integration and builds a NORMAL/TEST
dataset-mode mechanism so the `CMA_POC_500_V1` synthetic population can
be made visible through real screens without contaminating normal POC
measurements. **Local and disposable-PostgreSQL work is complete and
verified. Production migration application, the manual sync run, the
500-interaction population, and the deploy are blocked on a tool
permission — see "Blocked: production write permission" below — and
have not happened yet.**

## Part A — Integration

Session 7-T's commit (`255bcc7`, built in an isolated local clone on
branch `session-7t-synthetic-data` after the main repo's git worktree
mechanism turned out to be redirected — a plain local clone on its own
branch was used instead, satisfying the same "no shared mutable
working tree" requirement) was fetched as a remote and cherry-picked
cleanly onto main (no conflicts — Session 7-T touched only new files).
Its draft dataset-isolation migration was renamed to a real timestamp
(`20261113000000_cma_dataset_isolation.sql`) as the starting point for
Part C below, rather than regenerated.

## Part B — Source evidence integration (retained, not re-implemented)

All of Session 7's work is retained exactly as built: the `fcr`/
`intentConfidence` sync-mapping fix, the transcript-evidence cache, the
evidence orchestrator, the opt-in targeted LLM verifier, and their 58
deterministic tests. Nothing was changed in this session except what
Part C/D below required.

**Manual CMA Sync Now (before/after counts) — not run.** This requires
writing to the production database and is blocked by the same
permission issue as the migration apply (see below). No before/after
counts exist yet.

## Part C — Dataset isolation (local + disposable-PostgreSQL validated; NOT applied to production)

Extended Session 7-T's 2-RPC draft to a real, explicit NORMAL/TEST
toggle (`p_dataset_id text default null` — null is NORMAL, a real
label like `'CMA_POC_500_V1'` is TEST, never mixed) across 6 RPCs and 5
tables:

| Table | RPCs amended |
|---|---|
| `customer_interactions` (voice) | `call_center_cma_evaluate_measure` |
| `chat_sessions` (chat) | `call_center_cma_evaluate_chat_measure` |
| `qa_reviews` (+ `qa_findings` via join) | `call_center_cma_evaluate_qa_measure`, `call_center_qa_findings_list`, `call_center_qa_reviews_population` |
| `automated_qa_evaluations` (+ `automated_qa_observations` via join) | `call_center_cma_evaluate_qa_measure` |
| `campaign_targets` | `call_center_cma_evaluate_campaign_measure` |

**Deliberately NOT covered**: `action_items` (no RPC aggregates
synthetic-shaped data; Session 7-T's dataset has no action-item-shaped
rows) and `cma_interaction_evidence`/`cma_transcript_evidence_cache`
(no RPC aggregates over these at all yet — adding a column nothing
reads would be premature).

**A real architectural finding that reshapes what "visible through the
UI" can mean this session**: most screens do not read from Supabase at
all.

| Screen | Actual data source | Can show `CMA_POC_500_V1`? |
|---|---|---|
| Dashboard Performance Ratios | `call_center_cma_evaluate_measure`/`_chat_measure` (Supabase) | **Yes** — wired this session. |
| QA Quality Explorer | `call_center_cma_evaluate_qa_measure` + `call_center_qa_findings_list`/`_reviews_population` (Supabase) | **Yes** — wired this session, including the actual review/finding rows, not just the CMA numbers. |
| Campaigns (cross-campaign overview widget) | `call_center_cma_evaluate_campaign_measure` (Supabase) | **Yes, at the RPC/measure-number level** — wired this session (`CampaignOverviewStats.tsx`). **Not actually exercised yet** — see the scope decision below. |
| Call Logs | Live Voice API (`GET /call-data`) | **No** — architecturally cannot show a Supabase-only row without a new, unrelated listing path. Left unchanged, documented, not worked around. |
| Chat Logs | Live Chat API (`GET /chat/sessions`); Supabase is only an **outage fallback** (`supabaseChatRepository.listSessions()`, confirmed by reading the exact trigger condition in `api/chat/logs.ts`) | **No**, under normal operation — same reason as Call Logs. |
| Agent Detail | Pure client-side aggregation over already-fetched live `Interaction[]`/`ChatSessionSummary[]` rows — never reads Supabase for interaction data | **No** — same reason. |
| Analytics | Proxies `GET /analytics/metrics` directly from the Voice API | **No** — same reason. |

Per the brief's own escape valve ("if some modules cannot support
dataset separation without large unrelated changes, document the
limitation and leave those modules unchanged rather than introducing
unsafe partial filtering"), **Call Logs, Chat Logs, Agent Detail, and
Analytics are left completely unchanged this session.** Building a
second, Supabase-backed listing path for any of them is real, separate
scope, not a dataset-filter afterthought.

**Scope decision on Campaigns**: the Campaigns list screen
(`call_center_campaign_list` RPC) has **no dataset-mode filtering of
its own**. A real `campaigns` row created for the synthetic dataset
would appear on that list unconditionally, in NORMAL mode too — the
exact "silent contamination" Part C explicitly forbids. Rather than
extend a 6th table/RPC under time pressure, **no synthetic
`campaigns`/`campaign_targets`/`campaign_results` rows are populated
into the shared database this session.** The campaign-family RPC and
UI wiring exist and are validated correct in disposable PostgreSQL
(see the fork's validation below) for a future session that also
closes the `call_center_campaign_list` gap.

## Part D — Population

**Design (validated in disposable PostgreSQL, see results below) —
not yet applied to the shared database (blocked, see below):**

- Reuses Session 7-T's exact 500 generated interaction records
  (deterministic, same seed — no regeneration, so its
  independently-computed expected values remain valid unchanged).
- Tags `dataset_id = 'CMA_POC_500_V1'` on exactly 5 tables:
  `customer_interactions` (350), `chat_sessions` (150), `qa_reviews`
  (80), `automated_qa_evaluations` (60), plus their joined child rows
  `qa_findings` (160) / `automated_qa_observations` (120).
- Remaps every synthetic interaction's `agent_id` to one of two new,
  purely-internal string identifiers — `VF_TEST_AGENT_A` (262 rows) /
  `VF_TEST_AGENT_B` (228 rows) — with ~10 rows left agent-less
  untouched. No `agents` table exists anywhere in this schema
  (confirmed by investigation); `agent_id` is a free-text column
  everywhere, so these are not, and never trigger, any real external
  VoiceForce Conversational Agent identity or call/message.
- 5 targeted field fixes the real schema requires beyond Session
  7-T's own (intentionally minimal) disposable-only schema: `source`
  set to the real `'call-data'` check-constraint value;
  `customer_id`/`campaign_id` set to `null` (no real FK target exists,
  and nulling `campaign_id` is also what keeps this out of Customer
  360/Campaigns' own unfiltered list screens); `reviewer_user_id`/
  `initiated_by` pointed at a real existing `user_profiles` row (both
  are `NOT NULL` real foreign keys — fabricating a new user row would
  itself appear unconditionally in User Management).
- Campaign/action-item rows excluded entirely, per the Part C scope
  decision above.

Final fixtures: `.tooling/scripts/session7_1-production-fixtures.sql`
(idempotent, tag-guarded) and `.tooling/scripts/session7_1-production-cleanup.sql`
(a guarded `delete ... where dataset_id = 'CMA_POC_500_V1'` across
exactly the 5 tables, safe to re-run).

**Disposable-PostgreSQL validation results** (fresh cluster, full real
migration history replayed, the new migration applied, then the
fixtures loaded):

- Exact row counts landed with zero errors: 350 / 150 / 80 / 160 / 60 /
  120 across the 6 tables.
- All 12 testable measure/population combinations (Resolution Rate,
  Auth Success Rate, Successful-Resolution-Time, Avg Sentiment Score,
  Intent Confidence, Chat Session Span, Context Continuity Rate ×
  human/automated/combined, Task Progression Rate ×
  human/automated/combined) matched Session 7-T's already-established
  independent expected values **exactly**, now running through the
  amended RPCs with `p_dataset_id = 'CMA_POC_500_V1'`.
- The SAME RPCs called in NORMAL mode (`p_dataset_id` omitted) returned
  **population = 0** for every one of those measures — the synthetic
  rows are invisible by default, confirmed, not assumed.
- Agent-grouped TEST-mode queries showed exactly two groups
  (`VF_TEST_AGENT_A`/`VF_TEST_AGENT_B`), non-trivial populations on
  both sides, for both the interaction family (188/154) and the QA
  family (70/55).
- Cleanup deleted exactly 120/60/160/80/150/350 rows — a 1:1 match with
  the inserts — and re-running cleanup afterward was a clean no-op.
- Nothing was ever applied to or written into the real
  `dtbaczafdzgctkbqviod` project during this validation — the only
  contact with it was one read-only `SELECT` (to pick a real
  `user_profiles` id for the FK fix above).

## Part E — UI dataset selector

- `src/contexts/DatasetModeContext.tsx` (new): `mode: 'normal'|'test'`,
  persisted per-tab via `sessionStorage`, gated on the existing
  `cma.evaluate` permission (no new permission introduced). Fails
  closed to NORMAL the instant a viewer without that permission would
  otherwise be in TEST mode — checked on every render via a `useEffect`
  guard, not just at selection time.
- `src/components/layout/DatasetModeSelector.tsx` (new): a `Select`
  with the exact two labels the brief specifies ("Normal POC Data" /
  "CMA Test Data (500)"), plus a `Badge variant="warning"` ("TEST
  DATA") shown whenever TEST mode is active — both existing,
  theme-token-driven components (`src/components/ui/select.tsx`,
  `badge.tsx`), no new styling values introduced (ui-centralization.md
  Rules 1/2/3 preserved). Hidden entirely for a viewer who can never
  use TEST mode, rather than shown disabled.
- Rendered inside `ContextBar.tsx`, which is part of the persistent app
  chrome (`Layout.tsx`) — visible and selection-preserving on every
  screen inside the authenticated app, not opt-in per page.
- Threaded end-to-end: `CmaMeasureRequest.datasetId` /
  `QaAnalysisFilterParams.datasetId` → `api/admin.ts`'s
  `cmaEvaluate`/`qa` handlers → the amended RPCs. React Query cache
  keys on every CMA hook now include `datasetId`, so switching modes
  correctly triggers a refetch rather than showing a stale cached
  result from the other mode.
- Wired into: `Dashboard.tsx`'s Performance Ratios panel,
  `QaQualityExplorer.tsx` (both its CMA measure tiles and its
  findings/population listing), `CampaignOverviewStats.tsx`'s
  cross-campaign widget.

## Part F — Screen verification

**Not yet performed against the live deployment** — blocked on the
same production-write permission as Parts B/D (the migration isn't
live, so there is no synthetic data in production to look at yet, and
the updated frontend/backend code calling the new `p_dataset_id`
parameter has not been deployed — deploying it before the migration is
live would break every existing CMA evaluation in production outright,
since the RPC signature wouldn't match).

What CAN be stated now, from the disposable-PostgreSQL-validated logic
and the architectural survey above:

| Screen | Expected once unblocked |
|---|---|
| Dashboard | TEST mode shows Performance Ratios computed from exactly the 500-row population; NORMAL mode shows real data only — never mixed (proven in disposable Postgres). |
| QA Quality Explorer | TEST mode shows the 80 synthetic Human QA reviews/findings and the CMA measure tiles computed from them; NORMAL mode excludes them entirely. |
| Campaigns | Not applicable this session — no synthetic campaign data exists anywhere (see Part C's scope decision). |
| Call Logs / Chat Logs / Agent Detail / Analytics | Will show **no synthetic data in either mode** — a genuine, documented architectural limitation (live-API-sourced), not a bug to chase this session. |

## Part G — Testing

Added to `npm run verify:full` (all passing, 59 assertions in
`cma-evaluation-verify.mjs` total, 6 new this session covering exactly
the dataset-id threading logic):

- NORMAL mode (datasetId omitted) sends `p_dataset_id: null` for every
  family.
- TEST mode (explicit datasetId) sends the real label for the
  interaction/qa/campaign/chat families.
- The `action` family NEVER receives `p_dataset_id` at all (no such
  RPC parameter exists — would otherwise cause PostgREST to reject the
  call outright).

Also re-verified: all 53 pre-existing `cma-evaluation-verify.mjs`
assertions, all 58 Session 7 assertions, all existing suites —
`npm run typecheck` / `npm run verify:full` / `npm run build` all pass
clean, zero regressions.

**Not covered by an automated test** (documented rather than silently
skipped): `DatasetModeContext`'s `sessionStorage` persistence and
fail-closed-to-NORMAL reset logic is a small, simple React context
with no complex branching — reviewed by hand rather than unit tested,
since this repo's existing test convention (esbuild-bundle + plain
Node assertions) has no DOM/React renderer to exercise a React context
against; a future session could add this via a browser-based test if
ever judged worth the added tooling.

## Part H — Measure ownership register

No change to `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` this session
— nothing about measure governance or implementation readiness changed
(this session built a test-data mechanism, not a new measure).

## Blocked: production write permission

Two actions this session's brief explicitly authorizes — applying
`20261113000000_cma_dataset_isolation.sql` to the production project
(`dtbaczafdzgctkbqviod`) and the manual CMA Sync Now run — require
`mcp__supabase__apply_migration` (and/or `execute_sql`). Both calls
were denied twice in this session by the local tool-permission
classifier ("Blind Apply"), even after a retry, unlike Session 6.1's
equivalent action earlier in this project's history (which succeeded
after the user explicitly confirmed once). As instructed previously
("tell me the specific permission required rather than repeatedly
requesting business approval"), this is reported rather than retried
further.

**What this blocks, in order**: (1) applying this migration to
production, (2) deploying the already-committed frontend/backend code
that sends the new `p_dataset_id` parameter — deploying before (1) is
live would break every CMA evaluation call in production, since the
RPC signatures wouldn't match yet, (3) the manual Sync Now before/after
count, (4) loading `.tooling/scripts/session7_1-production-fixtures.sql`
into the shared database, (5) live screen verification.

**Everything upstream of that boundary is done and verified**: the
migration is written and fully validated in disposable PostgreSQL; the
fixtures are built and fully validated in disposable PostgreSQL
(including the exact NORMAL/TEST isolation guarantee); the frontend/
backend code compiles clean and passes every test; the commits exist
locally on `main`, not yet pushed.

**To unblock**: either grant the `mcp__supabase__apply_migration` /
`mcp__supabase__execute_sql` permission for this session (as was done
for the equivalent Session 6.1 action), or apply
`supabase/migrations/20261113000000_cma_dataset_isolation.sql`
manually (e.g. via the Supabase SQL editor), after which this session
(or a follow-up) can push/deploy, run the fixtures load, and complete
Parts B.6/D.13/F.
