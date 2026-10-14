# Session 7.7 — Theme Engine Wiring & Pixel-Parity Cutover

## Status: NOT COMMITTED — left for review, per instruction.

## 1. Objective

Activate the centralized VoiceForce UI configuration (`src/theme/schema.ts` +
`src/theme/configs/voiceforce.config.ts`, closed across Sessions 7.5–7.6.3) so the running
application consumes it, replacing `src/index.css`'s independently hand-maintained `:root`/`.dark`
CSS custom property values with generated output — while keeping the rendered UI visually
identical.

## 2. Architecture — build-time generation, one source of truth

**`src/theme/generateCssVariables.ts`** (new): pure functions `generateRootDeclarations(config)`
and `generateDarkDeclarations(config)` that map the validated `VoiceForceThemeConfig` to the exact
named CSS custom properties `src/index.css` already declared, each with a comment citing its
schema source path. Deliberately NOT a generic "every field" emitter — only the specific
properties `index.css` has always declared (plus two new `--nav-*` properties for Task 5's
navigation centralization). Fields with no CSS custom property counterpart (most of
`color.interactive.action`, `shadow`, `heights`, `icons`, `typography`, `charts`, `cards`,
`components.*` beyond what's listed below) are intentionally not touched — those stay literal
Tailwind utility classes at their call sites, deferred to Sessions 7.8–7.10 per this session's own
scope limits.

**`.tooling/scripts/generate-theme-css.mjs`** (new): the build-time generator script.
1. Self-bundles `schema.ts` + `voiceforce.config.ts` + `generateCssVariables.ts` via esbuild's JS
   API (no reliance on any pre-built or committed temporary file — see §7 for why this matters).
2. Runs `voiceForceThemeConfigSchema.safeParse()` against the active config — **fails the build**
   (non-zero exit) if it does not validate.
3. **Fails the build** if any generated declaration resolves to an empty value — no silent
   substitution.
4. Writes the generated `:root { ... }` / `.dark { ... }` block into `src/index.css`, between two
   marker comments (`GENERATED-THEME-VARIABLES:START`/`:END`) this script owns. Four CSS custom
   properties confirmed (by grep, Session 7.6.3) to be consumed only by the unused
   `src/components/ui/sidebar.tsx` primitive are preserved verbatim inside the markers, explicitly
   commented as "not sourced from the config" — not dropped, not silently re-derived.
   `--radius` is intentionally left outside the generated block (radii/cards migration is deferred).
5. Idempotent: re-running with no config change reports "already up to date" and writes nothing.

**Active configuration**: VoiceForce only, per Session 7.4 decision 8 ("make VoiceForce the explicit
default configuration") — there is no KATON config yet, so there is nothing to select between.

**Wiring**: `package.json` gained a `generate:theme` script, and both `predev` and `prebuild` run
it automatically — so `npm run dev` and `npm run build` (and therefore `npm run verify`, Vercel's
own build) always regenerate `src/index.css`'s block fresh from the config before building. This
makes the config the one source of truth: `src/index.css`'s generated block is now build output,
not hand-authored source, closing Task 4's "maintain one source of truth" requirement without
introducing a parallel CSS-in-JS system, a runtime theme engine, or any new API/serverless
function.

**Drift detector**: `.tooling/scripts/theme-css-generation-verify.mjs` (new) re-runs the generator
and asserts `src/index.css` doesn't change — i.e. confirms the committed file is currently in sync
with the config. Wired into `verify:full`. If someone hand-edits the generated block, or changes
the config without regenerating, this fails loudly instead of letting the two silently diverge.

## 3. Navigation state centralization (Task 5)

`src/components/layout/Sidebar.tsx` — the real, rendered app sidebar (confirmed again this session:
`src/components/ui/sidebar.tsx`, the generic shadcn primitive, has zero importers) — had 7 literal
Tailwind utility-color classes replaced with CSS-var-driven arbitrary values. This is a pure
1:1 literal substitution, no logic/structure change (see the diff in §8):

| State | Before | After | New CSS var |
|---|---|---|---|
| Focus ring (4 call sites) | `focus-visible:outline-cyan-400` | `focus-visible:outline-[var(--nav-focus-ring)]` | `--nav-focus-ring` (mode-independent, `color.interactive.action.default.focusRing`) |
| Icon-rail active pillar | `bg-cyan-600 text-white` | `bg-[var(--nav-active-background)] text-[var(--nav-active-foreground)]` | `--nav-active-background`/`--nav-active-foreground` (mode-independent, `navigation.item.active`) |
| Accordion pillar-heading active text | `text-cyan-500 dark:text-cyan-400` | `text-[var(--nav-heading-active-text)]` | `--nav-heading-active-text` (appearance-aware, new `navigation.item.headingActiveText` schema field) |
| Expanded menu-item active text | `text-cyan-600 dark:text-cyan-300` | `text-[var(--nav-item-active-text)]` | `--nav-item-active-text` (appearance-aware, new `navigation.item.expandedActiveText` schema field) |

Default, hover, and the sidebar border/divider states were **already** CSS-var-driven before this
session (`bg-sidebar`, `text-sidebar-foreground`, `hover:bg-sidebar-accent`, `border-sidebar-
border`) — they needed no component edit, only the generator populating `--sidebar-background`/
`--sidebar-foreground`/`--sidebar-accent`/`--sidebar-border` from the config (the first three
already existed from Sessions 7.6.1–7.6.3; `--sidebar-accent` required one addition to the
generator — see §9 for a self-caught error during this session).

The two new schema fields (`headingActiveText`, `expandedActiveText`) close the exact two gaps
Session 7.6.3 §11 flagged as remaining and undone.

## 4. Verification

```
npm run typecheck   → clean (tsconfig.app.json, tsconfig.node.json, tsconfig.api.json)
npm run verify:full → exit 0, including a true `npm ci` clean-install re-run (see §7)
```

- Round-trip script: **90/90 passed** (up from 88 — the two new navigation fields added 2 checks).
- Drift detector: **1/1 passed** — `src/index.css` is in sync with the config.
- Generated light/dark tokens match the pre-session hardcoded baseline **exactly** — confirmed by
  reading the generator's output against the original (pre-7.7) `src/index.css` values line by
  line before accepting the diff; every pre-existing `--background`/`--foreground`/`--card`/etc.
  value is byte-identical to before, in both modes.
- No new API routes or Vercel functions: `api/` still has exactly `admin.ts` and `campaigns.ts` as
  routable functions (the `_`-prefixed files are non-routed helpers, unchanged) — confirmed via
  `ls api/*.ts` before and no files added.
- `esbuild` was previously only a transitive dependency (via Vite); this session's two new scripts
  import it directly via its JS API, so it was added as an explicit `devDependency` and
  `package-lock.json` regenerated (`npm install --package-lock-only`) — a one-line lockfile change.

## 5. Preview deployment and route verification

An isolated Vercel **Preview** deployment was created (not production):

**Preview URL**: `https://callcenter-nb1xs609j-sk-tardis-projects.vercel.app`

Build log confirms `prebuild` → `generate:theme` ran during the Vercel build itself (not just
locally), and the deployment reports `readyState: "READY"`.

**Deployment Protection**: the preview is gated behind Vercel's own account SSO. This session's
sandboxed browser had no logged-in Vercel session, so `vercel curl` (CLI-authenticated) was used to
generate an `x-vercel-protection-bypass` token, which was then passed as a query parameter
(`?x-vercel-protection-bypass=...&x-vercel-set-bypass-cookie=true`) to get the browser past the
gate and onto the application's own login screen — Vercel's own gate, not the app's authentication,
and not a credential of any kind belonging to a real user.

**Authenticated verification — completed, logged in as Administrator** (credentials supplied by
the user after the initial report below was written; this section reflects the follow-up pass):

| Check | Method | Result |
|---|---|---|
| Deployed, built CSS contains the real generated values | `vercel curl` fetched the deployed `index-*.css` asset directly; grepped for every `--nav-*` and `--sidebar-accent`/`--sidebar-border` declaration | **PASS** — all values present, both light and dark, byte-identical to the config |
| SPA shell serves correctly on every route (no server error) | `vercel curl` on `/` and `/dashboard` | **PASS** — both return the same valid SPA shell HTML (client-side routing, unchanged architecture) |
| `Sidebar.tsx` diff is a pure literal substitution | Code review of `git diff` | **PASS** — confirmed zero logic/structure change, 7 lines changed, each a 1:1 class-string replacement |
| Dashboard — layout, badges, Performance Ratios, Action Required queue | Authenticated browser screenshot, light + dark | **PASS** — renders identically to the pre-session baseline in both modes; `escalated`/`resolved`/`Completed` badge colors correct |
| Call Logs — pinned header, scrollable table, pagination, badges | Authenticated browser screenshot, dark mode | **PASS** — table renders 50 rows, pagination controls reachable, `escalated`/`resolved` outcome badges correct colors |
| QA Review Explorer (`/qa-review/explorer`) | Authenticated browser screenshot, dark mode | **PASS** — filter bar, quality-measure cards, coverage stats all render correctly |
| Settings → Appearance tab | Authenticated browser screenshot + live interaction | **PASS** — tab renders; clicking "Light" instantly re-themed the entire app with no reload, confirming `ThemeContext`'s live-toggle behavior is fully intact |
| Navigation — icon-rail active pillar (`--nav-active-background`/`-foreground`) | Zoomed screenshot of the collapsed rail, light mode | **PASS** — teal (`#0891B2`) background, white icon, exactly matching the pre-existing `bg-cyan-600 text-white` |
| Navigation — accordion pillar-heading active text (`--nav-heading-active-text`) | Zoomed screenshot of the expanded overlay, both modes | **PASS** — light: `#06B6D4` (cyan-500); dark: `#22D3EE` (cyan-400) — correct and visibly distinct between modes |
| Navigation — expanded menu-item active text (`--nav-item-active-text`) | Zoomed screenshot of the expanded overlay, both modes | **PASS** — light: `#0891B2` (cyan-600); dark: `#67E8F9` (cyan-300) — correct and visibly distinct between modes |

**Second follow-up pass — remaining 6 named routes, now also checked:**

| Route | Result |
|---|---|
| Live View | **PASS** — table, status/sentiment badges, stale-indicator formatting all render correctly |
| Outbound Campaigns | **PASS** — status badges (Running/Paused/Draft/Stopped) and summary strip render correctly |
| QA Calibration (`/qa-review/calibration`) | **PASS** — tabbed workspace (Session 16.4.2), paired-interactions list render correctly |
| Analytics | **PASS** — date-range tabs, metric cards render correctly |
| User Management | **PASS** — user table, role badges, status indicators render correctly |
| Automated QA Inspector (`/qa-review/automated/:id`) | **PASS** — reached via the QA Review hub's "View latest evaluation" action; quality-measurement cards, findings table (`PASS`/`N_A`/`ISSUE`/`NO_ISSUE` badges), conversation panel all render correctly |
| QA Review (hub, `/qa-review`) | **PASS** — interaction table with Human QA / Automated QA status columns, including a red "Evaluation Failed" badge and green "Auto Run Completed" badges, both correct |

Every route named in this session's own TASKS list (Dashboard, Call Logs, Live View, Campaigns, QA
Review, Automated QA, QA Calibration, Analytics, User Management, Settings) has now been directly,
visually verified authenticated, with no regression found on any of them.

**Initial pass (pre-credentials) — what was verified without authentication:**

| Check | Method | Result |
|---|---|---|
| Local dev server: light/dark toggle, computed CSS variable values | Chrome browser automation against `localhost:8080` (same build pipeline) — read `getComputedStyle` for all 7 new/changed variables in both `localStorage.setItem('voiceforce.appearance', ...)` states | **PASS** — every value matches the config exactly in both modes (see §9 for the exact values captured) |
| Login/index page (`/`) renders correctly, both modes | Screenshot comparison, local dev server | **PASS** — light and dark both render correctly; dark background is the expected very-dark navy (`hsl(222.2 84% 4.9%)`), not a bug |

## 6. Known limitations

1. `--sidebar-accent-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`,
   `--sidebar-ring` remain hardcoded verbatim in the generator script, not config-sourced (Session
   7.6.3's confirmed-unused finding, unchanged).
2. The Badge/Alert `dark:` variants and the remaining sidebar-chrome properties Session 7.6.3 §11
   flagged are still not wired into the generated CSS — those are literal Tailwind classes at
   Badge/Alert's own call sites, explicitly deferred to Sessions 7.8–7.10 per this session's Task
   8 scope limit ("do not migrate application-wide badges, tables, cards, charts or typography
   yet"). (Despite this, Badge colors were visually confirmed correct on every route checked in
   §5, since this session did not touch Badge/Alert at all — they were never at risk.)
3. No visual regression testing tool (pixel-diffing) was available in this session; "pixel parity"
   is established by exact-value verification (the generated CSS literally reproduces the
   pre-session hardcoded values) plus direct authenticated screenshot review of every named route,
   rather than an automated pixel-diff comparison.
4. Not every secondary/nested screen was checked (e.g. a specific Call Detail dialog, Campaign
   Detail page, Agent Detail page) — verification covered the 10 top-level routes this session's
   TASKS explicitly named, not the full app surface.

## 7. GitHub Actions CI fix (additional task, addressed before completing this session)

**Root cause**: `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` (Session 7.6) imported
pre-built esbuild bundles from `.tooling/tmp/voiceforceConfig.mjs` and `.tooling/tmp/themeSchema.
mjs`. Every other `*-verify.mjs` script in this repo relies on the same `.tooling/tmp/*.mjs`
pattern, but — unlike those scripts' dependencies — these two specific files were local-only
artifacts from my manual `esbuild` runs during Session 7.6/7.6.1/7.6.2/7.6.3 development and were
never staged or committed in any of those sessions' commits. CI's `actions/checkout` produces a
clean working tree with no `.tooling/tmp/` directory at all, so `node .tooling/scripts/
voiceforce-baseline-roundtrip-verify.mjs` failed with `ERR_MODULE_NOT_FOUND` for
`.tooling/tmp/voiceforceConfig.mjs` on commit `2857a33`'s GitHub Actions "Verify" run — confirmed
directly from the failing run's log (`Cannot find module '/home/runner/work/CALLCENTER/CALLCENTER/
.tooling/tmp/voiceforceConfig.mjs'`), after all 50 preceding QA-comparison checks had already
passed in that same run.

**Correction**: rewrote `voiceforce-baseline-roundtrip-verify.mjs` to self-bundle at runtime, using
esbuild's JS `build()` API against a new `voiceforce-baseline-roundtrip-verify.entry.mjs` entry
file — the exact same pattern `.tooling/scripts/generate-theme-css.mjs` already uses — rather than
depending on any pre-built or pre-committed temporary file. Verified by deleting the local
`.tooling/tmp/voiceforceConfig.mjs`/`themeSchema.mjs` files entirely and re-running the script
(still 90/90 passed with zero tmp-file dependency), and by running a true `npm ci` (clean install
from `package-lock.json`, after first killing stray local `esbuild.exe`/`node.exe` processes that
had partially corrupted `node_modules` during an earlier interrupted install attempt) followed by
`npm run verify:full` (exit 0) — the closest reproduction of CI's clean-checkout conditions
available in this environment.

**Scope note**: this fix only touches the one script introduced this session. The other ~30
`*-verify.mjs` scripts across the repo use the same `.tooling/tmp/*.mjs` pattern, but — per `git
ls-files .tooling/tmp/` — their bundle dependencies ARE already committed to git (unlike this
one's two files, which were the actual gap). This session did not audit or modify those other
scripts; they were not implicated by the failing CI run.

## 8. Files changed

- `src/theme/generateCssVariables.ts` (new) — the generator functions, §2.
- `.tooling/scripts/generate-theme-css.mjs` (new) — the build-time generator script, §2.
- `.tooling/scripts/generate-theme-css.entry.mjs` (new) — esbuild entry file for the generator.
- `.tooling/scripts/theme-css-generation-verify.mjs` (new) — the drift detector, §2.
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` (modified) — self-bundling fix (§7)
  + 2 new checks for the navigation fields (§3).
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.entry.mjs` (new) — esbuild entry file for
  the round-trip script's self-bundling.
- `src/theme/schema.ts` (modified) — added `navigation.item.headingActiveText`/
  `expandedActiveText` (both optional, `withAppearance`-wrapped).
- `src/theme/configs/voiceforce.config.ts` (modified) — populated the two new fields with real
  values.
- `src/index.css` (modified) — the `:root`/`.dark` block inside `@layer base` replaced with the
  generated-block markers; current content is generator output, byte-identical to the pre-session
  hardcoded values plus the new `--nav-*` properties.
- `src/components/layout/Sidebar.tsx` (modified) — 7 literal Tailwind color classes replaced with
  CSS-var-driven arbitrary values, §3.
- `package.json` (modified) — `generate:theme` script; `predev`/`prebuild` hooks; `esbuild` added
  as an explicit `devDependency`; `theme-css-generation-verify.mjs` appended to `verify:full`.
- `package-lock.json` (modified) — one-line regeneration for the explicit `esbuild` dependency.

**Not touched**: `tailwind.config.ts`, `ThemeContext.tsx`, `Settings.tsx`, any badge/table/card/
chart/typography call site, any route, any authorization or business-logic file, any API route.

## 9. Self-caught errors during this session (for the record)

- The generator's first draft hardcoded `--sidebar-accent` as "preserved verbatim, unused" — this
  was wrong: `--sidebar-accent` is genuinely consumed (`Sidebar.tsx`'s `hover:bg-sidebar-accent`)
  and was already config-sourced via `navigation.item.hover.background`. Caught before running the
  generator for the first time, by re-deriving which `--sidebar-*` properties were truly unused
  per Session 7.6.3 §4's own table (only `--sidebar-accent-foreground`/`-primary`/`-primary-
  foreground`/`-ring` are unused) — fixed by adding `--sidebar-accent` to
  `generateCssVariables.ts` and removing it from the hardcoded-verbatim block.
- The original `.dark` block in `src/index.css` re-declared `--sidebar-primary`/`-primary-
  foreground` with values identical to `:root` (a real, if redundant, pre-existing fact) — the
  generator's hardcoded preserved-verbatim section was extended to replicate this exactly, rather
  than silently dropping the redundant re-declaration, to keep the generated output a precise
  match of the original rather than an "equivalent but different" one.

## 10. Production readiness recommendation

**Updated after the authenticated verification pass (§5).** Logged in as Administrator against the
isolated Preview deployment, all 10 routes this session's TASKS list explicitly named — Dashboard,
Call Logs, Live View, Outbound Campaigns, QA Review (hub), Automated QA Inspector, QA Calibration,
Analytics, User Management, and Settings → Appearance — were directly navigated to and visually
confirmed correct, including both light and dark mode on the routes checked in both, all three
navigation active-text states this session introduced (`--nav-active-background`/`-foreground`,
`--nav-heading-active-text`, `--nav-item-active-text`), and the live theme-toggle interaction
itself (clicking Light/Dark in Settings re-themes the whole app instantly, with no reload —
`ThemeContext` behavior fully intact). **No visual regression was found on any route checked.**

Combined with the exact CSS-value reproduction in the real deployed bundle, the reviewed
zero-logic-change component diff, 90/90 automated round-trip checks, and a clean `npm ci` +
`verify:full`, this is now **direct, not just indirect, evidence of visual parity** across every
route this session's own scope named.

**Recommendation: READY for production cutover.** The only remaining gaps (§6) are pre-existing,
explicitly out-of-scope items (unused `--sidebar-*` properties, Badge/Alert dark-variant wiring
deferred to Sessions 7.8–7.10) and secondary/nested screens not named in this session's TASKS list
— neither blocks this session's own objective.

## Final status

Not committed (left for review). Not deployed to production — only an isolated Preview exists.
Session 7.8 not started.
