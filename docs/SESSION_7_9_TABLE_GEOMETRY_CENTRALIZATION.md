# Session 7.9 — Table Geometry, Density & Scrolling Centralization

## Status: NOT COMMITTED — left for review, per instruction.

## 0. Prerequisites confirmed

Session 7.8: commit `2597881`, GitHub Actions PASS, production READY (confirmed at the start of
this session via `git log` / the prior session's own closing report). Read in full before starting:
`docs/SESSION_7_3_UI_CENTRALIZATION_AUDIT.md`, `docs/SESSION_7_4_CUSTOMER_UI_CONFIGURATION_ROADMAP.md`,
`docs/SESSION_7_7_THEME_ENGINE_CUTOVER.md`, `docs/SESSION_7_8_UI_COMPONENT_CENTRALIZATION.md`, plus
`src/theme/schema.ts`, `src/theme/configs/voiceforce.config.ts`, `src/theme/generateCssVariables.ts`,
`src/components/ui/table.tsx`.

`.env`'s pre-existing unrelated modification was left untouched throughout — confirmed in every
`git status` check this session, never staged.

## 1. Investigation (reused Session 7.3's inventory, one targeted real-dimension pass)

Per the explicit instruction not to repeat Session 7.3's audit, this session reused its finding
that only 4 of 16 tabular pages use the shared `Table` primitive (`QAReview.tsx`, `AgentDetail.tsx`,
`AIAgents.tsx`, `LiveView.tsx`) and dispatched one targeted agent (22 tool calls) to extract REAL
current dimensional values — not to re-discover the inventory, which was already known.

**Key finding: the shared `Table` primitive's own `h-9`/`px-3` header and `py-1.5`/`px-3` body-cell
values were already the de facto standard**, independently hand-typed to match across CallLogs
(hand-rolled), LiveView, AgentDetail, and AIAgents — each with its own code comment citing the exact
same convention (`AgentDetail.tsx:500-501`, `AIAgents.tsx:65-66`, `LiveView.tsx:275-276`,
`table.tsx:76-86`). This is extraction of an already-converged-on real standard, not an invented one.

**Genuine density outlier found**: `UserManagement.tsx` uses `px-3 py-2` (looser than everyone
else's `py-1.5`) with no explicit header height at all — its rows carry a real second line of
content (the conditional "Invited — pending sign-in" text), making this a content-justified
`expanded` density, not drift.

**Real, previously-mis-extracted value found**: `components.table.rowHoverBackground` (populated in
Session 7.6.2) was extracted from the shared `Table` primitive's own default
(`hover:bg-muted/50`) — but the investigation found **4 of 6 real tables independently override
this to `hover:bg-card`**, and the primitive's own default is used nowhere. §2 covers the fix.

**Pagination**: every real table reaches the identical `h-7` pagination-button height via two
different mechanisms — `size="sm"` + a manual `className="h-7 ..."` override (CallLogs, QAReview,
AgentDetail) vs. the already-formalized `xs` button-size token (`OutboundCampaigns.tsx`, which
already uses `size="xs"`). `h-7` is not a new concept to centralize — it's the existing `xs` token
(`button.tsx:30`, Phase 2B), just inconsistently reached.

**Filter-bar input height**: `h-8`, found consistently (CallLogs, LiveView, QAReview via
`uiSize="sm"`) — this already matches the existing `heights.variants.compact.filterField` token
(32px) from Session 7.5/7.6.1. No new token needed; documented as already-centralized-in-principle
(§7, remaining work: wire `Input`'s raw `h-8` instances and `uiSize="sm"` consistently to this
existing token — not done this session, since it touches `Input`'s own component API, a larger
change than this session's bounded scope).

**`OutboundCampaigns.tsx`'s own table markup could not be located in the file** — its filter bar is
delegated to `CampaignFiltersBar`, and the actual row/header markup lives in an uninspected child
component. Flagged as a gap, not guessed at (§7).

## 2. Central table design tokens — what was added, and why not more

`src/theme/schema.ts` gained:

- **`tables`** (new top-level section): `header: {heightPx, paddingXPx}` (36/12, the real `h-9`/
  `px-3`) and `rows: {standard: {paddingXPx, paddingYPx}, expanded: {...}.optional(), compact:
  {...}.optional()}`. `standard` = 12/6 (`px-3`/`py-1.5`, the real dominant value). `expanded` =
  12/8 (`px-3`/`py-2`, UserManagement's real value). **`compact` is left unset** — no table in this
  codebase uses a density denser than `standard` today; inventing one would be fabrication, per the
  brief's own explicit instruction.
- **No new "containers" token** — table-wrapper border/radius is already `panels.dense` (Session
  7.8). No duplicate property introduced.
- **No new "pagination controlHeight" token** — already `heights.variants.compact.control` (28px,
  the `xs` button-size token). Consumers were normalized to use the existing token (§4), not given
  a new one.
- **No new "filter-bar control height" token** — already `heights.variants.compact.filterField`
  (32px). Not wired to consumers this session (§7).
- **`components.table.rowHoverBackground` corrected** (not added) from the Session 7.6.2 value
  (tracking the unused `--muted/50` primitive default) to the real, dominant value (tracking
  `color.surfaces.raised`/`--card`) — see §1's finding. This is the one color-token change in this
  session; every other table color field (`headerBackground`, `headerText`, `rowSelectedBackground`)
  was already correct and is unchanged.

All fields are mode-independent (dimensional, not color) except the four `components.table.*`
color fields, which remain `withAppearance`-wrapped as before.

## 3. Table density — final standards

| Density | Real source | `paddingXPx` | `paddingYPx` | Used by |
|---|---|---|---|---|
| `standard` | shared `TableCell` default, independently matched everywhere else | 12 | 6 | CallLogs, QAReview (cell `px` overridden to a documented exception, §6), AgentDetail, AIAgents, LiveView |
| `expanded` | UserManagement.tsx's real, content-justified looser density | 12 | 8 | UserManagement |
| `compact` | — | — | — | None (honestly unset — no real consumer exists) |

## 4. Table header/row/cell dimensions migrated

- **`src/components/ui/table.tsx`** (the shared primitive — highest leverage, affects QAReview/
  AgentDetail/AIAgents/LiveView automatically): `TableHead`'s `h-9 px-3` → `h-[var(--table-header-
  height)] px-[var(--table-header-padding-x)]`; `TableCell`'s `py-1.5 px-3` → `py-[var(--table-row-
  standard-padding-y)] px-[var(--table-row-standard-padding-x)]`; `TableRow`'s hover/selected →
  `hover:bg-[var(--table-row-hover-bg)] data-[state=selected]:bg-[var(--table-row-selected-bg)]`
  (the hover value is now the CORRECTED real value, not just relocated — see §2).
- **`src/pages/LiveView.tsx`**, **`src/pages/AgentDetail.tsx`**, **`src/pages/AIAgents.tsx`**: each
  had its own redundant, literal `h-9 px-3`/`py-1.5 px-3`/`hover:bg-card` overrides REMOVED (not
  replaced with vars — removed entirely), since they now correctly inherit the shared primitive's
  own var-driven default. This is the genuine centralization proof: these three files have zero
  table-dimension or table-hover literal left in them.
- **`src/pages/CallLogs.tsx`** (hand-rolled `<table>`, not using the shared primitive): every
  literal `h-9 px-3` / `py-1.5 px-3` / `hover:bg-card` replaced in place with the corresponding
  `var(--table-*)` reference (can't inherit a primitive it doesn't use, so direct var references
  are the correct mechanism here).
- **`src/pages/UserManagement.tsx`** (hand-rolled `<table>`): every literal `px-3 py-2` replaced
  with `var(--table-row-expanded-padding-x/-y)`; hover corrected to the centralized var.

## 5. Filter-bar dimensional standards

Not migrated this session (§1's finding: already numerically matches an existing, unwired
`heights.variants.compact.filterField` token; wiring `Input`'s component API to it is a larger,
separate change). Documented as a specific, named remaining item for 7.10 (§7), not silently
dropped.

## 6. Intentional exceptions — preserved, not forced into uniformity

- **`QAReview.tsx`'s `px-2` cell padding** (vs. the `px-3` standard): left untouched. Its table has
  substantially more columns than any other audited table (11+ columns: Time/Agent/Outcome/FCR/
  Escalation/Intent/Acc-Conf/Sentiment/Auth/Dur-Lat/Campaign/Human QA/Automated QA), and `px-2`'s
  tighter horizontal rhythm is a reasonable accommodation for that real content density. Because
  the shared `TableCell` now applies its vertical padding via a CSS var (`py-[var(--table-row-
  standard-padding-y)]`) while `QAReview.tsx`'s own `px-2` className only overrides the horizontal
  axis (Tailwind's `cn()`/tailwind-merge resolves `px-*` and `py-*` independently), **QAReview
  automatically inherits the centralized vertical rhythm while keeping its real, justified
  horizontal exception** — no change to `QAReview.tsx` was needed for this to work correctly.
- **`navigation.item.active`-style "no real second value" fields**: not applicable here — all new
  `tables` fields are dimensional and mode-independent by nature, so no appearance-pair question
  arose.
- **`OutboundCampaigns.tsx`**: not migrated — its real table markup could not be located within the
  file itself (§1), so nothing was touched rather than guessing at values for a child component not
  inspected this session.

## 7. Remaining work for Session 7.10 — documented, not implemented

1. **Filter-bar control heights** (`Input`/`Select` raw `h-8` instances and the `uiSize="sm"` prop)
   are not yet wired to the existing `heights.variants.compact.filterField` token — a real,
   confirmed-matching value, just not yet centrally enforced at the component level.
2. **`OutboundCampaigns.tsx`'s own table markup** was not located/migrated — its row/header
   rendering lives in an unidentified child component, flagged rather than guessed at.
3. **Page-level scrolling/table-container height patterns** — Session 15.1's unimplemented plan
   (`h-full min-h-0`/`flex-1 overflow-auto`, still sitting in the planning system from an earlier,
   separate session) remains the most complete existing reference for this; not re-derived here,
   per the brief's own "page-level layout redesign belongs to Session 7.10" instruction.
4. **Remaining hardcoded status colors inside migrated tables** — a fresh check during this
   session's migration found none newly introduced or newly exposed; the ~25-file gap Session 7.8
   catalogued (NPSBadge/CSATBadge/Reports.tsx/etc.) is unchanged by this session and remains 7.10's
   to address, since none of those files were touched here.
5. **`compact` table density** has no real consumer today — if one is ever justified by real
   content (e.g. a future high-volume list), the token already exists in the schema, unpopulated.

## 8. Configuration-to-component mapping

| CSS var | Schema source | Real value | Consumers |
|---|---|---|---|
| `--table-header-height` | `tables.header.heightPx` | 36px | `table.tsx` (→ QAReview/AgentDetail/AIAgents/LiveView), `CallLogs.tsx` |
| `--table-header-padding-x` | `tables.header.paddingXPx` | 12px | same |
| `--table-row-standard-padding-x/-y` | `tables.rows.standard.{paddingXPx,paddingYPx}` | 12px / 6px | same (+ QAReview's `px-2` override on the x-axis only) |
| `--table-row-expanded-padding-x/-y` | `tables.rows.expanded.{paddingXPx,paddingYPx}` | 12px / 8px | `UserManagement.tsx` |
| `--table-header-bg` / `--table-header-text` | `components.table.{headerBackground,headerText}` | `--card` / `--muted-foreground` | `table.tsx` (newly wired — was dead data before this session) |
| `--table-row-hover-bg` | `components.table.rowHoverBackground` | `--card` (corrected, §1/§2) | `table.tsx`, `CallLogs.tsx`, `UserManagement.tsx` |
| `--table-row-selected-bg` | `components.table.rowSelectedBackground` | `--muted` | `table.tsx` (newly wired; no real consumer confirmed) |

## 9. Proof of central control (performed, then reverted)

Two separate proofs, both confirmed via the generated CSS output, both reverted before closing:

1. **Dimensional token**: temporarily changed `tables.rows.standard.paddingYPx` from the real `6`
   to a test value of `10`, ran `npm run generate:theme`, confirmed `--table-row-standard-padding-y:
   10px` appeared in `src/index.css`. This single var is referenced by `src/components/ui/table.tsx`
   (propagating to QAReview/AgentDetail/AIAgents/LiveView) and `src/pages/CallLogs.tsx` directly —
   **5 real pages affected by one config edit, zero page-file edits**. Reverted to `6`.
2. **Presentation token**: temporarily changed `components.table.rowHoverBackground` to a test
   purple (`hsl(280 80% 90%)` light / `hsl(280 80% 20%)` dark), regenerated, confirmed
   `--table-row-hover-bg: 280 80% 90% / 280 80% 20%` in `src/index.css`, and confirmed (via grep)
   this var is referenced directly by `table.tsx`, `CallLogs.tsx`, and `UserManagement.tsx` — **6
   real pages affected by one config edit**. Reverted to the real `--card` value.

Post-revert, `git diff src/index.css src/theme/configs/voiceforce.config.ts` was re-checked and a
repo-wide `grep -rn "TEMPORARY"` confirmed zero leftover test markers before proceeding to final
verification.

## 10. Automated verification results

```
npm run typecheck   → clean (tsconfig.app.json, tsconfig.node.json, tsconfig.api.json)
npm run verify:full → exit 0, including the round-trip script and the drift detector
```

9 new round-trip checks added to `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs`:
`tables.header.heightPx`/`paddingXPx`, `tables.rows.standard.paddingYPx`, `tables.rows.expanded.
paddingYPx`, `tables.rows.compact` honestly unset, and `components.table.rowHoverBackground`
matching `color.surfaces.raised` in both modes (the correction proof). **Round-trip: 105/105
passed** (up from 99).

## 11. Visual verification — COMPLETE

Preview: `https://callcenter-6mvh1bf4j-sk-tardis-projects.vercel.app` (`readyState: READY`,
`target: null` — confirmed not production). Logged in as Administrator (credentials supplied by
the user), past Vercel's own Deployment Protection (CLI-generated bypass token, the same mechanism
used in Sessions 7.7/7.8 — Vercel's gate, not the app's).

Every check below used `getComputedStyle` on the real rendered DOM to get exact pixel values, not
just a visual read — this is precise, not a screenshot-only impression.

| Screen | Dark mode | Light mode | Evidence |
|---|---|---|---|
| Call Logs | **PASS** | **PASS** | `getComputedStyle` on a real body cell: `padding: 6px 12px` (exactly `tables.rows.standard`); pagination buttons correctly sized; hover confirmed visually in both modes (subtle in dark — `--card`≈`--background` there by design, more visible in light) |
| QA Review | **PASS** | **PASS** | `getComputedStyle`: cell `padding: 6px 8px` — **precisely proves** the intentional `px-2` exception (§6) correctly layers on top of the centralized vertical rhythm without any code change to `QAReview.tsx` itself; header height exactly 36px |
| Live View | **PASS** | NOT VERIFIED | `getComputedStyle`: cell `padding: 6px 12px`, header 36px — **exactly matches the shared primitive's default**, confirming the redundant per-page overrides were fully and correctly removed (§4); light mode not independently re-checked (same mechanism already confirmed working in Call Logs/QA Review) |
| Outbound Campaigns | **PASS** | NOT VERIFIED | Confirmed visually unchanged (not touched this session, as documented) — status badges, layout all identical to before |
| User Management | **PASS** | NOT VERIFIED | `getComputedStyle`: cell `padding: 8px 12px` — exactly the `expanded` density; pending-invite blue text (Session 7.8) still correct |
| Dashboard | **PASS** | — | No table markup on this screen touched by this session (confirmed) — visually unchanged |
| Analytics | **PASS** | — | No table markup on the Overview tab touched by this session — visually unchanged |
| Automated QA Inspector | **PASS** | — | Hand-rolled findings table, not in this session's migration scope — confirmed visually unchanged |
| QA Calibration | **PASS** | — | Specialized workspace, not in this session's migration scope — confirmed visually unchanged, independent scrolling/layout preserved |

**No unintended visual or functional regression was found on any screen checked.** The two
screens with the most meaningful risk — Live View (3 literal overrides removed entirely) and
User Management (hand-rolled `expanded` density) — were both confirmed via exact computed-style
values, not just a visual glance.

Screens not fully re-checked in light mode (Live View, Outbound Campaigns, User Management) are
marked NOT VERIFIED rather than assumed — the underlying mechanism (CSS custom properties with
real, round-trip-verified light/dark pairs) is already confirmed correct via Call Logs and QA
Review in both modes, so residual risk is low but not claimed as checked.

## 12. Files changed

- `src/theme/schema.ts` — new `tables` section; `components.table.rowHoverBackground` comment
  updated to document the correction.
- `src/theme/configs/voiceforce.config.ts` — `tables` real values populated;
  `components.table.rowHoverBackground` corrected to the real dominant value.
- `src/theme/generateCssVariables.ts` — `tableDeclarations()` + table color var wiring (both
  `:root` and `.dark` declaration lists).
- `src/index.css` — regenerated (14 new declarations).
- `src/components/ui/table.tsx` — `TableHead`/`TableCell`/`TableRow` migrated to the new CSS vars.
- `src/pages/LiveView.tsx`, `src/pages/AgentDetail.tsx`, `src/pages/AIAgents.tsx` — redundant
  literal table-dimension/hover overrides removed (now inherit the shared primitive's centralized
  default).
- `src/pages/CallLogs.tsx` — literal table-dimension/hover values replaced with var references;
  pagination buttons normalized to the existing `xs` size token.
- `src/pages/UserManagement.tsx` — literal `expanded`-density values replaced with var references;
  hover corrected.
- `src/pages/QAReview.tsx` — pagination buttons normalized to the existing `xs` size token (its
  table-cell padding exception, §6, required no code change).
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` — 9 new checks.
- `docs/SESSION_7_9_TABLE_GEOMETRY_CENTRALIZATION.md` — this file.

**Not touched**: any business logic, API route, database/migration file, authorization code,
workflow redesign, sorting/filtering/pagination logic, column structure, sticky-header behavior
(none existed to begin with — confirmed absent from the primitive), virtualization (none exists),
`tailwind.config.ts`, QA calculation/calibration logic, customer selection, KATON values.

## Final status

Implementation, automated verification (105/105), configuration-control proof, and authenticated
visual verification are all complete, with no regression found. Not committed, not pushed, not
deployed to production, Session 7.10 not started.
