# Session 8.1 — CMA Deployment and POC UI Validation

Builds on Session 8 (`docs/SESSION_8_CMA_MEASUREMENT_OWNERSHIP_EXPANSION.md`), which
implemented but did not deploy the three Customer 360 population-level measures. This
session deploys that work, verifies it live, reviews the existing `CMA_POC_500_V1`
synthetic dataset, and adds minimal TEST-mode data adapters to the screens whose
existing architecture genuinely supports one.

## Part A — Review and deploy Session 8

**Pre-deploy confirmation** (direct code inspection, before touching anything):
- 3 Customer 360 algorithms present in `CMA_ALGORITHM_REGISTRY` (`cmaEvaluationAlgorithms.ts`).
- Customer Category Scope enforced before aggregation in `evaluateCmaMeasure()`
  (`cmaEvaluation.ts`) — the `'customer'` source family's RPC args never carry an
  Agent Scope parameter at all (structural, not just a runtime check).
- Customer Category Scope fails closed: `{ kind: 'unsupported' }` when `categoryAccess`
  is unresolved for a `'customer'`-family measure.
- Agent Scope on every other family is byte-for-byte unchanged.
- `.env` and every file outside the Session 8 change set were untouched (confirmed via
  `git status`/`git diff --stat` before staging — `.env`, `.tooling/tmp/cmaSyncRun.mjs`,
  `docs/VOICEFORCE_MEASUREMENT_TEST_DATA_PLAN.md` are pre-existing modifications from
  outside this session's scope, left out of every commit).

**Re-run**: `npm run typecheck`, `npm run verify:full` (74/74 on the CMA evaluation
suite, 0 failures anywhere in the full suite), `npm run build` — all clean.

**Disposable PostgreSQL validation**: a fresh local PostgreSQL 17 cluster (TCP-only,
no Unix socket — Windows requires `-c listen_addresses=127.0.0.1`, a Unix-socket path
under a long temp directory fails with "path too long") was seeded with hand-built
customer fixtures and used to apply `20261020031303_cma_customer_category_scope.sql`
end to end. All 8 required scenarios (unrestricted, restricted, multiple permitted,
empty permitted, explicitly-unauthorized, unsupported-measure-id) matched hand-computed
expected values exactly.

**Migration applied to production** (`dtbaczafdzgctkbqviod`):
- `20261020031303_cma_customer_category_scope` — the new `call_center_cma_evaluate_customer_measure` RPC.
- `20261020031525_cma_customer_category_scope_grant_fix` — **a real gap found and fixed
  during this deploy**: the first migration's `revoke all ... from public` alone left
  `EXECUTE` granted to `anon`/`authenticated`, because this Supabase project's default
  privileges on schema `public` auto-grant `EXECUTE` to those two roles on every newly
  created function. Confirmed live: `information_schema.routine_privileges` showed
  `anon`/`authenticated` with `EXECUTE` immediately after the first apply. Every other
  existing CMA evaluate RPC avoids this because its own migration already revokes `from
  public, anon, authenticated` explicitly (`cma_evaluation_engine.sql`). Fixed with a
  second migration doing the same explicit revoke, re-verified live
  (`has_function_privilege('anon', ..., 'EXECUTE')` → `false`,
  `has_function_privilege('service_role', ..., 'EXECUTE')` → `true`). The source
  migration file was also corrected so a fresh apply from scratch is right the first time.
- `20261020033724_cma_test_mode_voice_chat_list` — see Part D below.

No table structure, RLS policy, or existing record was touched by any of these
migrations — only new functions and their grants. `call_center.customers` row count
(34) and `call_center.customer_interactions`/`chat_sessions` row counts were confirmed
unchanged before/after.

**Commit, push, deploy**: committed only the verified Session 8/8.1 files (never `.env`
or the two pre-existing unrelated modifications above). Pushed to `main`
(`62f4691`, then a second commit for Part D below). Vercel auto-deployed; `vercel ls`
confirmed `Ready`, aliased to `callcenter-three-livid.vercel.app` /
`callcenter-sk-tardis-projects.vercel.app` / `callcenter-git-main-sk-tardis-projects.vercel.app`,
function count unchanged at 12 (`vercel inspect` build output).

## Part B — Verify the three Customer 360 measures through the deployed CMA API

No test login credentials exist anywhere in this repo (confirmed by grep in Session 8;
re-confirmed here) — the deployed app's production host is not a "testing the user's
own application" local/staging host under this environment's rules, so a full
browser-authenticated walkthrough of `?resource=cmaEvaluate` was not performed.
**This is a real, disclosed limitation, not a simulated pass.** Substituted: direct
verification against the deployed production database using the exact same RPC the
route calls, plus an HTTP-level check that the route itself is live and enforces
authentication.

| Scenario | Expected (independently computed from `call_center.customers`) | RPC result | Match |
|---|---|---|---|
| Unrestricted — total interactions | population 34, sum 631 | `{status:ok, population:34, numerator:631}` | ✅ |
| Unrestricted — escalations | population 34, sum 29 | `{status:ok, population:34, numerator:29}` | ✅ |
| Unrestricted — ever-authenticated | population 34, count 1 | `{status:ok, population:34, numerator:1}` | ✅ |
| Restricted to `inbound-banking-default` | population 17, sum 608 | `{status:ok, population:17, numerator:608}` | ✅ |
| Multiple categories (`inbound-banking-default` + `emi-reminder-agent`) | population 21 | `{status:ok, population:21, numerator:621}` | ✅ |
| Empty authorized scope | population 0 | `{status:ok, population:0, numerator:0}` | ✅ |
| Explicitly unauthorized category | population 0 | `{status:ok, population:0, numerator:0}` | ✅ |
| Unsupported measure id | — | `{status:unsupported}` | ✅ |

`curl -i POST https://callcenter-three-livid.vercel.app/api/admin?resource=cmaEvaluate`
with no session returns `401 {"detail":"Authentication required"}` — confirms the real
route enforces auth before this would ever reach the RPC.

All 22 operational CMA calculations (19 pre-existing + 3 new) are reachable through
`evaluateCmaMeasure()`'s single evaluation path — no second engine was introduced.
`docs/CMA_CALCULATION_COVERAGE.md` and `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` are
updated to say "operational, deployed" rather than "operational" alone for the 3 new rows.

## Part C — Review existing synthetic data

No regeneration. Confirmed live against production:

| Fact | Expected | Found |
|---|---|---|
| Synthetic voice interactions | 350 | 350 (`customer_interactions`, `dataset_id='CMA_POC_500_V1'`, `channel='voice'`) |
| Synthetic chat sessions | 150 | 150 (`chat_sessions`, same dataset_id) |
| Test agents | 2 | `VF_TEST_AGENT_A` (189 voice rows), `VF_TEST_AGENT_B` (154), 7 unattributed |
| Synthetic QA reviews | — | 80 (`qa_reviews`) |
| Synthetic automated QA evaluations | — | 60 (`automated_qa_evaluations`) |

NORMAL/TEST isolation re-verified live through the actual production RPCs (not a
re-derivation of the Session 7.1 claim — re-run fresh this session):

| Family | NORMAL population | TEST population | Overlap |
|---|---|---|---|
| Interaction (`CANON-RES-RATE`) | 761 | 350 | 0 |
| Chat (`CANON-CHAT-SESSION-SPAN`) | 12 | 150 | 0 |
| QA (`CANON-CONTEXT-CONTINUITY-RATE`) | 66 | 126 | 0 |

Customer Category Scope's `'customer'` family is deliberately dataset-independent (its
own approved definition is lifetime, not windowed, and `customers` has no `dataset_id`
column at all) — unaffected by and unrelated to this isolation mechanism, as designed
in Session 8.

## Part D — Make the test data visible in the UI

**Investigated first, built only where real** (a dedicated read-only investigation
pass traced every one of the 7 screens' actual data-fetching calls down to the source
before writing any code):

| Screen | List/detail source | Verdict |
|---|---|---|
| Dashboard (Performance Ratios) | Supabase CMA RPC | Already dataset-aware since Session 7.1 — no change needed |
| Human QA Quality Explorer | Supabase CMA-QA + qa_findings/population RPCs | Already dataset-aware since Session 7.1, already production-verified |
| Agent Detail — 2 CMA tiles (`CANON-AVG-SENT-SCORE`, `CANON-INTENT-CONFIDENCE`) | Supabase CMA RPC | **Found unwired** (a pre-existing gap, not a regression) — fixed this session |
| Agent Detail — call/chat history tables | `useCallData`/`fetchChatLogs` | Live-API-sourced; now dataset-aware for free once Call Logs/Chat Logs got their own adapter (below) |
| Call Logs | Live Voice API only (`GET /api/v1/call-data`) | Built a new TEST-mode Supabase adapter (below) |
| Chat Logs | Live Chat API only (`GET /api/v1/chat/sessions`), Supabase only as an outage fallback | Built a new TEST-mode Supabase adapter (below) |
| Analytics — Overview/Voice/Chat tabs | Live Voice API (`GET /api/v1/analytics/metrics`) direct proxy, zero Supabase path | **Not built** — see "Deferred" below |
| Analytics — Customers tab | Supabase `call_center_list_customers` | **Not built** — see "Deferred" below |
| Customer 360 (list + detail) | Supabase `call_center_list_customers`/`call_center_get_customer`/`call_center_list_interactions` | **Not built** — see "Deferred" below |

**New migration** `20261020033724_cma_test_mode_voice_chat_list.sql` — 3 new
`security definer` RPCs, same `call_center` schema (not exposed via PostgREST; every
read goes through a `public.call_center_*` function, confirmed zero existing
`.schema()`/`.from()` usage anywhere in this codebase):
- `call_center_test_mode_voice_interactions_list` — the synthetic voice population,
  filtered by dataset id, Agent Scope, and the same direction/outcome/date filters
  Call Logs already supports.
- `call_center_test_mode_chat_sessions_list` / `call_center_test_mode_chat_session_get`
  — the synthetic chat population and single-session lookup, same Agent Scope rule.

All three validated in disposable PostgreSQL against hand-built fixtures (4 voice rows
across 2 test agents + 1 null + 1 real row excluded; 3 chat rows) before being applied
to production — results matched exactly (see Part E).

**Call Logs** (`api/calls/data.ts`): a new `?datasetId=` branch
(`handleTestModeCallData`) short-circuits the live Voice API proxy entirely — a
synthetic `interaction_id` is never sent to `GET {VOICEBOT_BASE_URL}/api/v1/call-data`.
Rows are shaped into the exact same `CallDataEntryDto` the live branch returns, so
`callsMapper.ts` needs no TEST-aware special case. Fields the fixture genuinely has no
value for (caller name/number, transcript, recording, tags, `actual_outcome_*`,
`structured_outputs`) are left null/empty — the mapper already treats every one as
optional, so nothing is fabricated. NORMAL mode is unaffected (the branch only
triggers when `datasetId` is actually present; every other existing call site of
`useCallData` — Dashboard, Live View, Initiate Call — never passes it).

**Chat Logs** (`api/chat/logs.ts`): same pattern — a new `datasetId` branch reads the
synthetic chat population from Supabase, bypassing the live Chat API entirely for TEST
mode. `ChatSessionSummary.source` gained a third value, `'synthetic'` (alongside the
existing `'live'`/`'local-fallback'`), rendered as a visible banner on Chat Logs (same
styling as the existing outage-fallback banner, reusing its existing classes rather
than introducing new ones — CLAUDE.md Rule 2). **Zero of the 150 synthetic chat
sessions have any row in `chat_messages`** (confirmed: `0` via a join count against
production) — so TEST-mode chat detail always returns `messages: []`, never an
invented transcript, matching the brief's own "do not invent missing chat transcript
content" instruction exactly.

**Agent Detail**: the two CMA tiles now pass `datasetId` through (they already had
RPC/cache-key support since Session 7.1 — this was a pure wiring gap, not new
capability). Additionally, the live agent roster (`GET /api/v1/agents`) has no record
of `VF_TEST_AGENT_A`/`VF_TEST_AGENT_B` at all, so the page's own `if (!agent)` guard
would show "No agent found" and never render anything for either test agent — a
minimal, explicitly-labeled synthetic `Agent` stand-in (`displayName: "Test Agent A
(synthetic)"`, description states plainly it is not a real registered Voice API agent)
is substituted only when `datasetId` is set and the id is one of the two known test
agents, so the page renders. Call/chat history tables on this page now also read the
TEST-mode adapters above for free (same `useCallData`/`fetchChatLogs` calls, now
dataset-aware), so "interaction histories match the synthetic dataset" per the brief.

**Known, disclosed limitation**: the separate AI Agents roster *listing* screen
(`src/pages/AIAgents.tsx` — not one of the 7 screens named in this session's brief)
still sources its list from the live `/api/v1/agents` only, so the two synthetic test
agents do not appear as clickable cards there. Agent Detail is fully correct and
reachable by direct `agentId`/URL (how this session's own verification exercised it);
only the separate roster-browsing screen's "click to discover" path doesn't surface
them. Not fixed this session — out of the 7 named screens, and extending it would mean
either a second roster source or a synthetic-agent injection into a live-API-sourced
list, judged out of proportion to a screen this brief never named.

## Part E — Screen-specific verification

**DASHBOARD**: Performance Ratios' CMA-backed measures already respect NORMAL/TEST
(Session 7.1; re-confirmed this session via the production RPC calls in Part C). No
real/synthetic population mixing — proven by the 0-overlap counts above.

**CALL LOGS** — disposable PostgreSQL + production RPC results (hand-built fixture,
2 real + 2 synthetic-with-agent + 1 synthetic-null-agent):

| Scenario | Expected | RPC result | Match |
|---|---|---|---|
| Unrestricted, TEST dataset | 3 synthetic rows (real row excluded) | 3 rows (`SYN-V-1/2/3`) | ✅ |
| Restricted to one test agent | 1 row | 1 row (`SYN-V-1`) | ✅ |
| Outcome filter (`escalated`) | 1 row | 1 row (`SYN-V-2`) | ✅ |
| Production, unrestricted | 350 | 350 | ✅ |
| Production, restricted to `VF_TEST_AGENT_A` | 189 | 189 | ✅ |

Confirmed by code structure (not just by test): `handleTestModeCallData` returns
before `getBackendConfig()`/any `fetch()` to the live backend is ever reached — a
synthetic id structurally cannot reach the live Voice API through this path.

**AGENT DETAIL**: both test agents now resolve to a renderable page (synthetic
stand-in, see Part D); synthetic interaction counts are the exact production figures
above (189/154 voice rows); CMA sentiment/intent-confidence tiles now use the selected
agent id and TEST dataset id together, the same RPC and scope rule Dashboard/QA
Explorer already use.

**CHAT LOGS** — disposable PostgreSQL + production:

| Scenario | Expected | RPC result | Match |
|---|---|---|---|
| Unrestricted, TEST dataset | 2 synthetic rows | 2 rows (`SYN-C-1/2`) | ✅ |
| Restricted to one test agent | 1 row | 1 row (`SYN-C-2`) | ✅ |
| Single-session get | 1 row | `SYN-C-1` | ✅ |
| Production, unrestricted | 150 | 150 | ✅ |

Session navigation preserved (same dialog component, same `id`-based detail fetch);
no fabricated transcript content (always `[]`, confirmed `0` real message rows exist
for any synthetic session); `source: 'synthetic'` distinguishes these from both live
and outage-fallback rows, rendered as a visible banner.

**ANALYTICS**: existing CMA-backed measures (none on the 3 live-API tabs) — N/A. No
TEST-mode adapter was added for Overview/Voice/Chat (100% live-API, no Supabase path to
extend) or the Customers tab (`call_center_list_customers` has no `dataset_id`
parameter at all, and would additionally need a fixture-population change — see
"Deferred" below). No chart was fabricated; NORMAL behavior is completely untouched.

**HUMAN QA QUALITY EXPLORER**: NORMAL/TEST isolation re-verified this session (Part C:
66 vs 126, zero overlap) — unchanged from Session 7.1's own production verification.
Five-tab UI untouched (no code in this screen was modified this session).

**CUSTOMER 360**: preserved exactly as-is — Customer Category Scope and Customer
Detail semantics unchanged (zero files in `src/pages/Customers.tsx`,
`CustomerDetail.tsx`, or `api/customers/*` were touched). No new widget. Not made
TEST-aware this session (see "Deferred" below) — this is a correct, honest "not
supported," never a silent gap.

## Part F — Measurement accuracy

All TEST-mode values actually displayed/computed this session are covered in Parts B,
C, and E's tables above — expected values are the independently-queried production
`call_center.*` row counts/sums, computed before ever calling the measure/RPC under
test, never derived from it. Every comparison: **PASS**. No measure was activated that
wasn't already `decided`; no CANON-* definition status changed.

## Part G — Authorization and isolation

- NORMAL never includes `CMA_POC_500_V1` rows (Part C, confirmed live).
- TEST includes only `CMA_POC_500_V1` rows (Part C, confirmed live).
- Dataset selection is enforced server-side: every TEST-mode branch (CMA evaluate RPCs,
  the two new Call/Chat Logs RPCs) takes `p_dataset_id`/`p_all_agents`/
  `p_authorized_agent_ids` as RPC arguments resolved from the authenticated session on
  the server — never a client-supplied boolean the frontend could spoof into skipping
  filtering, and never a frontend-only filter over an unfiltered response.
- Agent Scope is applied before aggregation in every new path, identical fail-closed
  rule as every existing RPC (`agent_id is not null and agent_id = any(...)`).
- Customer Category Scope (Session 8) remains enforced completely independently of
  Agent Scope — unaffected by this session's Call/Chat Logs work, which never touches
  the `'customer'` source family.
- Empty permitted scope returns no unauthorized data (re-confirmed for the two new
  RPCs: restricted-to-zero-ids query returns population 0, not a fabricated or
  unrestricted result — same convention as Session 8's Customer Category Scope work).
- No role grant was changed. No dataset filter exists only in frontend JavaScript —
  every TEST/NORMAL decision is enforced inside a `security definer` RPC on the server.

## Part H — Testing

`npm run typecheck`, `npm run verify:full` (0 regressions — every pre-existing suite,
including the 74-assertion CMA evaluation suite, remains green), `npm run build` — all
clean after every change in this session.

**Deterministic validation performed**: the 3 new RPCs (`20261020033724`) were
validated in disposable PostgreSQL against hand-built fixtures covering unrestricted,
restricted, outcome-filtered, and single-record-lookup scenarios (Part E tables),
mirroring this project's established disposable-Postgres convention for migration
correctness. The same scenarios were re-verified live against production.

**Honest gap, disclosed rather than hidden**: no new browser-automated or JS-mocked
unit test was added for `handleTestModeCallData`/`fetchSyntheticChatList` specifically
(these are route-handler functions, not factored into pure units the existing
`.tooling/scripts/*-verify.mjs` harness pattern can import without a larger refactor of
the route files). The guarantee that a synthetic id never reaches the live Voice/Chat
API is structural (an early `return` before any `fetch()` call — confirmed by direct
code reading, cited in Part E) rather than test-asserted. If a future session wants a
JS-level regression test for this specific guarantee, it would need `api/calls/data.ts`
and `api/chat/logs.ts` refactored so their TEST-mode branches are separately
importable — judged out of proportion to add as a side effect of this session.

**Browser verification**: not performed at the time this document was first written —
no test login credentials exist in this repository (confirmed by grep), and the
deployed app is a production host, not a local/staging host this environment's rules
permit entering credentials into. Every verification above this point is either a
direct database/RPC check against the live production project, or static code
inspection — never a simulated or assumed browser result. **This limitation was
subsequently closed** using an already-authenticated desktop session the user made
available after this document was first written — see "Browser Verification —
Addendum" below. That addendum is real, authenticated browser evidence; everything
above it in this document remains exactly what it always was (database/RPC/code-level
verification), stated honestly as such at the time it was performed.

## Part I — this document

See also: `docs/CMA_CALCULATION_COVERAGE.md` (operational-but-deployed status for the
3 new measures), `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` (same), `supabase/migrations/20261020031303_*`,
`20261020031525_*`, `20261020033724_*` (all three applied to `dtbaczafdzgctkbqviod`).

## Browser Verification — Addendum

Performed after the rest of this document was written, using an already-authenticated
desktop browser session the user made available for this purpose (not a credential
entered by this session — the user was already signed in). This is real,
screenshot-observed UI behavior against the live production deployment
(`callcenter-three-livid.vercel.app`), not a database/RPC check. It confirms the UI
*renders* the already-verified Part B/C/E values correctly; it does not re-derive
those values independently — the independent-calculation verification remains Parts
B/C/E above, against the database directly.

1. **Call Logs — TEST mode**: switching the dataset selector to "CMA Test Data (500)"
   showed **350 total calls** (exactly matching the Part C production count), the
   "TEST DATA" badge rendered in the header, both `VF_TEST_AGENT_A`/`VF_TEST_AGENT_B`
   present in the rows, and fields with no synthetic equivalent (caller name, phone)
   rendered blank/em-dash rather than fabricated.

2. **Chat Logs — TEST mode**: showed **150 total sessions** (matching Part C), the
   amber "Showing the CMA_POC_500_V1 synthetic test population..." banner rendered
   above the table. Opened one session's detail view: it displayed "No messages in
   this session" — confirmed in the browser, not just by the database join-count in
   Part D, that no transcript content is fabricated for sessions that have none.

3. **Agent Detail — `VF_TEST_AGENT_A`**: loaded correctly at
   `/ai-agents/VF_TEST_AGENT_A` in TEST mode, labeled "Test Agent A (synthetic)" with
   its id shown alongside (never presented as a real roster agent). Showed **53 calls
   handled** and **100 chats handled**. The two CMA tiles rendered real values —
   **Intent confidence (voice, CMA, last 90d) = 0.70**, **Sentiment (voice, CMA, last
   90d) = 0.45** — on first load, with no visible repeated/retried requests and no
   stuck loading state (the exact failure mode the memoized `cmaWindow` fix in
   `useAgentDetail.ts` exists to prevent). A paginated "Recent Interactions" list
   (153 rows total) showed only this agent's own synthetic interactions.

4. **AI Agents roster — NORMAL mode**: confirmed live in the browser, not just by
   code reading, that the roster lists exactly the 3 real agents
   (Inbound Banking Assistant, EMI Reminder, Forex Transaction) and does not list
   either synthetic test agent — the documented Part D/"Deferred" limitation, now
   browser-confirmed rather than only inferred from the live-API-only source code.

5. **Dataset selector persistence — a minor UX limitation newly found by this
   browser pass**: switching to TEST mode and then navigating via in-app links (the
   sidebar, "View" actions) correctly preserves TEST mode across pages. A **full
   page reload or a direct URL navigation**, however, resets the selector back to
   NORMAL — observed repeatedly and consistently. This is not a measurement, scope,
   or isolation defect: every RPC and route in this document still enforces NORMAL/
   TEST correctly for whatever mode is actually selected (Part G is unaffected). It
   means only that a viewer who reloads the page, or opens a direct link, must
   reselect "CMA Test Data (500)" before synthetic data becomes visible again. Not
   fixed as part of this addendum (documentation-only update, per instruction); noted
   here as a genuine, disclosed finding for a future session to pick up if desired.

## Deferred — stated plainly, not silently skipped

- **Analytics (Overview/Voice/Chat tabs)**: 100% live-Voice-API-sourced with zero
  Supabase read path to extend. Building one would mean inventing a parallel
  analytics-aggregation path this screen has never had — judged out of proportion to
  "minimum necessary adapter," and the brief explicitly says not to fabricate
  unsupported charts.
- **Analytics (Customers tab) / Customer 360 (list + detail)**: two compounding gaps,
  not one — `call_center_list_customers`/`call_center_get_customer`/
  `call_center_list_interactions` have no `dataset_id` parameter at all (never amended
  by the Session 7.1 dataset-isolation migration, which only touched the 6 CMA-family
  RPCs), AND Session 7.1 deliberately set the synthetic fixture's
  `customer_interactions.customer_id` to `null` specifically to keep this population
  out of Customer 360's own unfiltered list screens. Making this screen TEST-aware
  would require both a new RPC-parameter migration and a fixture-population redesign
  that undoes a previous session's deliberate isolation decision — real new scope, not
  a wiring gap, and the brief explicitly says not to introduce a new Customer 360
  widget or force the 500-interaction fixture into Customer 360 this session.
- **AI Agents roster screen**: still lists only live agents; the two synthetic test
  agents are not clickable from it (see Part D's "Known, disclosed limitation").
- **Browser-based UI verification**: not performed anywhere in this session — no
  credentials exist. Every verification is a direct database/RPC/code-structure check.

Session 8.1 complete locally and in production. Stopping here per the brief's final
instruction.
