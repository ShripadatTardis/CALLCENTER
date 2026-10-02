# Session 12.8 — TypeScript & Verification Baseline Repair

Pure engineering hygiene session: establish a truthful, permanent, zero-error TypeScript
verification baseline before Trace/Conversation Quality/Per-Call Metrics work begins. No product
feature, UI redesign, or business-semantics change was made.

## 1. The original problem

Session 12.7 discovered, while implementing Campaign Administration, that `npx tsc --noEmit` had
been silently checking **zero files** for the entire project's history up to that point, and that
`api/*.ts` (13 Vercel serverless function files) had never been covered by any TypeScript project at
all. This session makes both facts permanently fixed and impossible to accidentally repeat.

### Why bare `npx tsc --noEmit` was misleading

The root `tsconfig.json` is a TypeScript **solution file**: `"files": []` with only `"references"` to
`tsconfig.app.json` and `tsconfig.node.json`. A plain `tsc --noEmit` invocation against a root config
shaped like this does not build or check the referenced projects — it has an empty file list, so it
checks nothing and exits 0 unconditionally. This is a well-known but easy-to-miss TypeScript project-
references gotcha: the fix is either `tsc --build` (`-b`) against the root, or invoking `tsc --noEmit`
directly against each leaf project's own config with `-p`.

### Why `api/*.ts` was previously unchecked

`tsconfig.app.json`'s `include` is `["src"]`; `tsconfig.node.json`'s `include` is `["vite.config.ts"]`.
Neither includes `api/`. No third project existed to cover it. Vercel's own deployment build runs
`vite build` (esbuild/swc transpilation only — no type-checking), so a type error in `api/*.ts` could
reach production undetected by any existing script.

## 2. Final TypeScript project structure

Three independent, purpose-built projects, each covering exactly one runtime environment:

| Project | Covers | Environment | Notes |
|---|---|---|---|
| `tsconfig.app.json` | `src/**` | Browser (Vite/React) | Unchanged — DOM libs, bundler resolution, `strict: false` |
| `tsconfig.node.json` | `vite.config.ts` | Node (build tooling) | Unchanged — `strict: true` |
| `tsconfig.api.json` | `api/**/*.ts` | Node (Vercel functions) | **New this session** — `strict: true`, `types: ["node"]`, no DOM libs |

`tsconfig.api.json` only lists `api/**/*.ts` in `include`, but TypeScript checks every file an
included root file imports regardless of whether that file is separately listed — so `src/server/**`
(imported directly by `api/*.ts` via relative paths) gets genuinely checked as part of this project
too, without needing to be duplicated into its `include`.

The root `tsconfig.json` now references all three projects (for editor/IDE cross-project navigation
only — VS Code uses this to resolve imports across project boundaries). **It remains a `"files": []`
solution file and is deliberately not the typecheck entry point** — see §4 below for why a true
`tsc --build` composite setup was considered and rejected.

## 3. The four pre-existing errors — root causes and fixes

### a) `AnalyticsCallsByAgentDto` / `AnalyticsExportButton` (1 error)

`AnalyticsExportButton<T extends Record<string, unknown>>` only ever does `row[h]` with
`h: keyof T & string` inside `rowsToCsv` — which works for any object type regardless of whether it
has an index signature. The `Record<string, unknown>` generic constraint was simply over-strict:
`AnalyticsCallsByAgentDto` (`{ agent: string; count: number }`, no index signature) is a completely
valid row shape for CSV export but isn't *structurally* assignable to `Record<string, unknown>` under
TypeScript's rules.

**Fix**: loosened the generic constraint from `T extends Record<string, unknown>` to `T extends object`
in both `src/lib/csvExport.ts` (`rowsToCsv`) and `src/components/analytics/AnalyticsExportButton.tsx`
(`Props<T>` and the function signature). Zero behavior change. Confirmed all 5 existing call sites
(`AnalyticsOverviewTab`, `CampaignAnalyticsTab`, `ChatAnalyticsTab`, `CustomerAnalyticsTab`,
`VoiceAnalyticsTab`) remain valid under the looser constraint.

### b) `ChatIdentitySelector.tsx` type predicate (1 error)

`classification.agentsById` is `Map<string, AgentSummary>`. The code did
`.filter((a): a is { agentId: string; displayName: string } => Boolean(a))` — a type predicate
claiming a hand-picked subset of `AgentSummary`'s fields. TypeScript correctly rejects this: a type
predicate's asserted type must be assignable to the full parameter type (`AgentSummary | undefined`),
and a narrower object literal missing 8 of `AgentSummary`'s required fields is not assignable to it.

**Fix**: changed the predicate to `(a): a is AgentSummary => Boolean(a)` and imported `AgentSummary`
from `@/services/agents/agentsMapper`. This also fixed a latent inconsistency: the ternary's other
branch (`allAgents`, from `useAgents()`) already returned `AgentSummary[]` — both branches of
`categoryAgents` now produce the same real type instead of two different shapes.

### c) `resultRules.ts` `deriveCampaignResult` (2 errors)

Both return object literals predate Session 12.6's addition of `campaignClassificationCode` /
`classificationContractDrift` / `classificationNextActionType` to the `DerivedCampaignResult`
interface, and were never updated to include them. Confirmed via grep that `reconcileExecutions.ts`
is the only real caller, and it always spreads its own `deriveCampaignClassification()` result **over**
this function's return value (`{ ...derivedBase, agentId, agentName, ...classification }`) — so these
three fields' value here is only ever a fallback, never what the caller actually uses.

**Fix**: added `campaignClassificationCode: null, classificationContractDrift: false,
classificationNextActionType: null` to both literals — the same "no classification derived" default
`deriveCampaignClassification` itself returns for the no-policy case. Zero behavior change on the real
call path; verified via the two regression suites that exercise this function (§6).

### Bonus finding: `ratioDimensions.ts` (not one of the original 4, surfaced by genuinely covering `api/`)

Properly covering `api/**` (strict mode, transitively pulling in `src/server/analytics/ratioDimensions.ts`
via `api/analytics/metrics.ts`) surfaced one additional real error that `tsconfig.app.json`'s
`strict: false` had been masking: `rows.sort((a, b) => b.population - a.population)` where
`population: number | null` (a type genuinely shared with other DTOs that do have a legitimate
"unknown population" null state, even though this function always sets it to a real
`groupCalls.length`). **Fix**: `(b.population ?? 0) - (a.population ?? 0)` — the `?? 0` only guards
the type; it never actually fires for rows this function constructs, since `population` is always a
real number here. Zero behavior change; verified via `ratio-dimensions-verify.mjs` (4/4 passed).

## 4. Why `tsc --build` (true composite project references) was not used

Verified locally (disposable test) that `composite: true` + `noEmit: true` can coexist in a single
`tsc -p ... --noEmit` invocation. However, none of the three projects actually need to *consume*
another project's compiled declarations — `api/*.ts` imports `src/server/**` as raw source directly
(not through a reference boundary requiring emitted `.d.ts` files), and the app/node projects are
similarly independent. True composite-build machinery (declaration emission, `.tsbuildinfo` cache
files needing `.gitignore` entries, `composite: true` on every project) would add real, ongoing
maintenance surface for zero actual benefit here. The simpler, equally permanent and authoritative
solution — three independent `tsc --noEmit -p <config>` invocations chained in one npm script — was
chosen instead, matching the task's own "prefer the smallest conventional configuration" guidance and
"do not introduce fragile hacks" constraint.

## 5. Canonical commands

```sh
npm run typecheck    # tsc --noEmit -p tsconfig.app.json && ...tsconfig.node.json && ...tsconfig.api.json
npm run verify        # typecheck + production build
npm run verify:full   # verify + the 7 pure-logic deterministic suites under .tooling/scripts/
```

A successful `npm run typecheck` exit now genuinely means TypeScript examined every intended source
file — confirmed by the earlier no-op finding (a sanity-check broken-type line placed in a `src/`
file was silently ignored by bare `tsc --noEmit`, and is now caught by `npm run typecheck`).

### Why `lint` is not part of `verify`/`verify:full`

Running `npm run lint` (`eslint .`) repo-wide for the first time this session surfaced **117
pre-existing lint errors** across files never touched in this session or in 12.7 (orchestrator canvas
nodes, several `src/components/ui/*` primitives, `NPSCampaigns.tsx`, `src/types/orchestrator.ts`,
`src/utils/industryDataGenerator.ts`, `src/utils/industryTranscriptGenerator.ts`,
`tailwind.config.ts`) — almost entirely `@typescript-eslint/no-explicit-any` and a few
`no-empty-object-type`/`no-require-imports`/`no-useless-escape` findings. These are real but entirely
out of scope for a TypeScript-correctness hygiene session (fixing them would mean touching large,
unrelated legacy files — exactly the kind of scope creep this session was explicitly told not to do).
Including a permanently-failing, unrelated check in the canonical `verify` gate would make it an
unreliable signal (always red, regardless of what a future session actually changed) — the opposite
of this session's goal. `npm run lint` remains available standalone, unchanged, and every file this
session actually touched was individually confirmed lint-clean (0 new errors, 0 new warnings).
**A future, dedicated lint-cleanup session is recommended** to either fix or deliberately
suppress-with-justification the 117 pre-existing findings, then fold `lint` into `verify`.

### `verify:full` scope decision

Deliberately includes only the 7 pure in-process, zero-network, zero-credential suites:
`campaign-idempotency-verify.mjs`, `campaign-mapping-uniqueness-verify.mjs`,
`campaign-outcome-policy-verify.mjs`, `campaign-structured-outcomes-verify.mjs`,
`campaign-configuration-versioning-verify.mjs`, `ratio-math-verify.mjs`, `ratio-dimensions-verify.mjs`.
Deliberately **excludes** the Playwright/live-browser scripts (`campaign-live-verify.mjs`,
`ratio-r1/r2/r3-verify.mjs`, `ratio-sidebar-check*.mjs`, `responsive-*.mjs`) — those need a running
browser against a deployed URL and are not appropriate for an automated/CI gate. They remain
available to run manually exactly as before.

### Infrastructure gap closed along the way

None of `.tooling/scripts/*.mjs` or `.tooling/tmp/*.mjs` (the esbuild-bundled source copies those
scripts test against) had ever been committed to git, despite being created and relied on across
multiple prior sessions (12.5, 12.6, 12.7) — they existed only on the local filesystem. This meant the
new CI workflow would have failed immediately on a fresh checkout. This session committed the 6
`.tooling/scripts/*.mjs` files and 8 `.tooling/tmp/*.mjs` bundles that `verify:full` actually depends
on (regenerating the 3 bundles whose source changed this session: `resultRules.mjs`,
`reconcileExecutions.mjs`, `ratioDimensions.mjs`).

## 6. CI

No CI existed before this session (no `.github/workflows/`, no `.gitlab-ci.yml`; `vercel.json` only
has rewrites and cron paths, no build gate). Added `.github/workflows/verify.yml`: on push/PR to
`main`, checkout → Node 20 with npm cache → `npm ci` → `npm run verify:full`. No deploy step, no
secrets — exactly the "dependency install, typecheck, lint/tests as appropriate, build" shape
requested, minus `lint` for the reason in §5.

## 7. Verification results

**`npm run typecheck`**: 0 errors (previously 4 known + 1 newly-surfaced, all fixed above).

**`npm run verify`** (typecheck + build): passes. Build output unchanged in character (same
>500kB chunk-size advisory warning as every prior session — not a regression).

**`npm run verify:full`**: passes — **100/100** deterministic assertions:

| Suite | Result |
|---|---|
| campaign-idempotency-verify | 15/15 |
| campaign-mapping-uniqueness-verify | 9/9 |
| campaign-outcome-policy-verify | 23/23 |
| campaign-structured-outcomes-verify | 24/24 |
| campaign-configuration-versioning-verify | 8/8 |
| ratio-math-verify | 17/17 |
| ratio-dimensions-verify | 4/4 |

The two suites that directly exercise the changed `deriveCampaignResult` (campaign-outcome-policy,
campaign-structured-outcomes) and the one that exercises the changed `ratioDimensions.ts`
(ratio-dimensions) were re-run specifically against freshly-regenerated esbuild bundles of the
changed source — all green, confirming zero behavioral regression from the type fixes.

**`npx eslint`** on every file touched this session: 0 new errors, 0 new warnings (the single
pre-existing `react-hooks/exhaustive-deps` warning in `ChatIdentitySelector.tsx`, unrelated to the
line changed, was already present before this session).

## 8. Build and deployment

Production build (`npm run build` / `vite build`) passes. Deployed through the repository's normal
git → Vercel integration path (push to `main`). Vercel "Production" here is this project's
deployment/testing stage, not an operational customer call-centre environment. Since every change
this session is type-only (no intended runtime behavior change), browser smoke verification covered:
Analytics → Voice tab (CSV export button, touched by the `AnalyticsExportButton` fix) and Initiate
Chat's category-scoped agent selector (touched by the `ChatIdentitySelector` fix).

## 9. Confirmation

- `src/` is genuinely type-checked (`tsconfig.app.json`, unchanged, always was — now explicitly
  reaffirmed as part of the canonical `npm run typecheck`).
- `api/` is genuinely type-checked for the first time ever (`tsconfig.api.json`, new).
- All 4 originally-reported pre-existing errors, plus 1 additional error genuinely surfaced by
  properly covering `api/` under `strict: true`, are fixed at their root cause — no suppressions, no
  `any`, no excluded files, no weakened compiler options anywhere.
- Repository-wide intended TypeScript baseline: **0 errors**.
- `npm run typecheck` is permanent, canonical, and genuinely checks every intended file.
- `npm run verify` / `npm run verify:full` exist, are deterministic, and pass.
- Regressions directly touched by the 4 fixes (2 Campaign suites + 1 Ratio suite) re-verified green;
  the full 7-suite deterministic gate passes at 100/100.
- Build passes; deployment follows the existing path.
- No product capability, business semantics, Campaign behavior, Call/Chat Data semantics,
  Customer360 behavior, Call/Chat Detail presentation, or Ratio Explorer calculation was
  intentionally changed. The one behavioral-adjacent line (`ratioDimensions.ts`'s sort comparator)
  is a type-safety guard around a case that never actually occurs in this function's own output —
  confirmed via its regression suite.
- No Supabase migration was required or made. No telephone call, no campaign launch, no external
  business action.
