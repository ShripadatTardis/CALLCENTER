# Session CMA-3A.1 — Calculation Engine Production Deployment

**Status: committed, applied to production (`dtbaczafdzgctkbqviod`), pushed, deployed to Vercel,
and verified live. No material defect found. No existing screen migrated to CMA calculations.**

## 1. Review of completed CMA-3A

Confirmed by reading `src/server/cma/cmaEvaluationAlgorithms.ts` directly (not assumed from the
registry): **exactly 4 canonical measures have a real server-side algorithm implemented**:

| Canonical ID | Registry occurrence | Unit |
|---|---|---|
| `CANON-RES-RATE` | `RES-01` | percent |
| `CANON-AUTH-SUCCESS-RATE` | `AUTH-01` | percent |
| `CANON-SUCCESSFUL-RES-TIME` | `SRT-01` | seconds |
| `CANON-AVG-SENT-SCORE` | `AGENT-SENT-01` | score |

All four confirmed live in production as `governed_algorithm_status = 'decided'`.
`CANON-FIRST-CONTACT-RES`, `CANON-ESC-RATE`, `CANON-AVG-HANDLE-TIME`, `CANON-CALL-TECH-PERF`
confirmed still `pending_decision` in production — unaffected by this deployment, exactly as the
brief requires ("do not resolve pending measures automatically").

**Business Data Scope enforcement re-confirmed by reading the actual SQL**
(`call_center_cma_evaluate_measure`): the scope predicate
(`p_all_agents or ci.agent_id = any(p_authorized_agent_ids)`) lives inside the same `WHERE` clause
as the window/channel/campaign filters, in the `base` CTE every subsequent aggregation — grouped or
not — reads from. There is no later step that filters an already-aggregated result; scope narrows
the population *before* any `count`/`sum` runs, confirmed both by reading the SQL and by the
disposable-Postgres test in §2 (population drops from 10 → 9 rows when scope is restricted, not
just the final ratio).

## 2. Production-readiness verification

### 2.1 Fresh disposable-PostgreSQL run (this session, not just a reference to CMA-3A's own pass)

New cluster, full 54-migration replay (including the CMA-3A migration) + the CMA-2 seed, 12
synthetic `customer_interactions` fixture rows with hand-computed expected values — **13/13 tests
passed, identical results to CMA-3A's own original pass** (no drift since that session):
unfiltered, scope-restricted (proves population narrows before aggregation: 10→9 rows),
agent-filtered, channel-filtered, grouped-by-agent, all 4 measures' numerator/denominator, a
zero-population window, an unsupported measure id, an unsupported `groupBy`, repeated-evaluation
consistency, and `anon` role rejection. Cluster stopped and deleted at the end; production was never
written to during this pass.

### 2.2 `npm run typecheck` / `npm run verify:full`

Both pass clean (confirmed this session) — 26 logic-level evaluation tests plus every pre-existing
suite in the repository, no regression.

**No material authorization or calculation-correctness defect was found.** Nothing required fixing
before deployment.

## 3. Commit

Staged exactly the 9 CMA-3A files (migration, 3 `src/server/cma` modules, the `api/admin.ts`
route addition, the verify script + its esbuild bundle, `package.json`'s `verify:full` wiring, and
the CMA-3A session doc). The pre-commit HIG gate flagged the 4 backend TypeScript files (its usual
file-pattern false trigger on anything under `api/`/`src/server`); the real `design-reviewer`
subagent reviewed all four in full, confirmed zero UI surface exists, and returned
`HIG-VERDICT: advisory-pass (critical=0 high=0)` — recorded, not bypassed.

**Committed as `128cc51`**, `feat(cma): implement governed calculation engine`. `.env` confirmed
excluded (its working-tree diff is unchanged from the pre-existing, user-made diff present since
earlier in this project's history).

## 4. Database changes — applied to production

Pre-flight checks against `dtbaczafdzgctkbqviod` confirmed: the `cma_evaluation_engine` migration
was **not** already applied (`list_migrations` — 54 entries, none matching); `call_center_cma_evaluate_measure`
did not exist; the `cma.evaluate` permission did not exist; `customer_interactions` had 781 rows and
`cma_canonical_measures` had 60 rows — identical to the state this migration was tested against.

The migration is purely additive (one new function + one new permission; zero `ALTER`/`DROP` on any
existing table, column, or function), bounding its blast radius. **Backup/recovery availability was
not independently re-confirmed this session** — no tool in this session's toolset exposes Supabase's
backup/PITR configuration; disclosed rather than assumed, consistent with CMA-2.1's identical,
previously-disclosed gap.

Applied via `mcp__supabase__apply_migration` (migration name `cma_evaluation_engine`) — succeeded,
no error. Verified afterward, live:

| Check | Result |
|---|---|
| `customer_interactions` row count | **781** (unchanged) |
| `cma_canonical_measures` row count | **60** (unchanged) |
| `cma.evaluate` permission exists | yes, granted to **`['administrator']`** only |
| `call_center_cma_evaluate_measure` exists | yes |
| `anon`/`authenticated` can execute it | **false** / **false** |
| `service_role` can execute it | **true** |

No unrelated pending migration was touched.

## 5. Deploy to Vercel

Pushed `128cc51` to `origin/main`. Vercel auto-deployed
`dpl_Cu4xYL4DMe4caQVzqzZ65XbeaU6a`, aliased to `https://callcenter-three-livid.vercel.app`
(build 37s, reached `Ready`). Confirmed
via `gh api repos/ShripadatTardis/CALLCENTER/commits/main` and `/deployments` that the deployed
commit is exactly `128cc5128b90064f321806afefc26c763fb68876`, matching `main`'s HEAD. `vercel.json`
confirmed byte-identical across this push (`git diff origin/main~2..origin/main -- vercel.json` is
empty) — the same 4 pre-existing cron entries, no new cron, none modified.

## 6. Production evaluation smoke tests

All tests below used a real, already-authenticated administrator session's bearer token (read from
the browser's own Supabase session storage, never typed or viewed by the assistant), against
`https://callcenter-three-livid.vercel.app/api/admin?resource=cmaEvaluate`, window
`2026-03-10T00:00:00Z` → `2026-10-18T00:00:00Z` (the full real voice-interaction date range).

**Independently queried ground truth** (direct, read-only SQL against production, computed before
calling the API, not after — to avoid any risk of fitting the comparison to the result):

```
handled=738, resolved=104, auth_attempted=0, auth_success=0,
sentiment_present=761, sentiment_sum=362.20,
resolved_nonstale_count=104, resolved_nonstale_sum=6548, total_voice=761
```

| # | Test | Live API result | Independently computed | Match |
|---|---|---|---|---|
| 1 | Unfiltered, authorized | Resolution Rate 14.1% (104/738, pop 761) | 104/738 = 14.0921...% | **exact** |
| 2 | — | Auth Success Rate: `zero_denominator` (0/0, pop 761) | denom 0 (was_authenticated always null) | **exact** |
| 3 | — | Successful Resolution Time 62.96s (6548/104) | 6548/104 = 62.9615...s | **exact** |
| 4 | — | Avg Sentiment Score 0.48 (362.2/761) | 362.2/761 = 0.47595... | **exact** |
| 5 | Grouped (agent) | 15 agent groups, populations sum to 761 | total voice population 761 | **exact** |
| 6 | Channel-filtered (`channel: 'voice'`) | identical to test 1 | — | **exact** |
| 7 | Pending-decision measure (`CANON-ESC-RATE`) | `{ kind: 'not_yet_governed' }`, `resolvedMeasureId: 'ESC-03'` surfaced but not executed | — | **as governed** |
| 8 | Unsupported dimension (`filters: { outcome: 'resolved' }`) | `{ kind: 'unsupported_dimension', reason: "Dimension 'outcome' is not supported..." }` | — | **as designed** |
| 9 | Unauthenticated request (no bearer token) | `401 { "detail": "Authentication required" }` | — | **as designed** |

Every numeric result matched the independently-computed ground truth exactly — no rounding
surprise, no population mismatch, no silently-fabricated value.

### 6.1 Tests reported as unverified against production — not weakened, per the brief's own instruction

- **"A user with restricted Business Data Scope"** and **"An unauthorized evaluation request"**
  (an authenticated-but-forbidden caller, distinct from the unauthenticated case already verified
  above): checked live who currently holds `cma.evaluate` in production —

  ```sql
  select up.email, ur.role_code, ras.all_agents
  from user_profiles up join user_roles ur ... where 'cma.evaluate' in (role_permissions...)
  -- -> all 4 current holders are role 'administrator' with all_agents = true
  ```

  **Every real identity holding this permission today is an unrestricted administrator.** There is
  currently no production user whose Business Data Scope is genuinely restricted AND who holds
  `cma.evaluate`, so neither scenario could be exercised against a real live session without either
  (a) creating a new test identity or (b) temporarily granting the permission to a restricted role —
  both of which the brief's own instruction forbids ("if some tests cannot be performed because
  appropriate user permissions or test identities are unavailable, report them as unverified rather
  than weakening access controls"). **Reported as unverified in production accordingly.**

  Both mechanisms ARE independently proven, just not against a live production session: the
  disposable-Postgres run in §2.1 proves scope narrows the population before aggregation with a
  real SQL execution (test #2, 10→9 rows); the CMA-3A logic-test suite (test #6) proves an
  unauthorized filter is rejected before the database is ever queried. Neither mechanism is novel to
  this deployment — `toAgentAccess`/`isAgentIdInScope`/`requirePermission` are the exact same
  functions already exercised live in CMA-2.1's production verification for `cmaRegistry`/`cmaSync`.

## 7. Regression checks — production, live browser session

| Screen/API | Result |
|---|---|
| Dashboard | Renders correctly, real data (Live Operations, Performance Ratios, Action Required) |
| Call Logs | Renders correctly, 761 total calls (matches the voice-interaction count used in §6's ground truth) |
| Settings → CMA Synchronization | Renders correctly, status "Success", last-7-runs history intact |
| CMA Registry API (`?resource=cmaRegistry&action=status`) | `200`, same governance counts as CMA-2.1 (60/75/11/7/22) |
| Customer 360 | Renders correctly, 34 customers |

No regression found in any existing screen or API.

## 8. Remaining limitations (disclosed, unchanged from CMA-3A unless noted)

- Restricted-scope and authenticated-but-forbidden live production tests are **unverified** (§6.1) —
  no current production identity can exercise them without weakening access controls. Recommend a
  future session either provisions a dedicated non-administrator test identity with `cma.evaluate`
  and a restricted Agent Scope (an explicit, disclosed decision, not a default) or accepts the
  disposable-Postgres + logic-test evidence as sufficient.
- Every other CMA-3A limitation carries forward unchanged: dimension coverage is a deliberate subset
  (`agent`, `channel`, `campaign`); `groupBy: 'channel'` is degenerate for all 4 voice-only measures;
  no pagination contract for grouped results; Customer Category Scope is not integrated (no selected
  measure has a `customer` dimension); this engine's algorithms reimplement the business rule in SQL
  rather than calling the existing `ratioMath.ts` functions (different population source — see
  `docs/SESSION_CMA_3A_CALCULATION_ENGINE.md` §9 for the full account).
- Backup/recovery availability was not independently re-confirmed (§4).

## 9. Execution boundaries honored

No existing Dashboard/Analytics/Reports/Call Logs calculation was replaced or migrated to this
engine. No change to CMA synchronization. No new cron job (verified zero `vercel.json` diff). No
pending canonical measure's governance status was changed — all 4 remain `pending_decision` in
production, confirmed before and after this deployment. `.env` untouched. No unrelated
working-tree changes staged or committed.
