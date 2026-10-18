# Session CMA-4B — Operational Screen Integration

## Objective

Integrate eligible business measures across CALLCENTER operational screens
with the production CMA, reusing the existing evaluation API/hooks built
in CMA-4A/4A.1, without manufacturing equivalence where populations,
dimensions, or meanings genuinely differ.

## Screens assessed

Call Logs, Live View, Outbound Campaigns (list + detail), Human QA Review,
Human QA Quality Explorer (all 5 tabs), Automated QA Inspector, Action
Required, Agent Detail. Investigated read-only first (file-level tracing
of every displayed measure back to its real calculation source), before
any code was written — see the full mapping in
`docs/CMA_4B_OPERATIONAL_SCREEN_MIGRATION_MATRIX.md`.

## Measures migrated

**Outbound Campaigns list (`CampaignStatStrip.tsx`)** — "Targets" and
"success rate" (all campaigns combined) now call `cmaEvaluate` for
`CANON-CAMPAIGN-TARGET-COUNT` and
`CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI` when the viewer holds
`cma.evaluate`. "Campaigns" / "Running" / "Calls triggered" /
"unclassified" counts have no CMA canonical-measure equivalent and
remain computed from the fetched campaign list, as before.

**Campaign Detail (`CampaignDetail.tsx`)** — "targets", "success rate",
and "classified (policy)"/"successful (policy)" now call `cmaEvaluate`
for CAMP-01/02/03 filtered to that one campaign (`filters.campaign =
campaign.id`), same permission gate. The "Targets (N)" section heading
and its target-list-load-gap warning were deliberately **left on the
legacy, un-windowed count** — that specific number exists to detect a
real JOIN-level data gap between the raw target count and what target
rows actually render, and is explicitly documented in the file as
needing the un-windowed truth; using the CMA-windowed value there risked
a false "targets missing" alarm at a window boundary that doesn't
reflect the real bug it watches for.

New shared helper: `campaignAllTimeCmaWindow()` in `src/lib/cma/cmaWindow.ts`
— constructs the narrowest window guaranteed to cover every listed
campaign's targets (from the earliest campaign's `createdAt` to now),
since the legacy campaign RPCs have no time-window filter at all and
`cmaEvaluate` has no "all time" mode.

Both migrations reuse the exact permission-gated dual-path pattern
CMA-4A established for the Dashboard (`hasPermission(user,
'cma.evaluate')`; legacy hook/query stays fully functional and
unmodified for viewers without the permission — `operator`, who manages
campaigns day to day, does not currently hold `cma.evaluate`, so campaign
screens continue to show the identical pre-CMA-4B legacy numbers for
that role, never a 403, never a fabricated value).

## Measures deferred (real candidates, not implemented)

**Agent Detail's "Sentiment (voice)" / "Intent confidence (voice)"**
(`AGENT-SENT-01` / `INTCONF-01`) — confirmed in code
(`useAgentDetail.ts`) that these are computed from `useCallData({
page_size: 100 })`, the most recent 100 calls **globally** across every
agent, client-filtered down to the one agent being viewed. This is not
"all of this agent's calls in `[from,to)`," the population CMA's
AGENT-SENT-01/INTCONF-01 require — a lower-volume agent could show 0-2
results today despite months of real history in CMA. Migrating correctly
means rebuilding the hook to fetch per-agent against an explicit window
first, which is a real, separate piece of implementation work, not a
wiring change — flagged as a dependency for a future session rather than
forced through.

## Measures confirmed to have no safe migration path

**All 9 QA canonical measures (QA-CC-01 through QA-CCR-01).** This was
the session's central judgment call, confirmed by directly reading
`call_center_cma_evaluate_qa_measure`'s SQL (not assumed from names):
CMA's qa-family RPC is a `UNION ALL` of Human QA (`qa_findings`+
`qa_reviews` where `status='submitted'`) **and** Automated QA
(`automated_qa_observations`+`automated_qa_evaluations` where
`status='completed'`) — a combined population. `QaQualityExplorer.tsx`'s
9 "Quality Measures" (`computeQaRatios`), by contrast, are explicitly,
deliberately Human-QA-only — the page's own subtitle says so, and its
backend RPC (`call_center_qa_findings_list`) is a separate Human-only
query from the automated one. Migrating would silently turn a
Human-reviewer sample rate into a combined Human+Automated rate — exactly
the mistake the brief's §5 named and forbade. Checked for any other
screen with the combined population CMA computes (none exists —
`AutomatedQaInspector.tsx` is a per-evaluation record viewer with no
aggregate at all). **Conclusion: none of the 9 QA measures have any
honest UI occurrence to redirect to CMA today.** Not implemented,
documented instead — the correct outcome per the brief's explicit
instruction not to manufacture equivalence.

**`CHAT-SPAN-01`** — no screen in the app (`ChatLogs.tsx`, `Analytics.tsx`'s
chat tab) displays any average/aggregate chat-session-duration measure.
Nothing to migrate.

**`CANON-ACTION-REQUIRED-QUEUE-ITEMS`** — Action Required's full page,
like the Dashboard's card (CMA-4A finding, reconfirmed here), is a
work-item list/queue management screen with no standalone aggregate
count or rate display.

**Call Logs' "Intent accuracy"** — confirmed via direct inspection to be
a *different field* than CMA's `intent_confidence`
(`api/calls/data.ts`'s own `intent_accuracy`, page-scoped, recomputed
over whichever rows the current page returned — not a true population
aggregate), not the same measure despite the similar name.

## HIG review

Ran on the 3 modified files. 0 high-severity findings. One legitimate
medium finding was addressed: the "Targets (N)" section heading on
Campaign Detail was still reading the raw legacy `campaign.stats.targetCount`
while the stat strip above it could show the CMA-sourced `targetCount` —
two independently-sourced numbers for the same metric on one screen, with
no guarantee they'd stay in sync going forward. Fixed by pointing the
heading at the same `targetCount` variable the strip uses, while
deliberately leaving the separate join-gap diagnostic check (`campaign.stats.targetCount
!== targets.length`) on the raw, un-windowed count — that check exists to
catch a real data-loading bug and needs the un-windowed truth, not a
CMA-windowed figure, to avoid a false alarm at a window boundary. Two
low-severity advisory notes (no `aria-live` region on a value that can
now update after first paint; no visual "provisional" cue during the
brief legacy-to-CMA swap) were reviewed and left unaddressed — both are
near-certainly no-ops in practice (the two sources are byte-identical per
the production comparisons above) and would add new UI elements for a
low-likelihood case, which isn't warranted here.

## Business Data Scope

Not reimplemented — reused, exactly as CMA-4A already established. Both
migrated screens call the same unmodified `cmaEvaluate` route, which
resolves `toAgentAccess(user)` before evaluation. One concrete,
previously-undocumented consequence surfaced by this session: the legacy
`call_center_campaign_list`/`call_center_campaign_get` RPCs have **no
Agent Scope enforcement at all** (confirmed by reading their SQL — no
`agent_id = any(...)` predicate anywhere), unlike CMA. For a viewer with
`cma.evaluate` and a restricted Agent Scope, migrating to CMA means the
campaign totals they see will — correctly — narrow to their authorized
agents, where the legacy numbers never did. This is the intended
behavior (brief §9: "Business Data Scope must be applied before
aggregation... do not expose administrator-level results to restricted
viewers"), not a regression, and is called out explicitly here rather
than left as a silent behavior change. As with CMA-4A.1, no production
user currently has a restricted Agent Scope, so this specific narrowing
could not be exercised end-to-end this session — same honestly-reported
gap as before, not treated as proof of correctness.

## Production comparisons (not assumed — directly queried before implementation)

| Check | Legacy | CMA | Match |
|---|---|---|---|
| All-campaign targets (5 campaigns) | 8 (summed from `call_center_campaign_list`) | 8 (CAMP-01, unfiltered, window = earliest campaign → now) | Exact |
| All-campaign raw success (5 campaigns) | 2 classified / 2 success | 2 / 2 (CAMP-02, same window) | Exact |
| Single campaign targets | 1 | 1 (CAMP-01, `filters.campaign` set) | Exact |
| Single campaign raw success | 1 / 1 | 1 / 1 (CAMP-02, filtered) | Exact |
| Single campaign policy success | 0 classified (no campaign in production has policy-classification data yet) | 0 (CAMP-03, filtered) — correct honest empty state, not fabricated | Exact (both empty) |

## Tests executed

- `npm run typecheck` — clean.
- `npm run verify:full` — 46 tests, 0 failed.
- `npm run build` — clean production build.
- Live local verification (`npm run dev:vercel`, logged in as a real
  administrator): navigated to Outbound Campaigns — rendered values
  (8 targets, 100.0% success rate, 6 unclassified) matched the production
  comparison above exactly; navigated into the "TEST 12.3 Phase E"
  campaign detail page — rendered values (1 target, 100.0% success rate)
  matched its own single-campaign production comparison exactly.
  Confirmed via network-request inspection that real `POST
  /api/admin?resource=cmaEvaluate` calls fired for both pages (some
  requests appeared duplicated in the dev-mode capture — this is React
  18 StrictMode's deliberate double-invoke of effects in development,
  already confirmed as a dev-only artifact during CMA-4A's verification,
  not a real duplicate-request defect; production builds do not do this).
  *(Local verification required two server restarts this session —
  `vercel dev`'s known intermittent proxy instability, documented in
  three prior session reports, crashed once mid-session with its own
  internal `taskkill` error; a restart fully recovered it. Not caused by
  this session's code — the same class of issue documented before.)*

## Known discrepancies

None beyond what's already listed under "deferred"/"no safe migration
path" above — every genuine mismatch found was treated as a reason not
to migrate, not glossed over.

## Remaining dependencies

- Agent Detail's sentiment/intent-confidence migration needs
  `useAgentDetail.ts`'s call-fetching rebuilt to be per-agent-and-windowed
  instead of a global-100-row sample — a real implementation task for a
  future session, not a wiring change.
- The 9 QA measures remain unmigrated and, per this session's analysis,
  have no currently-safe path to CMA without either (a) a UI population
  mismatch, or (b) a future, deliberate product decision to build a new
  combined Human+Automated QA display that doesn't exist today — neither
  of which this session should decide unilaterally.
- The legacy campaign RPCs' lack of Agent Scope enforcement (found this
  session) is a pre-existing gap, same class as the legacy ratio engine's
  documented one (Session 14.3) — not fixed here (out of scope), but now
  documented.
- Restricted-scope end-to-end verification remains untested against a
  live session, for the same reason as CMA-4A.1 (no restricted-scope
  production user exists) — not worked around.

CMA-4C was not started. Nothing was committed, pushed, or deployed, per
this session's execution boundaries.
