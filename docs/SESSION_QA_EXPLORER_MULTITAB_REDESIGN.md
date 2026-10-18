# Session — Human QA Quality Explorer Multi-Tab Redesign

## Objective

Reorganize `/qa-review/explorer` (`src/pages/QaQualityExplorer.tsx`) from one long
vertically-stacked page (requiring ~50% browser zoom to see an overview) into five
tabs, with shared filters above, no change to data sources, calculations, or
business logic.

## What changed

`src/pages/QaQualityExplorer.tsx` only. One import added
(`Tabs`/`TabsContent`/`TabsList`/`TabsTrigger` from the existing
`@/components/ui/tabs` shared component — already used by `Analytics.tsx`,
`Settings.tsx`, `QaCalibration.tsx`, `ActionRequired.tsx`, etc., so this does not
introduce a new UI library or pattern). No other files touched.

The filters block (Channel / Agent / Submitted from / Submitted to / Reviewer)
stays exactly where it was, above the tabs, bound to the same `useState` values
it always was. Tab switching is pure client-side `Tabs` state — none of the six
analytical sections were rewritten, only moved inside a `<TabsContent>` wrapper
in place; every section still reads from the same `scopedFindings` /
`scopedReviews` / `ratios` / `reasons` / `trend` / `agentRows` / `outcomes`
values computed once above the tabs, so there is no duplicated data-fetching and
no new API calls.

Tabs, matching the brief exactly:

| Tab | Contains |
|---|---|
| Overview | Review Coverage, Quality Measures (all 9) |
| Failure Analysis | Failure Reasons (+ existing drill-down) |
| Trends | Quality Trend (+ existing parameter/period selectors) |
| Agent Performance | Agent-Level Quality |
| Interaction Outcomes | Human-Reviewed Interaction Outcomes |

The failure drill-down dialog and the `QaReviewDialog` evidence viewer are
unchanged and still rendered outside the tab content, so they work identically
regardless of which tab triggered them.

## Why this fixes the 50%-zoom problem

The page's actual content didn't shrink — it's now shown one section-group at a
time instead of all six stacked vertically, so a normal 1920×1080 or 1366×768
viewport at 100% zoom only has to fit one tab's content, not all of it at once.
No font sizes, spacing tokens, or component heights were changed anywhere —
this is purely a layout regrouping, consistent with `.claude/rules/ui-centralization.md`
(no new localized design values, no customer-specific conditionals, no new
styling system).

## Verification

- `npm run typecheck` — clean, no errors.
- `npm run verify:full` — all suites pass (exit 0; the one `FAIL:` string present
  in the log at the CMA registry test suite is an intentional negative-test
  assertion message, not an actual failure — confirmed by the suite's own `0
  failed` summary and the overall exit code).
- `npm run build` — production build succeeds (3,897 modules transformed, no
  errors).
- Tag balance sanity check: 1 `<Tabs>` / 1 `</Tabs>`, 5 `<TabsContent>` / 5
  `</TabsContent>` — matches the 5 tabs exactly.

**Live browser verification was attempted but could not be completed this
session**, for a reason unrelated to this change: `npm run dev:vercel` (`vercel
dev`) started successfully and served the page's HTML document instantly
(confirmed via direct `curl`, HTTP 200), but its internal proxy to the Vite
child dev server (`http://[::1]:<port>`) could not reliably complete more than
one concurrent request — every subsequent on-demand ES module request (even a
handful of unrelated files fetched in parallel via a plain Node.js script, with
no browser involved at all) hung or failed with `ECONNRESET`. A plain `vite`
dev server (`npm run dev`) on a separate port, with no `vercel dev` proxy in
front of it, served the full login page correctly and immediately. This
isolates the problem to `vercel dev`'s own dev-command proxy under concurrent
load on this machine — not to the Explorer page's code, not to the browser
automation tooling (confirmed separately: a non-localhost page also failed to
screenshot/evaluate during the same window, then worked normally once the
`vercel dev` process was stopped), and not something fixable by changing
`src/pages/QaQualityExplorer.tsx`.

Given that, this session is relying on the structural checks above
(typecheck, the full deterministic suite, and a clean production build) rather
than an in-browser screenshot. **Recommend a manual pass** before calling this
fully done: run `npm run dev:vercel`, log in, open `/qa-review/explorer`, and
click through all five tabs at 1920×1080 and 1366×768 to confirm filters
persist across tabs and all drill-downs still open correctly — the code change
is small and mechanical (JSX regrouping only, no logic touched), but an actual
visual pass is still the right final check given automated verification
couldn't complete it.

## Constraints honored

No CMA calculations/registry touched. No Supabase schema/API changes. No other
screens redesigned. No new UI dependencies. `.env` untouched.

## Addendum — commit, deploy, and live production verification

Committed as `c919a6a` (`feat(qa): organize quality explorer into analytical
tabs`), HIG-gate pass recorded (0 high-severity findings — one subagent review
flagged only two pre-existing, inherited-from-`Analytics.tsx` advisory notes:
no scroll-affordance indicator on the tab strip at narrow widths, and the
shared `Tabs` primitive's native `h-9` vs. the filter row's
`--height-filter-field` token — neither is a new defect introduced by this
change). Pushed to `main`; Vercel auto-deployed and aliased to
`callcenter-three-livid.vercel.app` (confirmed via `vercel inspect`).

The local `vercel dev` proxy issue reported above was not a blocker for
production verification — tested directly on the deployed URL instead:

- All five tabs (Overview, Failure Analysis, Trends, Agent Performance,
  Interaction Outcomes) load and render correctly at 1920×1080.
- Values in every tab match exactly what the unmigrated page showed
  (Review Coverage 136/16/13/10%/191/10; Quality Measures 97%/95%/99%/100%/100%;
  Agent-Level Quality rows for Inbound Banking Assistant/EMI Reminder/Forex
  Transaction) — confirms no calculation changed, only layout.
- Setting Channel = Voice in the filter row and switching through all five
  tabs confirmed the filter persists across every tab switch (Trends' and
  Agent Performance's numbers changed to the Voice-scoped subset, correctly,
  without needing to re-select the filter).
- The Failure Reasons drill-down dialog opens correctly from inside the
  Failure Analysis tab and shows real evidence turns.
- Re-tested at a narrower viewport (~1432×768, the automation tool's
  practical minimum, representative of the 1366×768 target): no page-level
  horizontal overflow (`document.documentElement.scrollWidth <=
  clientWidth`, confirmed via direct DOM check), Agent Performance's wide
  table scrolls within its own bounded region rather than the page.

Nothing else was deployed as a side effect — only this file and the session
doc were in the commit.
