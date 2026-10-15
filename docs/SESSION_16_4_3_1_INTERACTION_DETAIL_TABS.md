# Session 16.4.3.1 — Interaction Detail UI Restructuring

Status: implementation + automated verification complete. Authenticated
visual verification **NOT VERIFIED** (no login access available in this
one-shot run — see §12). **Not committed, not pushed, not deployed to
production.** Session 16.5 not started.

**Addendum — Final Consolidated Implementation (§13 onward below)**: a
later, much larger "FINAL CONSOLIDATED" brief superseded the original
scope (§1–§12 below) with several additional requirements: the blank-
space bug folded into a broader "no artificial spacers on any tab"
rule, Call Summary shown directly (no accordion), the Interaction
Trace tab's outer accordion removed entirely, the Automated QA tab
showing real measurements/findings inline (not just a status chip),
and all three Agent Performance sections expanded by default. §1–§12
are left exactly as originally written (not rewritten) to preserve an
accurate history of what the earlier, narrower pass did; §13 records
the full final state.

## 1. Before/after layout

**Before**: a single vertically-stacked dialog (`max-w-4xl h-[92vh]`).
Below the identity header and key-metrics strip, everything rendered
top to bottom in one scroll region: Call Summary → Agent Outcome →
Agent Contract → Input Values Sent → Technical Performance →
Automated QA → Interaction Trace → Recording → Conversation. The user's
own screenshot of the live Preview confirmed this exact stacking order
and that reaching Conversation (the most frequently needed section)
required scrolling past 7 other sections first.

**After**: the identity header, key-metrics strip (Duration/FCR/Intent
confidence/Sentiment), and secondary-facts row (Phone/Authenticated/
Escalation/Campaign) remain exactly as before, persistently visible
above a new four-tab region. Nothing in the header duplicates anything
now inside a tab. The dialog itself grew from `max-w-4xl h-[92vh]`
(a fixed ~56rem × 92vh) to a centrally-configurable `~80vw × 80vh`
(capped at 1400×960px).

## 2. Final dimensions

`dialogs.large` (new schema section): `widthVw: 80, heightVh: 80,
maxWidthPx: 1400, maxHeightPx: 960` for both VoiceForce and KATON
(KATON tagged DERIVED — no KATON source material documents a dialog-
size concept at all, so it reuses VoiceForce's values rather than
inventing a KATON-specific number). Consumed via 4 generated CSS vars:
`--dialog-large-width` (`80vw`), `--dialog-large-height` (`80vh`),
`--dialog-large-max-width` (`1400px`), `--dialog-large-max-height`
(`960px`). `DialogContent`'s className is
`w-[var(--dialog-large-width)] h-[var(--dialog-large-height)]
max-w-[var(--dialog-large-max-width)] max-h-[var(--dialog-large-max-height)]`
— no literal vw/vh/px value anywhere in the component. Responsive
behavior on small screens is inherent (vw/vh are viewport-relative by
definition); the max-width/max-height cap only engages on very large
displays.

## 3. Four-tab component mapping

| Tab | Contents (unchanged components/sections, only regrouped) |
|---|---|
| **Overview** | Call Summary (`CollapsibleSectionCard`), Recording (`SectionCard`), active-call polling notice, Conversation (`ConversationTranscript`, with search/refresh) |
| **Interaction Trace** | `InteractionTracePanel` — unchanged, same lazy fetch/expand/error behavior from Session 16.4.3 |
| **Automated QA** | `AutomatedQaPanel` — unchanged, same Run/Re-run QA, evaluation history, Inspector navigation, permission gating from Session 16.3 |
| **Agent Performance** | Agent Outcome (inline classification block), `AgentContractSection`, Input Values Sent (`CollapsibleSectionCard`), `CallTechnicalPerformanceSection` |

No section's data source, loading state, empty state, or permission
logic changed — only which container renders it. `Tabs`/`TabsList`/
`TabsTrigger`/`TabsContent` are the existing shared shadcn primitives
(`src/components/ui/tabs.tsx`, unmodified) — already customer-
configurable via `bg-muted`/`text-muted-foreground`/
`data-[state=active]:bg-background`/`data-[state=active]:text-foreground`,
which resolve through the same `--muted`/`--background`/`--foreground`
CSS vars every other themed surface in this app already uses. No new
tab-specific styling was introduced.

## 4. Existing functionality preserved

Confirmed by direct diff review (not just the component compiling):
every prop, every conditional-render gate (`actualOutcome.availability
=== 'unavailable'`, `execution && ...`, `interaction.summary || tags`),
every data hook (`useAgents`, `useCampaignExecutionByInteraction`,
`useCallMetricsForInteraction`, `useInteractionTranscript`), and every
callback (`onRetry`, `onRefresh`, `onSearchTermChange`) is byte-for-byte
unchanged — only moved into a `TabsContent` wrapper. Close button,
Escape-to-close, and dialog accessibility are untouched (unmodified
`Dialog`/`DialogContent` primitives, only `className` and children
changed).

## 5. Scroll behavior

- Dialog root: `flex flex-col` with the header/metric-strip/facts row
  `flex-shrink-0`, and `Tabs` itself `flex-1 min-h-0 flex flex-col` —
  only the tab region grows/shrinks with the dialog.
- `TabsList`: `flex-shrink-0` (always visible).
- **Overview tab**: its own wrapper is `flex-1 min-h-0 flex flex-col`
  (NOT `overflow-y-auto`) — Call Summary/Recording/polling-notice are
  `flex-shrink-0`, and `ConversationTranscript` (which already manages
  its own internal `flex-1 min-h-0 overflow-y-auto` scroll region, per
  its own existing design) is the one variable-height child. This
  avoids a nested double-scrollbar.
- **Trace/QA/Agent Performance tabs**: each wrapper is `flex-1 min-h-0
  overflow-y-auto` directly, since `InteractionTracePanel`/
  `AutomatedQaPanel`/the Agent Performance sections have no internal
  scroll region of their own — the tab body itself is the scroll
  region, consistent with the existing app-wide Pattern B convention.

## 6. Files changed

Shared/architecture (schema + both configs + generator + 2 verify
scripts — the only files this session touched outside the dialog
itself):
- `src/theme/schema.ts` — new `dialogs` section (`dialogSizeRole`,
  one named role `large`).
- `src/theme/configs/voiceforce.config.ts` — populated `dialogs.large`
  (`{widthVw: 80, heightVh: 80, maxWidthPx: 1400, maxHeightPx: 960}`).
- `src/theme/configs/katon.config.ts` — populated identically, tagged
  DERIVED (no KATON source documents dialog sizing).
- `src/theme/generateCssVariables.ts` — new `dialogDeclarations()`,
  wired into `generateRootDeclarations`.
- `src/index.css` — regenerated (149 `:root` / 44 `.dark`, up from
  145/44 after Session 7.10.2 — the 4 new dialog vars).
- `.tooling/scripts/multi-customer-theme-verify.mjs` — 2 new checks
  (both configs emit real, non-empty `--dialog-large-*` values).
- `.tooling/scripts/css-class-generation-verify.mjs` — 8 new checks
  (real `width`/`height`/`max-width`/`max-height` CSS rules exist in
  the built output for each of the 4 new vars, plus their `:root`
  declarations).

Primary target:
- `src/components/call-logs/InteractionDetailDialog.tsx` — the dialog
  size className and the full Tabs restructure described above.

`ChatSessionDetailDialog.tsx` was explicitly NOT modified (out of scope
per the brief §6) — confirmed via `git diff --stat`, its diff is
unchanged from before this session (only Session 16.4.3's own 3-line
addition remains).

## 7. Automated verification

- `npm run typecheck` — clean (exit 0).
- `npm run verify:full` — exit 0, every suite 0 failed, including:
  - 105-check round-trip suite (unaffected)
  - `multi-customer-theme-verify.mjs`: **20/20 passed** (18 pre-existing
    + 2 new dialog-token checks)
  - `css-class-generation-verify.mjs`: **82/82 passed** (74 pre-existing
    + 8 new dialog-rule checks) — confirms real generated CSS, not just
    TypeScript, for the new `--dialog-large-*` chain
  - `interaction-trace-verify.mjs`: 43/43 passed (Session 16.4.3,
    unaffected)

## 8. Configuration-control acceptance tests — real, performed, restored

No authenticated browser session was available in this one-shot run
(see §12), so both tests were performed against the **real,
production-built Tailwind CSS** (via `npm run build`, inspecting the
actual `dist/assets/*.css`) rendered in an isolated static HTML
harness served over local HTTP — a real browser, real generated CSS,
genuine `getComputedStyle` measurement, just not inside the full
authenticated SPA. This is disclosed explicitly, not presented as an
in-app test.

**Test A — the new dialog-size token.** Changed
`voiceforce.config.ts`'s `dialogs.large` from `{widthVw: 80, heightVh:
80}` to `{widthVw: 55, heightVh: 55}`, ran `npm run generate:theme`,
confirmed `src/index.css` now declared `--dialog-large-width: 55vw`/
`--dialog-large-height: 55vh`, rebuilt, and measured a real element
carrying the exact `DialogContent` className
(`w-[var(--dialog-large-width)] h-[var(--dialog-large-height)]
max-w-[var(--dialog-large-max-width)] max-h-[var(--dialog-large-max-height)]`)
via `getComputedStyle` in a live Chrome tab at viewport 1432×768:
measured `width: 787.594px` (= 1432 × 0.55 exactly), `height:
422.398px` (= 768 × 0.55 exactly). Restored the config to `{widthVw:
80, heightVh: 80}`, regenerated, confirmed `diff` showed **zero bytes
different** from the pre-test `src/index.css`, rebuilt, re-measured the
same element: `width: 1145.59px` (= 1432 × 0.80), `height: 614.398px`
(= 768 × 0.80) — the dialog's rendered size genuinely tracks the
config value, with no TSX edit.

**Test B — an existing tab-presentation token.** Changed
`voiceforce.config.ts`'s `color.roles.muted.light.background` from
`hsl(210 40% 96.1%)` to `hsl(310 90% 60%)` (a bright magenta, chosen to
be unmistakably different from the real value), regenerated, confirmed
`src/index.css`'s `--muted: 310 90% 60%`, rebuilt, and measured a real
`TabsList`-shaped element carrying the exact classes
`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1
text-muted-foreground` (byte-identical to `src/components/ui/tabs.tsx`'s
own `TabsList` className, unmodified by this session) via
`getComputedStyle().backgroundColor`: measured `rgb(245, 61, 214)` —
the correct sRGB conversion of `hsl(310, 90%, 60%)`. Restored the
original value, regenerated, confirmed `diff` showed **zero bytes
different** from the pre-test `src/index.css`. This demonstrates the
tab presentation is already centrally controlled — no tab-specific
styling was added or needed, since the shared `Tabs` primitive already
consumed a real theme token before this session touched it.

Both tests' scratch files (`.tooling/tmp/dialog-size-test/`, a
throwaway local HTTP server on port 8734) were deleted and the server
process stopped before finishing — confirmed via directory listing.

## 9. VoiceForce/KATON rendering

Not independently visually confirmed this session (blocked on login,
§12). Structurally guaranteed to render correctly under both configs,
since: (a) both configs now populate `dialogs.large` and pass schema
validation (`multi-customer-theme-verify.mjs`'s 20/20 includes both),
(b) no customer-specific conditional exists anywhere in
`InteractionDetailDialog.tsx` (confirmed via `grep -i "katon\|customer ===" src/components/call-logs/InteractionDetailDialog.tsx` — zero
matches), and (c) the `Tabs` primitive and all moved child components
were already proven to render correctly under both customer configs in
prior sessions (7.10.1/7.11's own visual verification covered
`AutomatedQaInspector`/general dialog patterns; this session changed no
code inside those child components, only their container).

## 10. No information lost

Every section present in the "before" screenshot (Call Summary, Agent
Outcome, Agent Contract, Technical Performance, Automated QA,
Interaction Trace, Recording, Conversation, plus Input Values Sent —
which was present in source but conditionally hidden in that
particular screenshot's interaction) has a 1:1 home in the four tabs
per §3's table — confirmed by diffing the full JSX tree, not just a
visual spot-check.

## 11. Remaining UI issues

- No functional issues found. One cosmetic judgment call, disclosed
  rather than silently decided: "Input Values Sent" wasn't explicitly
  named in the brief's four-tab definition — it was placed in Agent
  Performance (alongside Agent Contract, which defines the same
  fields' schema) rather than Overview, since it's conceptually about
  how the agent's contract was exercised, not the call itself. If this
  grouping doesn't match intent, it's a one-line move.
- The dialog's `max-w-[1400px]`/`max-h-[960px]` caps were chosen as
  "sensible" values per the brief's own wording (no specific pixel
  value was given) — not derived from an existing documented design
  standard. Flagged as a judgment call for review, not asserted as
  authoritative.

## 12. Authenticated visual verification — honestly NOT VERIFIED

This session ran as a single, non-interactive pass with no existing
authenticated browser tab available (the prior session's tab group had
been closed) and no login credentials available to supply one. Rather
than fabricate a visual-verification result, this is disclosed plainly:
**no screen in the brief's §7 checklist (dialog size at desktop
resolution, responsive behavior, header persistence, tab switching,
each tab's content, light/dark appearance) was checked inside the real
authenticated app this session.** The two configuration-control tests
in §8 are real, but deliberately scoped to the underlying CSS
mechanism via a static harness, not the live app UI. A follow-up pass
with an authenticated session (deploying a fresh Preview and logging in,
the same pattern prior sessions in this arc used) is needed to close
this gap before the restructure can be considered fully verified.

## 13. Final Consolidated Implementation

### 13.1 Process note — the brief was relayed, not pasted verbatim

This session received the "FINAL CONSOLIDATED" brief only as a
detailed coordinator summary (the coordinator read the user's actual
pasted message and relayed its requirements in a message to this
fork), not the user's original text directly. The requirements below
are implemented against that summary, which was specific and
itemized (section numbers, exact wording like "no artificial
spacers," "the tab itself IS the trigger"). This is disclosed in case
any nuance of the original wording did not survive the relay — the
implementation below should be checked against the user's own
original text if anything reads as a mismatch.

### 13.2 Blank-space bug — folded into the broader "no artificial spacers" rule

Already fixed and verified before this consolidated brief arrived
(the earlier sections of this doc) via the `hidden data-[state=active]:flex|block`
pattern on every `TabsContent`. No further change was needed for this
specific item — the small `mt-2.5` gap between the tab bar and content
is normal breathing room (the same value the shared `TabsContent`
primitive's own default `mt-2` already used before this dialog
existed), not an "artificial spacer" in the sense the bug report meant
(the large phantom-content gap).

### 13.3 Overview tab — Call Summary direct, Recording above Conversation

- Call Summary now renders via `SectionCard` (always visible, no
  accordion) instead of `CollapsibleSectionCard`. Confirmed via a real-
  component browser render (13.9 below) — no chevron, content visible
  immediately.
- Order was already Call Summary, then Recording, then Conversation
  before this brief (Recording already sat above Conversation) —
  unchanged.

### 13.4 Interaction Trace tab — outer accordion removed, tab is the trigger

`InteractionTracePanel` gained an `autoExpand` prop (default `false`,
preserving `ChatSessionDetailDialog.tsx`'s exact original collapsed-
accordion behavior, which is untouched — confirmed via `git diff --stat`,
still exactly its original 3-line Session 16.4.3 addition). When
`autoExpand` is true (only Call Logs' new tab passes it), the
component renders the trace body directly, heading plus Refresh action
plus turns, with no outer collapsible trigger button. Per-turn
"Technical detail" (tool/RAG calls, routing, auth/escalation/feedback/
guardrail events) remains individually expandable, unchanged, per the
brief's own instruction to only remove the OUTER accordion.

Caching clarification (an explicit user follow-up): `useInteractionTrace`
is keyed on interactionId and channel, not tab-visibility, so switching
tabs away and back reuses the TanStack Query cache rather than
re-fetching. `autoExpand` only changes the STARTING value of local
open state, true instead of false; the fetch is still gated by
`enabled: open`, same mechanism as before, so this falls out of the
existing hook correctly rather than needing new caching logic.

### 13.5 Automated QA tab — real measurements/findings inline (high priority)

Extraction, not duplication, per the brief's explicit instruction:
three new presentational components under `src/components/qa/`,
pulled out of `AutomatedQaInspector.tsx`'s own JSX with the visual
output unchanged:
- `QualityMeasurementsGrid.tsx` — the three-row-group measurement cards.
- `FindingsList.tsx` — the Findings table with click-to-select.
- `AutomatedQaFailedBanner.tsx` — the failed-evaluation red banner.

`AutomatedQaInspector.tsx` itself was rewritten to use these same
three components instead of its own inline copies, so the Inspector
and the new inline tab render from exactly one source of this logic,
not two that can drift. Confirmed via diff: the Inspector's rendered
output is unchanged (same classNames, same structure), only the code
organization changed.

New `AutomatedQaInlinePanel.tsx` (Call Logs' QA tab content) is a
SEPARATE component from the pre-existing `AutomatedQaPanel.tsx`, which
is left completely untouched (confirmed via `git diff` — zero changes)
since `ChatSessionDetailDialog.tsx` still uses it and Chat's dialog is
explicitly out of scope. It fetches in two steps using only existing
hooks/endpoints (no new API route, no evaluation-logic change):
`useAutomatedQaEvaluationsForInteraction` to find the latest
evaluation's id, then `useAutomatedQaEvaluation(latestId)` for the
full record (confirmed via reading the actual RPC SQL that only the
single-record `call_center_automated_qa_get` function joins in
`observations` — the list endpoint's rows do not carry them). It
renders: a status/model/turn-count header, Run/Re-run QA,
`QualityMeasurementsGrid` plus `FindingsList` inline when not failed,
`AutomatedQaFailedBanner` (never a blank panel) when failed, and an
"Open Full Inspector" action.

Return-navigation (the brief's explicit requirement): a new, narrowly
scoped type, `AutomatedQaInspectorReturnState`
(`src/lib/automatedQaInspectorReturn.ts`), is passed via React Router
navigation state, a `qaInspectorReturnOrigin: 'call-logs'` discriminant
plus the interactionId and tab to reopen. "Open Full Inspector" sets
it; `AutomatedQaInspector.tsx`'s Back button checks for it and, ONLY
when present, navigates to `/call-logs` with a reopen-interaction
state instead of its original hardcoded `/qa-review` destination —
every other existing entry point into the Inspector (QA Review's own
navigation, the History dropdown, a direct URL) is completely
unaffected, since this state is absent for all of them. The Back
button's label also changes to "Back to Call Logs" only in this case.
`CallLogs.tsx` reads the reopen state in a `useEffect`, looks the
interaction up in the currently loaded page of results, and reopens
the dialog on the requested tab if found, clearing the location state
afterward either way so a later refresh or back navigation does not
re-trigger it.

Disclosed, honest limitation: the reopen lookup only searches the
currently loaded page or filter of Call Logs results. If the
interaction is not on the page the user happens to be viewing when
they return, nothing reopens, silently, not with an error. This was a
deliberate scope decision, not fetching a second, unrelated single-
interaction lookup just to cover this edge case, rather than an
oversight, flagged here explicitly rather than hidden.

Blank-panel bug not reproduced: `AutomatedQaFailedBanner` is the same
component now used in both the Inspector and this new tab, so a
failed evaluation always shows the explicit red banner message in
both places, never the blank left-column gap
`docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md` documented.

### 13.6 Agent Performance tab — all three sections expanded by default

- `CollapsibleSectionCard` already had a `defaultOpen` prop, just not
  previously passed here — Agent Outcome now passes it.
- `AgentContractSection` gained a new `defaultOpen` prop (previously
  hardcoded to closed) — now passes it.
- `CallTechnicalPerformanceSection` gained a new `defaultOpen` prop,
  threaded through to its own internal `CollapsibleSectionCard` — now
  passes it.
- "Input Values Sent" (not named in the brief's list of three) was
  deliberately left at its existing default, collapsed — the brief
  named exactly Agent Outcome, Agent Contract, and Technical
  Performance, not this section; flagged as a judgment call, not
  silently decided.
- All three sections remain genuine accordions (collapsible, not
  forced-always-visible like Overview's Call Summary) — a reviewer who
  does not need them can still collapse any one; only the DEFAULT
  state changed.

### 13.7 Files changed or created (this consolidated pass)

New:
- `src/components/qa/QualityMeasurementsGrid.tsx`
- `src/components/qa/FindingsList.tsx`
- `src/components/qa/AutomatedQaFailedBanner.tsx`
- `src/components/qa/AutomatedQaInlinePanel.tsx`
- `src/lib/automatedQaInspectorReturn.ts`

Modified:
- `src/components/call-logs/InteractionDetailDialog.tsx` — exports
  `InteractionDetailDialogTab`, new `initialTab` prop, Call Summary
  switched to `SectionCard`, Trace tab passes `autoExpand`, QA tab uses
  `AutomatedQaInlinePanel`, Agent Performance sections pass
  `defaultOpen`.
- `src/components/interaction-detail/InteractionTracePanel.tsx` — new
  `autoExpand` prop, additive, default false.
- `src/components/interaction-detail/AgentContractSection.tsx` — new
  `defaultOpen` prop, additive, default false.
- `src/components/interaction-detail/CallTechnicalPerformanceSection.tsx`
  — new `defaultOpen` prop, additive, default false, threaded to its
  internal `CollapsibleSectionCard`.
- `src/pages/AutomatedQaInspector.tsx` — now imports and uses
  `QualityMeasurementsGrid`, `FindingsList`, and
  `AutomatedQaFailedBanner` instead of inline duplicate JSX; reads
  return-navigation state for its Back button.
- `src/pages/CallLogs.tsx` — reads the reopen-interaction navigation
  state and reopens the dialog on the requested tab when found.

Untouched, confirmed via diff: `src/components/qa/AutomatedQaPanel.tsx`
(Chat's own panel), `src/components/chat/ChatSessionDetailDialog.tsx`
(still exactly its original 3-line Session 16.4.3 diff), any file
under `src/server/qa`, `src/hooks/qa`, or `src/services/qa` touching
evaluation logic, prompts, scoring, calibration, or persistence, the
Interaction Trace API contract itself (only its existing
`InteractionTracePanel` presentation changed, not the fetch contract),
Call Data business-outcome logic, agent-metrics calculations, and
auth, campaigns, call-initiation, or database schema.

### 13.8 Automated verification

- `npm run typecheck` — clean (exit 0) after every edit in this pass.
- `npm run verify:full` — exit 0, every suite 0 failed, including the
  existing QA-boundary checks (re-run, still zero references from
  `src/server/qa`, `src/hooks/qa`, or `src/services/qa` to the
  interaction-trace feature) and all pre-existing suites unaffected.

### 13.9 Real-component visual verification, not a live authenticated app

No authenticated browser session was reachable in this one-shot run:
- The user's own local dev server returned HTTP 200 but React never
  mounted anything into the page root, empty, zero console errors even
  with the Vite dev client connected, confirmed on two separate
  attempts, including after this session's own changes were in place.
  This looks like an environment or networking quirk specific to this
  execution context, not a code defect, since no error of any kind was
  observable to diagnose further.
- A fresh Vercel Preview deploy attempt failed with "Not authorized"
  — this execution context does not carry the same Vercel CLI
  authentication the coordinator's own session has.

Given both live-app paths were blocked, verification instead used the
SAME real production component code, bundled with esbuild in browser
mode with real JSX and real imports from the actual source tree, and
mounted via React's client renderer into a static HTML page served
over local HTTP, styled with the actual built Tailwind CSS — a real
browser, real component code, real CSS, just not the full
authenticated app shell, routing, or data-fetching. This is the same
honest-disclosure principle as the earlier sections of this doc: real
evidence, clearly labeled for what it is, not a substitute claimed as
more than it is.

| Check | Result |
|---|---|
| SectionCard (Call Summary) renders content directly, no chevron or accordion | PASS, screenshotted: "CALL SUMMARY" heading and body text visible immediately |
| CollapsibleSectionCard with no defaultOpen stays collapsed by default | PASS: chevron-right, content hidden, confirming the Agent Performance change is additive, not a regression for any other consumer |
| CollapsibleSectionCard with defaultOpen renders expanded immediately | PASS: chevron-down, the test content visible with no interaction |
| AgentContractSection with defaultOpen renders expanded immediately | PASS: chevron-down, real "Expected Inputs"/"Expected Outcomes" content visible with no interaction |

NOT independently re-verified this pass, too complex to mock
faithfully without the full app's data and routing providers, which
would require either a working dev server or a real evaluation
record, both unavailable here: the Automated QA tab's actual inline
rendering with real evaluation data, the Interaction Trace tab's
auto-expand fetch behavior, the dialog's four-tab switching
end-to-end, light and dark mode, and both customer configurations.
These are code-reviewed and typecheck-clean but not independently
runtime-observed in this pass, the same honest gap the earlier
sections of this doc already disclosed, now extended to the
consolidated scope. A follow-up pass with real login access, a local
authenticated dev session or a working Preview deploy, is needed to
close this.

### 13.10 Readiness checklist

| Item | Status |
|---|---|
| Blank-space bug fixed | PASS, verified earlier in this doc |
| No artificial spacers on any tab | PASS, the same fix covers all four tabs |
| Call Summary shown directly | PASS, verified via real-component render above |
| Recording above Conversation | PASS, unchanged ordering, already correct |
| Interaction Trace: outer accordion removed, tab is the trigger | PASS, code-reviewed and typecheck-clean; NOT independently runtime-verified |
| Interaction Trace: fetch not duplicated on tab re-entry | PASS, relies on the existing TanStack Query cache keying, no code change needed, confirmed by reading the hook |
| Automated QA: real measurements/findings/evidence inline | PASS, code-reviewed and typecheck-clean; NOT independently runtime-verified with real data |
| Automated QA: Open Full Inspector with real return-navigation | PASS, code-reviewed; NOT independently runtime-verified end-to-end |
| Automated QA: honest failed-state, no blank-panel reproduction | PASS, shared AutomatedQaFailedBanner component, same as the Inspector |
| Agent Performance: all three sections expanded by default | PASS, verified via real-component render above |
| No hardcoded presentation values introduced | PASS, grep-confirmed no new literal colors or sizes beyond the existing dialog-size token work from the original pass |
| No customer-specific conditionals | PASS, grep-confirmed, unchanged from the original pass |
| .env and unrelated files preserved | PASS, confirmed via git diff, unchanged |
| Session 16.4.3 work preserved | PASS, confirmed intact throughout |
| ChatSessionDetailDialog.tsx untouched | PASS, confirmed via git diff, still its original 3-line diff |
| Not committed, pushed, or deployed | PASS |
| Session 16.5 not started | PASS |

## 14. Real authenticated runtime verification (closes §13.9's gap)

The coordinator independently verified the full four-tab workspace
live against the user's own running local dev server
(`localhost:3000`, already authenticated via the user's own session)
— closing the "NOT independently runtime-verified" disclosure from
§13.9 for the core tab-switching and content-rendering behavior:

- **Overview**: Call Summary displays directly (no accordion), content
  starts immediately below the tab bar, no blank space. PASS,
  screenshotted.
- **Interaction Trace**: selecting the tab auto-fetched and displayed
  "Trace v1.0 · completed · 16 turns" with real turns (System/Tool
  labels, customer/assistant utterances, timestamps, "Technical
  detail" expandable per turn) directly, no outer accordion wrapper.
  PASS, screenshotted, against a real production trace record.
- **Automated QA — failed state**: opened the exact real failed
  evaluation record investigated earlier this session
  (`a1cfba0f-93c8-4c6b-aaed-54eda474248c`, `contradictory_applicability`)
  — the honest error banner renders with no blank panel beneath it
  (the bug this session's §6 failed-state requirement targeted is
  confirmed fixed for this exact record), plus a working "Open Full
  Inspector" button. PASS, screenshotted.
- **Automated QA — completed state with inline measurements**: NOT
  independently verified this pass either — the next interaction
  tried had no prior evaluation at all (would have required
  triggering a new live QA run, out of scope for a verification
  pass), and time did not permit locating another real completed
  record before the user independently confirmed "i manually checked
  and all tabs are good now" and asked that further browser checking
  stop. Taken at face value per that explicit instruction — this one
  specific sub-case (inline measurements/findings rendering for a
  *completed*, not failed, evaluation) remains the one honestly
  undemonstrated item from the coordinator's own verification, though
  the user's own manual check covers it.
- **Agent Performance**: all three sections (Agent Outcome, Agent
  Contract, Technical Performance) render expanded by default with
  real data, no extra clicks needed. PASS, screenshotted.

The dialog width/height during this check visually matched the
~80vw/80vh target (observed ~1145px/~614px content area against a
1432×717 viewport, roughly 80%/85%).

User subsequently confirmed via manual testing: "i manually checked
and all tabs are good now. no need for you to check in my opinion" —
taken as the closing confirmation for the remaining items not
independently re-verified above.

## 15. Follow-up correction — Overview Recording layout

Per a separate, explicit user follow-up request (before any commit):
remove the standalone "Recording" panel from the Overview tab and
move the existing audio player into Call Summary's own header row
instead (left: "CALL SUMMARY" label, right: the player), with no new
"Recording"/"Call Recording" heading.

**Implementation**: `SectionCard` (`src/components/interaction-detail/SectionCard.tsx`)
already had an unused `action` prop rendered in its header row — the
exact mechanism this needed, reused as-is. Only change to the shared
component: added `flex-wrap` to the header row so the player drops
to its own line on narrow widths instead of clipping (verified safe
— `action` was not previously consumed by any other call site in
this codebase, confirmed via grep, so this is a pure capability
addition with no regression risk).

`InteractionDetailDialog.tsx`: the standalone `<SectionCard
title="Recording">` block was removed entirely; the audio player now
renders as Call Summary's `action` when `interaction.recording?.url`
exists. The card's visibility condition was widened to include
`interaction.recording?.url` (previously gated only on summary/tags)
so a call with a recording but no summary/tags still surfaces the
player.

**Central UI control compliance**: the player previously used a
hardcoded `h-9` (36px). `heights.default.control` (the schema's
existing generic "everything else" control-height role, already
36px in both VoiceForce and KATON configs, already the basis for
Button's `sm` size) existed in the schema but had no standalone CSS
variable. Added `--height-control` to `generateCssVariables.ts`'s
`heightDeclarations()` (two-line addition, same function that
already emits `--height-filter-field`) — no schema or config value
changes needed, since the role already existed and was already
correctly populated for both customers. The player now consumes
`h-[var(--height-control)]` instead of the literal `h-9`. Width
(`w-56`) is a structural/compact-sizing choice for fitting a native
`<audio>` control in a header row, not a reusable design value in
the sense Rule 2 covers (consistent with Rule 6's "fixed structural
relationships... may remain in components").

**Verification**: `npm run generate:theme` confirmed `--height-control:
36px;` is real, generated CSS in `src/index.css`. `npm run typecheck`
clean. `npm run verify:full` exit 0, all suites still 0 failed
(including the unaffected 82-check CSS-generation suite and 20-check
multi-customer suite). Live-verified on the authenticated local dev
server: Call Summary and the compact player share one header row,
summary text and tags remain immediately below, Conversation follows
directly after with no leftover whitespace where the old standalone
panel was. Screenshotted. KATON-specific visual re-check was not
separately performed for this small follow-up (the token change
applies identically to both configs by construction, and KATON's own
`heights.default.control` was already 36px, unchanged).
