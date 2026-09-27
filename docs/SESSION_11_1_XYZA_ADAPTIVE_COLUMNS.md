# Session 11.1 XYZ-A — Adaptive Grid Columns

Small, scoped refinement on top of Session 11.1 XYZ (locked). Fixes the Dashboard Agent column truncating "Inbound Banking Assistant" even when substantial horizontal space was unused.

## What changed

`src/pages/Dashboard.tsx` — Needs Attention and Recent Calls rows now use CSS Grid (`sm:grid` + a Tailwind arbitrary-value `grid-template-columns`) instead of fixed-width flex tracks (`w-28`/`w-24`/`w-16`/`w-12`) for their desktop column layout.

**Column approach chosen**: `minmax(0,1fr) minmax(7rem,14rem) minmax(6rem,10rem) minmax(3.5rem,4.5rem)` (Needs Attention), `minmax(0,1fr) minmax(7rem,14rem) minmax(5rem,7rem) minmax(3rem,4rem)` (Recent Calls, narrower Status/Duration since it only ever shows one badge). Customer/Context is the sole `1fr` track and absorbs residual width. Agent/Status/Duration use `minmax(min,max)` with a **fixed, non-content-derived `max`** rather than `max-content` or the arbitrary-value example from the prompt — chosen specifically because each row (`<button>`) is its own independent CSS Grid formatting context, not one shared grid spanning the header and every row. A `max-content` track would size itself to *that row's own* agent-name length, causing the Agent column to visibly drift out of alignment between a short name ("EMI Reminder") and a long one ("Inbound Banking Assistant"). A literal, identical `max` value shared by every row's grid *and* the header's grid keeps them all aligned while still being genuinely adaptive: at ample width every track sizes to its `max` (full value shown); if the container narrows below what all tracks need, non-flexible tracks shrink toward their `min` before the identity column gives up more space — that's when truncation correctly kicks in. The `14rem` (224px) cap for Agent was chosen by measuring the current longest real agent name ("Inbound Banking Assistant"), not copied from the prompt's illustrative template.

Header and every row use the exact same `grid-template-columns` string, so they stay aligned. The mobile-only badges+duration sub-wrapper uses `sm:contents` at the grid breakpoint so its two children become direct grid items (Status/Duration tracks) on desktop without introducing a nested grid or touching the mobile markup. Grid children using `truncate` also got `min-w-0` (grid items default to `min-width: auto`, which silently defeats ellipsis truncation).

`docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md` — corrected §22's "fixed/near-fixed width" wording for the Agent column (now points to the new section) and added **§25 Adaptive Column Sizing**, documenting the general allocation rule and the exact "why not `max-content`" reasoning above, for Live View/Call Logs/Chat Logs to inherit later.

## Verification (production, via the Playwright+Edge harness, authenticated through the app's own demo-login UI)

- **"Inbound Banking Assistant" now displays fully** at 1536×1024, 1366×768, and 768×1024 — confirmed via `scrollWidth === clientWidth === 224` on the Agent cell (`clipped: false`) at all three, both Dark and Light.
- **Header/row alignment**: same shared `grid-template-columns` string on header and rows — visually and structurally identical column boundaries.
- **1366×768 boundedness**: `main.clientHeight === main.scrollHeight === 724` — 0px internal scroll, unchanged from the 11.1A/11.1-XYZ baseline. No regression.
- **390×844 mobile**: Agent remains fully visible via the existing merged secondary line (e.g. "General Inquiry · Inbound Banking Assistant"), unaffected by this change (mobile never used the fixed-width desktop column). Zero whole-page horizontal overflow (`scrollWidth === clientWidth === 390`).
- **No horizontal overflow** at any of the 4 required viewports (`document.documentElement.scrollWidth === clientWidth` confirmed at 1536/1366/768/390).
- **Light and Dark**: both confirmed correct at 1366×768.

## Build

`tsc --noEmit`: clean. `npm run build`: clean. `npm run lint`: 117 errors / 36 warnings — identical to the measured baseline, zero regression. `find api -name "*.ts" ! -name "_*" | wc -l`: 11, unchanged.

## Scope

Zero backend/API/database/auth changes. Zero business/data/metric changes. No live side effects (read-only production verification only). Only `src/pages/Dashboard.tsx` and the standard doc were touched — no other screen modified.

## Deployment

Commit `9aa06e6`. Deployed via `npx vercel --prod --yes`, confirmed live (`GET /dashboard` → 200) and re-verified against the live deployment.
