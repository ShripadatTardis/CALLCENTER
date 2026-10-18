# Session CMA-4A.1 — Dashboard Production Deployment

## 1. Commit and deployment

Committed `7dc8f84` — `feat(cma): integrate Dashboard Performance Ratios
with CMA, roll out evaluate permission` — containing exactly the CMA-4A
implementation files plus the new permission migration:
`src/pages/Dashboard.tsx`, `src/hooks/cma/useCmaMeasure.ts`,
`src/lib/cma/cmaWindow.ts`, `src/services/cma/cmaEvaluationService.ts`,
`src/types/cma.ts`, `docs/SESSION_CMA_4A_DASHBOARD_INTEGRATION.md`,
`supabase/migrations/20261031000000_cma_evaluate_permission_rollout.sql`.
HIG gate passed (0 high-severity findings — the 4 non-UI files confirmed
non-UI, `Dashboard.tsx` reconfirmed clean from its CMA-4A review).

Pushed to `main`; Vercel auto-deployed and the new deployment
(`callcenter-mx5903im5-...`) is aliased to
`callcenter-three-livid.vercel.app` (confirmed via `vercel inspect`).

## 2. Permission change

**The blocker identified in CMA-4A**: `cma.evaluate` was granted to
`administrator` only, so the CMA-backed cards were invisible to every
other role.

**Resolution**: a new additive migration,
`supabase/migrations/20261031000000_cma_evaluate_permission_rollout.sql`,
grants `cma.evaluate` to the 3 roles that already hold `ratios.view` —
`analyst`, `read_only`, `supervisor` — and nothing else.

Rationale (confirmed against production before writing the migration, not
assumed): `ratios.view` is the permission that already gates drilling
from a Dashboard ratio card into Ratio Explorer
(`guardedNavigate(..., 'ratios.view', ...)` in `Dashboard.tsx`) — i.e. the
existing role model already defines "authorized to view business
measures" as holding `ratios.view`, independent of this session.
`dashboard.view` (held by all 6 roles) only gates seeing the Dashboard
shell, not its measures. `operator` and `qa_reviewer` hold
`dashboard.view` but not `ratios.view`, so they were deliberately
excluded — granting them `cma.evaluate` would have been a real widening
of authorization beyond what the existing model already grants them, not
"the measures already visible to them" in the permission model's own
terms (the fact that the unauthenticated legacy ratio engine happens to
leak values to them today is a separate, pre-existing gap, not a
justification).

No new role was created. No `role_agent_scope` / `role_customer_category_scope`
row was touched — every role's existing Business Data Scope is unchanged;
this migration only lets 3 more roles *evaluate* CMA measures within
whatever scope they already carry.

**Verified in production after applying**: `role_permissions` now shows
exactly 4 roles with `cma.evaluate` — `administrator` (unchanged),
`analyst`, `read_only`, `supervisor` (new). `operator` and `qa_reviewer`
remain without it, confirmed by the same query.

*(Process note: applying this migration required explicit user
confirmation mid-session — Claude Code's own auto-mode classifier
correctly flagged it as a "Permission Grant" action and declined to run
it unattended; the user was asked and approved before it was applied.)*

## 3. Calculation verification

Re-confirmed Resolution Rate / Successful Resolution Time / Authentication
Success Rate still use `cmaEvaluate` post-deployment (not re-derived —
same RPCs as CMA-4A, untouched by this session) via a filtered production
query (`CANON-RES-RATE` with `p_filter_channel='voice'` over a 30-day
window) returning the same 25/134/136 numerator/denominator/population
already established in CMA-4A's byte-identical legacy-vs-CMA comparison.
FCR, Escalation Rate, and AHT remain on their existing legacy paths,
governance status unchanged (still `pending_decision`, confirmed
untouched by this session's migration).

## 4. Tests

- `npm run typecheck` — clean.
- `npm run verify:full` — 46 tests, 0 failed.
- `npm run build` — clean production build.
- HIG review — 0 high findings (§1).

## 5. Production smoke test (on the deployed `callcenter-three-livid.vercel.app`)

Performed as a real authenticated administrator, not simulated:

| Check | Result |
|---|---|
| All 3 migrated measures use `cmaEvaluate` | **Confirmed** — 3 `POST /api/admin?resource=cmaEvaluate` calls, all 200, one per card (Resolution/Resolution Time/Auth Success) |
| Values match independently queried facts | **Confirmed** — identical to the CMA-4A byte-for-byte comparison (§3); the live window itself had no qualifying interactions ("No eligible population"), correctly shown, not fabricated |
| Pending measures retain existing behavior | **Confirmed** — FCR/Escalation/AHT still call `GET /api/analytics/metrics?resource=ratios` (3 calls, 200s), the unmodified legacy path |
| Unauthorized requests rejected | **Confirmed** — an anonymous `POST /api/admin?resource=cmaEvaluate` (no auth) returns `401` |
| Authorized restricted-scope users receive scoped values | **Not verified — reported honestly, not worked around.** Production has no active user assigned to `analyst`, `read_only`, or `supervisor`, and no active user anywhere with a restricted (non-`all_agents`) Agent Scope — confirmed by a direct query of `user_profiles`/`user_roles`/`role_agent_scope` before writing this report. Per the brief's explicit instruction, no test identity or scope was created to force this test. What *is* verified: the scope-enforcement mechanism itself (`toAgentAccess` → `evaluateCmaMeasure`) is the exact unmodified code already covered by CMA-3A/3B/3B.1's test suite (46 passing tests, including explicit unauthorized-agent-filter rejection cases) — this session did not add, remove, or alter any scope-enforcement logic, only which roles may reach it. |
| No Dashboard regression | **Confirmed** — Live Operations, Agent Activity, Recent Interactions, Action Required all render with real data; clicking the Resolution card still navigates to `/ratios/resolution_rate`, the pre-existing deep link |

## 6. Remaining dependencies / unresolved issues

- **Restricted-scope end-to-end verification remains genuinely untested** against a live user session, for the reason in §5 — this is a real gap, not a false "pass." If a restricted-scope test account is provisioned in a future session, re-running this exact check is the way to close it.
- `operator` and `qa_reviewer` still do not have `cma.evaluate` (by design, §2) — they continue to see the legacy-sourced Performance Ratio values for Resolution/Resolution Time/Auth Success, same as before CMA-4A. Extending CMA to them would require either broadening the existing `ratios.view` grant or a separate, deliberate decision — not done here, since it wasn't what the existing role model already authorized.
- FCR, Escalation Rate, AHT, Call Technical Performance remain `pending_decision` — untouched, as instructed.
- The legacy ratio engine's own lack of Business Data Scope enforcement (documented in Session 14.3) is unaffected by this session.

CMA-4B was not started. Stopping here per the brief.
