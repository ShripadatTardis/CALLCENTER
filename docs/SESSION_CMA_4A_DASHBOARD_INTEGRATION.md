# Session CMA-4A — Dashboard Integration with Central Measures Authority

## Objective

Replace eligible Dashboard business calculations with authoritative CMA
evaluation results, without redesigning the Dashboard or rebuilding CMA.

## 1. Investigation (read-only, before any code changed)

Read `docs/CMA_CALCULATION_COVERAGE.md`, `docs/CMA_EVALUATION_CONTRACT_v0_3_1.md`,
`docs/SESSION_CMA_3A_1_PRODUCTION_DEPLOYMENT.md`,
`docs/SESSION_CMA_3B_1_PRODUCTION_DEPLOYMENT.md`, `docs/MASTER_MEASURES_REGISTER.csv`,
and the actual `src/pages/Dashboard.tsx` implementation plus every hook/service it
calls, to map every displayed number to its real source before touching anything.

## 2. Dashboard measure mapping

| Dashboard occurrence | Current source | Canonical measure | Governed status | Operational (19)? | Class |
|---|---|---|---|---|---|
| Performance Ratios: **FCR** | `useRatioSummary('fcr')` → legacy ratio engine (`api/analytics/metrics.ts`, hits the external Voice Partner API directly) | `CANON-FIRST-CONTACT-RES` | `pending_decision` | N | **B** |
| Performance Ratios: **Escalation Rate** | same legacy engine | `CANON-ESC-RATE` | `pending_decision` | N | **B** |
| Performance Ratios: **Resolution Rate** | same legacy engine | `CANON-RES-RATE` (RES-01) | `decided` | **Y** | **A — migrated** |
| Performance Ratios: **Resolution Time** | same legacy engine | `CANON-SUCCESSFUL-RES-TIME` (SRT-01) | `decided` | **Y** | **A — migrated** |
| Performance Ratios: **Auth Success** | same legacy engine | `CANON-AUTH-SUCCESS-RATE` (AUTH-01) | `decided` | **Y** | **A — migrated** |
| Live Operations: **Avg Handle Time** | `useRatioSummary('aht')`, same legacy engine | `CANON-AVG-HANDLE-TIME` | `pending_decision` | N | **B** |
| Live Operations: **Active calls / Active agents** | `useCallData`/`useAgents`, real-time counts | none — CMA evaluates closed windows, not live in-progress state | — | — | **D** |
| **Agent Activity** panel | `useAgents` + live `activeInteractions` | none (roster/activity, not a window aggregate) | — | — | **D** |
| **Recent Interactions** list | `useCallData` + `useChatLogs`, merged client-side | none (a record list, not a measure) | — | — | **D** |
| **Action Required** card | `call_center_action_items_list` RPC (Session 15's own queue) | `CANON-ACTION-REQUIRED-QUEUE-ITEMS` exists as an aggregate count, but the card displays individual assignable work items (assignee, status, resolve actions) | `decided` | Y, as a count only | **D** — not interchangeable with this component without losing per-item identity |

No Dashboard occurrence maps to a `blocked`/`unimplemented` canonical measure — classification **C never applied**. Nothing was silently omitted: every occurrence above is accounted for with an explicit reason.

## 3. What was implemented (class A, 3 cards)

New files (no existing file deleted or renamed):
- `src/types/cma.ts` — frontend DTOs mirroring the CMA evaluation API's wire shape (kept independent of `src/server/cma/*`, matching this codebase's existing frontend/backend type-boundary convention).
- `src/services/cma/cmaEvaluationService.ts` — the one place any frontend code calls `POST /api/admin?resource=cmaEvaluate` (CMA-3A's existing, unmodified route).
- `src/hooks/cma/useCmaMeasure.ts` — a React Query hook, same shape/conventions as the existing `useRatioSummary`.
- `src/lib/cma/cmaWindow.ts` — `defaultDashboardCmaWindow()`, reproducing the legacy engine's implicit default window (`rangeToDateWindow(undefined)`: "yesterday through today", both calendar dates inclusive) as explicit CMA `[from, to)` timestamps, since `cmaEvaluate` has no implicit default window of its own.

Modified: `src/pages/Dashboard.tsx` only.
- `PerformanceRatioCard` now looks up `ratioId` in a new `CMA_BACKED_RATIO_MEASURES` map (`resolution_rate`→`CANON-RES-RATE`, `successful_resolution_time`→`CANON-SUCCESSFUL-RES-TIME`, `authentication_success_rate`→`CANON-AUTH-SUCCESS-RATE`). When the ratio id is in that map **and** the viewer holds `cma.evaluate` (`hasPermission(user, 'cma.evaluate')`), the card calls `useCmaMeasure` instead of `useRatioSummary` — the legacy hook is passed `undefined` in that case, which disables it (`enabled: Boolean(ratioId)` in the existing hook), so exactly one request fires per card, never both.
- FCR, Escalation Rate and AHT are untouched — not in the map, so they always use the legacy engine exactly as before.
- No formula was reproduced on the Dashboard for any of the 3 migrated measures — the value comes directly from the CMA evaluation API's response.
- Existing display states (loading `…`, error + Retry, `unavailableReason` text) are preserved structurally; for the CMA path, `CmaMeasureValue`'s non-`value` kinds are mapped to a human reason via the new `cmaMeasureUnavailableReason()` helper (e.g. `zero_denominator` → "No eligible population") — never a fabricated 0%, matching brief §7.
- Navigation/drill-down (`buildDashboardRatioLink`, clicking through to `/ratios/:ratioId`) is unchanged for every ratio id, migrated or not.

## 4. Equivalence verification (not assumed — directly compared against production)

Before wiring anything up, the legacy ratio engine's value for all 3 measures was compared against the CMA evaluation RPC's value for the identical 30-day window, both against live production data (`dtbaczafdzgctkbqviod`):

| Measure | Legacy (num/denom/population) | CMA (num/denom/population) | Match |
|---|---|---|---|
| `resolution_rate` → `CANON-RES-RATE` | 25 / 134 / 136 | 25 / 134 / 136 | **Exact** |
| `successful_resolution_time` → `CANON-SUCCESSFUL-RES-TIME` | 1099 / 25 / 136 | 1099 / 25 / 136 | **Exact** |
| `authentication_success_rate` → `CANON-AUTH-SUCCESS-RATE` | 0 / 0 / 136 (`no_data`) | null / 0 / 136 | **Exact** (both correctly report no eligible population) |

Byte-identical across all three, confirming the CMA sync job's persisted population matches the live-queried legacy population for this window — the population/dimension-semantics risk flagged during investigation did **not** materialize here. This is real evidence, not an assumption — see §5 below for the one genuine semantic difference that does exist (window construction) and how it was handled.

## 5. Genuine semantic difference found and handled

`cmaEvaluate` has **no implicit default window** — every caller must supply explicit `window.from`/`window.to`. The legacy engine's default (no `range` filter) resolves to "yesterday through today" via `rangeToDateWindow(undefined)`. `defaultDashboardCmaWindow()` (`src/lib/cma/cmaWindow.ts`) reproduces that exact calendar-day boundary as explicit timestamps, so a migrated card shows the same window a legacy card would have shown by default — not a silently different one. This is the one construction detail that had to be built, not a data/formula mismatch.

## 6. The permission blocker (found during investigation, not assumed)

`cma.evaluate` is granted to the `administrator` role only — confirmed directly against production (`select * from call_center.role_permissions where permission_key = 'cma.evaluate'` → exactly one row, `administrator`). Granting it more broadly requires a `role_permissions` migration, which this session is **not authorized** to apply (§12).

Per brief §6 ("resolve the access-policy integration using the existing role model... do not grant broad permissions merely to make a screen work"), the resolution implemented is: the CMA path is used **only** when the viewer already holds `cma.evaluate`. Every other role continues to see the exact same legacy-sourced card as before this session — zero UX regression, no 403s surfaced to the user, no broad permission grant, and no bypass of the permission system. This is a real, necessary, explicitly-flagged dependency for a future session (a `role_permissions` grant migration, decided by whoever owns that governance call) — not something this session worked around.

## 7. Business Data Scope

Not re-implemented — reused. `handleCmaEvaluatePost` (`api/admin.ts`, unmodified) already resolves `toAgentAccess(user)` and passes it into `evaluateCmaMeasure`, the exact same scope mechanism already verified in CMA-3A.1/CMA-3B.1. The Dashboard's new calls go through this same route and therefore the same enforcement — no new authorization code was written, and none was bypassed. (The legacy ratio engine the still-pending 3 measures use has a documented, pre-existing scope gap — see `docs/SESSION_14_3_BUSINESS_DATA_SCOPE_AUTHORIZATION.md` — which this session did not touch or worsen; it is unrelated to the 3 measures this session migrated.)

## 8. Performance

Exactly one network request per Performance Ratios card, migrated or not — never both a legacy and a CMA call for the same card (confirmed live: 3 `GET .../analytics/metrics?resource=ratios` calls for FCR/Escalation/AHT, 3 `POST .../admin?resource=cmaEvaluate` calls for Resolution/Resolution Time/Auth Success, no duplicates). No new caching/aggregation infrastructure was added — `useCmaMeasure` is a plain TanStack Query hook, same pattern as every other hook in this app.

## 9. Verification performed

- `npm run typecheck` — clean.
- `npm run verify:full` — all 46+ suites pass, 0 failed.
- `npm run build` — production build succeeds (3,901 modules, no errors).
- **Live browser verification, on `npm run dev:vercel`, logged in as a real administrator account** (not claimed without being done): confirmed via direct network-request inspection —
  - 3 `POST /api/admin?resource=cmaEvaluate` (200 OK) — one per migrated card.
  - 3 `GET /api/analytics/metrics?resource=ratios` for `fcr`/`escalation_rate`/`aht` (200 OK, unchanged legacy path).
  - No console errors from the new code (one pre-existing, unrelated Supabase GoTrueClient warning only).
  - Rendered text confirms the CMA path is genuinely live, not coincidentally identical: the 3 migrated cards show "No eligible population" (this session's new `cmaMeasureUnavailableReason()` text) while FCR/Escalation still show the legacy engine's own "No qualifying interactions in this window." — two different code paths, visibly distinguishable.
  - Clicking the Resolution card navigated to `/ratios/resolution_rate`, the pre-existing deep link, unchanged.
  - (The local `vercel dev` proxy's known intermittent concurrency issue, documented in the two prior session reports, recurred twice during this verification pass on full-page reloads; each time the underlying page had actually loaded correctly per `get_page_text`/network inspection — only the screenshot-capture path was affected, not the application itself.)

## 10. Deliverables

- A, B, C/D classification and migration matrix: §2 above.
- Equivalence verification: §4.
- Filter/dimension and Business Data Scope handling: §5, §7.
- Independent calculation comparison: §4.
- Performance observations: §8.
- Tests and results: §9.

## 11. Remaining limitations (explicitly flagged, not silently deferred)

- **The permission gap (§6) is the real blocker to a full rollout.** Until `cma.evaluate` is granted to roles beyond `administrator` (a `role_permissions` migration — out of scope this session), non-administrator Dashboard viewers continue to see Resolution/Resolution Time/Auth Success sourced from the legacy engine, not CMA. This is not a regression (identical to pre-CMA-4A behavior for them) but it does mean CMA is not yet the Dashboard's single authority for every viewer.
- FCR, Escalation Rate, AHT remain on the legacy engine, unchanged, pending the 4 business-definition decisions — exactly as instructed.
- Active calls/agents, Agent Activity, Recent Interactions, and Action Required's live item list are not CMA measures and were correctly left alone (class D).
- The legacy ratio engine's own documented lack of Business Data Scope enforcement (§7, pre-existing) is unaffected by this session — not introduced, not fixed, out of scope.

CMA-4B was not started, per the final instruction.
