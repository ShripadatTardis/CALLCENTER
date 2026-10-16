# Session 16.5.1 — Unified Call & Chat Interaction Detail + Manual QA

## Objective

Make Chat Session Detail use the same five-tab workspace architecture Call
Interaction Detail already used (Session 16.4.3.1): Overview, Interaction
Trace, Automated QA, Manual QA, Agent Performance — reusing shared
components wherever practical, never duplicating the Call UI, and never
building a second QA engine.

## Architecture

### Shared tab type

`src/lib/interactionDetailTabs.ts` is the new single source of truth for
the tab-identity union:

```ts
export type InteractionDetailTab = 'overview' | 'trace' | 'qa' | 'manualQa' | 'agent';
```

`InteractionDetailDialog.tsx` (Call) re-exports it under its original name
(`InteractionDetailDialogTab`) so every existing importer (`CallLogs.tsx`,
`automatedQaInspectorReturn.ts`) keeps working unchanged.
`ChatSessionDetailDialog.tsx` imports the shared type directly.

### Call detail (`src/components/call-logs/InteractionDetailDialog.tsx`)

Added a 5th tab, **Manual QA**, between Automated QA and Agent Performance,
rendering the new `ManualQaInlinePanel` with `channel="voice"`. Everything
else (Overview with Call Summary + audio player, Interaction Trace with
`autoExpand`, Automated QA via `AutomatedQaInlinePanel`, Agent Performance)
is unchanged.

### Chat detail (`src/components/chat/ChatSessionDetailDialog.tsx`)

Rebuilt from a flat, non-tabbed vertical stack (pre-dating Call Detail's
own 16.4.3.1 tab rework) into the same `Tabs`/`TabsList`/`TabsTrigger`/
`TabsContent` architecture, with the same `hidden data-[state=active]:flex`
/`:block` pattern on every panel (Radix keeps all tab panels mounted; this
is the documented, required guard against an inactive panel silently
consuming layout space).

- **Dialog sizing**: migrated from hardcoded `max-w-4xl h-[92vh] max-h-[92vh]`
  to the same `--dialog-large-*` CSS-var role Call Detail already uses —
  both dialogs are now controlled by the same central configuration.
- **Overview**: Session Context (unchanged `SectionCard`) + Conversation.
  No recording/audio player — a chat session has no `recording.url`
  equivalent, so Call's audio-player header slot is simply omitted, not
  left as an empty placeholder.
- **Interaction Trace**: `<InteractionTracePanel channel="chat" autoExpand />`
  — the component was already fully channel-generic; only `autoExpand` was
  newly added here (Call already had it), removing the outer accordion.
- **Automated QA**: swapped from the older, thinner `AutomatedQaPanel` to
  the same `AutomatedQaInlinePanel` Call Detail uses, with `channel="chat"`.
  Zero internal changes to the component were needed — it was already
  channel-generic; this session's header-comment claim that it was
  "deliberately separate" from Chat is now superseded.
- **Manual QA**: new tab, `ManualQaInlinePanel` with `channel="chat"`.
- **Agent Performance**: `AgentContractSection` (now `defaultOpen`, matching
  Call) + `Input Values Sent` (via `useCampaignExecutionByInteraction`,
  which is channel-agnostic — it resolves by `interactionId` alone, and a
  chat session id is a valid id for this lookup). **Not** shown for Chat:
  Agent Outcome (a chat session has no `actualOutcomeCode`/
  `structuredOutputs` fields at all) and Technical Performance
  (`CallTechnicalPerformanceSection` is explicitly voice-only per its own
  component comment). Neither is fabricated or stubbed — they are simply
  absent, exactly mirroring how Call Detail already omits sections with no
  real data.

### Manual QA — new component (`src/components/qa/ManualQaInlinePanel.tsx`)

Shared by both dialogs. Read-only summary of the latest Human QA review for
this interaction, reusing the existing Human QA data model unchanged:

- `useQaReviewsForInteraction(interactionId, channel)` for the review
  history/status (cheap list fetch).
- `useQaReview(latestId)` for the **full** record (conclusions + findings).
- "Start/Continue/View Review" always opens the existing `QaReviewDialog`
  — the real editing workspace, already channel-generic, completely
  unchanged. This panel never edits or influences an in-progress review;
  it only summarizes a review once one exists, which is what preserves
  blind-review independence automatically (there is no new write path).
- No new QA engine, no second review-status source of truth.

**Bug found and fixed during browser verification** (see "Bugs found and
fixed" below) — the initial implementation read `.findings` directly off
the list-fetched rows, which crashed because the list RPC never returns
that field.

### Full Inspector return navigation (brief §7 — explicit required fix)

`src/lib/automatedQaInspectorReturn.ts`'s `AutomatedQaInspectorReturnState`
was hardcoded to the single literal `'call-logs'` + the (now-renamed)
`InteractionDetailDialogTab`. Broadened:

```ts
qaInspectorReturnOrigin: 'call-logs' | 'chat-logs';
reopenInteraction: { interactionId: string; tab: InteractionDetailTab };
```

- `AutomatedQaInlinePanel.openFullInspector()` now derives the origin from
  its own `channel` prop (`voice` → `'call-logs'`, `chat` → `'chat-logs'`)
  rather than taking a new prop — the two are already a strict 1:1 mapping,
  so a separate input could only ever disagree with the one already known
  to be true.
- `AutomatedQaInspector.tsx`'s Back button now branches on
  `qaInspectorReturnOrigin` to navigate to `/call-logs` or `/chat-logs`,
  with the matching Back-button label ("Back to Call Logs" / "Back to Chat
  Logs").
- `ChatLogs.tsx` gained the same `reopenInteraction` location-state
  handling `CallLogs.tsx` already had: looks up the session by id in the
  **currently loaded page** of results only (same disclosed, honest
  limitation as Call Logs — not a full refetch), reopens the dialog on the
  requested tab, clears the nav state. `ChatSessionDetailDialog` gained an
  `initialTab` prop to support this.

## Bugs found and fixed during implementation/verification

### 1. `ManualQaInlinePanel` crash — list endpoint doesn't carry `findings`

**Symptom** (found live, in the browser, while clicking through Call
Detail's new tabs): switching to any tab after Manual QA had been rendered
once crashed the whole dialog —
`TypeError: Cannot read properties of undefined (reading 'length')` at
`latest.findings.length`, with React unmounting the entire tree (no error
boundary in this app, confirmed via the console's own
"Consider adding an error boundary" notice).

**Root cause**: `useQaReviewsForInteraction` calls the list RPC,
`call_center_qa_review_list_for_interaction`
(`supabase/migrations/20261016000000_manual_qa_review_foundation.sql:314`),
which does `select ... jsonb_agg(to_jsonb(r) ...) from qa_reviews r` — a
bare row from the `qa_reviews` table only. It never joins `qa_findings` or
`qa_turn_reviews`, so the returned objects have **no** `findings` key at
all (not an empty array — the key is absent). Only the single-record RPC,
`call_center_qa_review_get(reviewId)`, does the join and adds
`turnReviews`/`findings` via `jsonb_build_object`. This is the exact same
list-vs-get shape gap `AutomatedQaInlinePanel` already has to handle (its
own header comment documents it for the Automated QA list/get split).

**Fix**: `ManualQaInlinePanel` now mirrors `AutomatedQaInlinePanel`'s
two-step fetch exactly — `useQaReviewsForInteraction` is used only to find
the latest review's id/status; `useQaReview(latestId)` then fetches the
full record (with `findings`) for rendering. No RPC/migration change was
needed or made.

### 2. "Create Corrective Action" from a QA finding stays clickable after a CA already exists

Reported by the user with screenshots (not part of the original 16.5.1
brief, fixed as a directly-necessary CAM follow-up mid-session). The
button never actually created a second CA — `qaAdapter.ts`'s
`idempotencyKey: human_qa_finding:${finding.id}` /
`automated_qa_observation:${observation.id}` already guaranteed the server
silently returns the existing CA on a repeat submission. The bug was
purely that the UI gave no indication this had already happened, reading
as broken rather than "already done."

**Fix**: `QaReviewDialog.tsx`'s Summary panel and
`AutomatedQaInspector.tsx`'s Selected Finding panel both now look up
whether a CA already exists for the given finding/observation
(`useCorrectiveActions({ agentId, sourceType }, canView)`, matched
client-side by `sourceReferenceId`) and show **"View CA-0000XX"** instead
of "Create Corrective Action" once one exists, opening the real
`CorrectiveActionDetailDialog` inline. `useCorrectiveActions` gained an
optional `enabled` parameter (matching the existing pattern on other hooks
in the same file) so this lookup can be skipped entirely for users without
`corrective_actions.view`.

### 3. No link from a Corrective Action back to its source call/chat

Also reported by the user with a screenshot. `CorrectiveActionDetailDialog.tsx`
now shows an **"Open call/chat log for this interaction"** link whenever
the CA's `sourceContext` carries an `interactionId` + `channel` (i.e. it
was created from a QA finding — `qaAdapter.ts` always populates both).
Reuses the exact same `reopenInteraction` navigation-state shape Call
Logs/Chat Logs already consume — no new navigation mechanism. Same
disclosed limitation: only reopens if the interaction is in the target
page's currently-loaded results.

## Centralized UI compliance

No new colors, typography, spacing, dimensions, borders, or status
presentation were introduced. Every new/changed line was audited against
the actual git diff (`git diff | grep '^+'`) for hex colors, `rgb()`,
literal `px` dimensions, and bracketed Tailwind values — the only
bracketed-value hit in the new code
(`ManualQaInlinePanel.tsx`'s `h-[30px] ... text-[11px]` table header) is a
byte-for-byte reuse of `FindingsList.tsx`'s own existing table-header
recipe, not a new literal. Dialog sizing uses the existing
`--dialog-large-*` role end to end (now for both Call and Chat). No
customer-name conditionals were added to any component — both dialogs
render identically for VoiceForce and KATON.

## Verification

- `npm run typecheck` — clean across all three tsconfigs, both before and
  after the Manual QA / CAM fixes.
- `npm run verify:full` — all suites pass (0 failed); the one `FAIL:` line
  in the output is the pre-existing, expected negative-test string for an
  unknown customer configuration, not a real failure.
- Authenticated browser verification (`localhost:3000`, `vercel dev`):
  - **Call Logs**: opened a real interaction, clicked through all 5 tabs
    (Overview with Call Summary + audio player, Interaction Trace with
    `autoExpand`, Automated QA, Manual QA, Agent Performance with Agent
    Outcome + Agent Contract both expanded by default) — no console
    errors after the Manual QA fix.
  - **Chat Logs**: opened a real session (served via local-fallback data
    while the upstream chat history service was briefly unreachable —
    confirmed as a real, external, transient 502, not caused by this
    session's changes), confirmed the new `--dialog-large-*` sizing, all 5
    tabs present and working (Overview with no audio player, Interaction
    Trace, Automated QA now using the full `AutomatedQaInlinePanel`,
    Manual QA, Agent Performance) — no console errors.
  - **Corrective Actions**: confirmed the new "Open call log for this
    interaction" link on a real QA-sourced CA (`CA-000025`) correctly
    navigated to `/call-logs` and reopened the exact source interaction on
    the Overview tab.
  - Full Inspector return-navigation code path verified by code
    inspection and the shared-type/origin derivation described above;
    not separately re-exercised live in this pass (no failed evaluation
    with a fresh "Open Full Inspector" click was walked end-to-end this
    session beyond the existing Call-Logs round trip, which was already
    working pre-16.5.1 and is structurally unchanged except for the
    origin literal now being derived rather than hardcoded).
  - Centralized theme compliance verified by direct diff audit (see
    above) rather than a live KATON re-generation pass, since no new
    design tokens were touched by any change in this session.

## Known limitations / follow-ups not in scope

- Chat's Agent Performance tab cannot show Agent Outcome or Technical
  Performance — no underlying data exists for chat sessions for either
  (not a gap introduced here; honestly absent, matching the "don't
  fabricate" guardrail).
- The reopen-on-return mechanism for both Call Logs and Chat Logs only
  searches the currently loaded page of results — a pre-existing, now
  duplicated limitation, not introduced or worsened by this session.
- `ManualQaInlinePanel`'s existing-CA lookup for the "View CA" fix fetches
  CAs scoped by `agentId` client-side rather than by a direct
  `sourceReferenceId` server-side filter (which would require a migration)
  — acceptable at this app's current CA volume per agent; flagged as a
  possible follow-up if that assumption stops holding.
