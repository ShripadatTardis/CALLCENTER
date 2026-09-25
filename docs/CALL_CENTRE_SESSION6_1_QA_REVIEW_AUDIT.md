# Session 6.1 — QA Review Audit & Cleanup

## 1. Current QA architecture (before this session)

`src/pages/QAReview.tsx` rendered three tabs — Review Queue, Completed Reviews,
QA Analytics — entirely from two hardcoded in-file arrays (`reviewQueue`,
`completedReviews`) with fake call IDs, fake caller names, fake reviewer
names, fake priorities, and fake scores. Clicking "Start Review"/"Continue
Review" opened `src/components/qa/QualityScoring.tsx` — a 5-criterion
weighted slider form (Intent Accuracy, Response Quality, Conversation Flow,
Escalation Handling, Customer Satisfaction) that computed a 0-100 weighted
score client-side. Its "Save Assessment" button called `onSave`, which in
`QAReview.tsx` was `handleSaveScoring`, which only did `console.log(...)` and
closed the modal — no persistence anywhere. Neither component made any API
or Supabase call.

## 2. Complete mock/no-op inventory

| Item | Location | Nature |
|---|---|---|
| `reviewQueue` array (3 rows) | `QAReview.tsx` | Hardcoded fake calls: `CALL-20241217-001..003`, fake caller names, fake `assignedReviewer` |
| `completedReviews` array (2 rows) | `QAReview.tsx` | Hardcoded fake reviews with fake reviewer names and fake free-text `feedback` |
| "Avg Quality Score: 85.7" tile | `QAReview.tsx` | Hardcoded literal, not computed from anything |
| Quality Score Distribution bars (23%/45%/22%/10%) | `QAReview.tsx` (Analytics tab) | Hardcoded literals |
| "+5.3% vs last month", "89.2% Intent Accuracy ↑2.1%", "4.2 Avg Reviews/Day" | `QAReview.tsx` (Analytics tab) | Hardcoded literals |
| "Filter Reviews" button | `QAReview.tsx` | No-op — no handler |
| "Start Review" / "Continue Review" buttons | `QAReview.tsx` | Opened the fabricated scoring modal; no real review record created |
| "View Call" button | `QAReview.tsx` | No-op — no handler |
| 5 weighted scoring sliders + per-criterion comments | `QualityScoring.tsx` | Fully client-side state, never sent anywhere |
| Star-rating display (1-5 stars ×5 boxes) | `QualityScoring.tsx` | Decorative, not wired to any score |
| "Save Assessment" button | `QualityScoring.tsx` | `console.log` only — no-op persistence |
| `getScoreColor`/`getScoreIcon`/`getPriorityColor`/`getStatusIcon` | both files | Pure display helpers over fabricated fields — removed with the fields they served |

No `Math.random()` was present (the fabrication here was static hardcoded
data, not randomized), but every other category in the prompt's audit list
(hardcoded scores, sample interaction IDs, sample agents/reviewers, fake
review status, fake disposition, fake pass/fail via the "Excellent/Good/
Fair/Poor" score-bucket bars, fake evaluation criteria, no-op buttons, no-op
save) was present.

## 3. Confirmed real data sources found and reused

- `useCallData` (`src/hooks/calls/useCallData.ts`) → `GET /api/calls/data` →
  live Voice interactions (the same hook Call Logs uses).
- `useChatLogs` (`src/hooks/chat/useChatLogs.ts`) → `GET /api/chat/logs` →
  live Chat sessions from `GET /api/v1/chat/sessions` (the same hook Chat
  Logs uses).
- `InteractionDetailDialog` / `ChatSessionDetailDialog` — reused unchanged
  for drill-down; no new fetch or transcript-rendering logic was written.

## 4. Backend capabilities found / not found

Searched the full repo (`src/`, `api/`, `supabase/migrations/`) and every
`docs/*.docx`-derived contract for: QA evaluation, manual review, scorecards,
evaluator output, reviewer assignment, quality criteria, approval/rejection,
coaching notes, audit status.

**None exist.** The only near-hits are cosmetic and unrelated:
- `public.app_role` enum (Lovable-era, `supabase/migrations/20251009...sql`)
  includes a `'qa_reviewer'` value, and `src/data/sampleUsers.ts` defines a
  client-side-only advisory user with that role and a `review_transcripts`
  permission — but this is purely a sidebar-visibility flag (see §8), not a
  review backend.
- `orchestrator_approvals` (same migration) has a `reviewer_id` column, but
  it belongs to the unrelated AI Conversation Orchestrator's flow-approval
  feature, not interaction QA.

No database model was created to preserve the old screen's appearance, per
instruction.

## 5. What was removed

- `src/components/qa/QualityScoring.tsx` — deleted entirely (only consumer
  was `QAReview.tsx`).
- Every hardcoded array, score, percentage, reviewer name, and no-op
  button/handler listed in §2.
- The "QA Analytics" tab's fabricated distribution/trend cards.

## 6. What remains as real read-only quality information

`QAReview.tsx` (route unchanged: `/qa-review`; sidebar label renamed to
**"Interaction Quality"**) is now a single, filterable, real-data table
merging live Voice and Chat interactions, sorted newest-first, with:

- **Operational signals**: Outcome, FCR (voice only — chat has no FCR
  concept), Escalation (voice: `escalation.trigger`; chat: not applicable).
- **Conversation signals**: Intent, Accuracy/Confidence (voice:
  `intentAccuracy` 0-100; chat: `latestConfidence` 0-1 — kept as visibly
  distinct scales/labels, never blended into one number), Sentiment
  (voice only — chat has no sentiment field, per Session 6's own finding),
  Authenticated.
- **Technical signals**: Duration (voice), Latency (chat's
  `latestLatencyMs` — voice has no confirmed per-call latency source, shown
  as `—`, never fabricated).
- **Campaign**: the real `campaignName` field already present on voice
  `call-data` rows, shown only when present.

Filters (Channel, Agent, Outcome, Escalation, FCR, Sentiment, intent text
search, "campaign interactions only") are built entirely from the *distinct
real values already present* in the fetched rows — no fixed enum of
possible values was invented.

Clicking a row opens the same `InteractionDetailDialog` (voice) or
`ChatSessionDetailDialog` (chat) that Call Logs/Chat Logs already use —
verified to be the corrected, working invocation pattern from the immediately
prior drill-down fix (voice dialog receives the full already-fetched
`Interaction` object directly, not a re-fetch by ID; chat dialog receives
the real `sessionId` directly) — so this screen could not reintroduce that
bug, since it never re-looks-up by a stored/foreign ID in the first place.

No score of any kind (composite, weighted, star, pass/fail) is shown
anywhere on this screen, and it does not duplicate or compete with Session
6 Agent Detail's Business Outcome / Conversational / Technical Performance
model — Agent Detail answers "how is this agent performing," this screen
answers "what happened in this interaction."

## 7. Future manual QA / evaluator recommendations (not implemented)

If a real manual-review workflow is wanted later, a separate, explicitly
scoped session should design and approve:

```
qa_reviews        (id, interaction_id, channel, reviewer_id, status, created_at, ...)
qa_review_items   (id, qa_review_id, criterion, score, comments)
qa_scorecards     (id, name, criteria jsonb, active)   -- if a configurable rubric is wanted
```

This would need: a real reviewer identity (the app currently has no
server-verifiable auth at all — see house rules), a persistence layer under
`call_center` or a new schema, and an explicit decision on whether any
score is exposed as "the" quality score anywhere else in the product. None
of this was built or scaffolded this session.

## 8. Authorization review

- `GET /api/calls/data` and `GET /api/chat/logs` (which this screen now
  reads) carry **no category-based authorization** — they return the same
  data to every authenticated user, identical to how Call Logs and Chat Logs
  already behave today. This screen introduces no new bypass and no
  narrowing of Customer 360's category model, because it never touches
  Customer 360's authorized-aggregate RPCs at all.
- The sidebar's `review_transcripts` permission check (`hasPermission`,
  advisory/client-side only — this app has no server-verifiable
  authentication anywhere, a standing, documented limitation) is unchanged:
  `call_center_head` and `qa_reviewer` sample users both already had it, and
  still do. Route-level (`ProtectedRoute`) access remains login-only, exactly
  as every other screen in the app.
- Customer 360's category-scoped authorization (`call_center_list_customers`,
  `call_center_get_customer_authorized`) is entirely untouched by this
  session.

## 9. Files changed

- `src/pages/QAReview.tsx` — rewritten (mock review queue → real,
  filterable Interaction Quality table).
- `src/components/qa/QualityScoring.tsx` — deleted.
- `src/components/layout/Sidebar.tsx` — one label change ("QA Review" →
  "Interaction Quality"; href/permission unchanged).
- `src/pages/CustomerDetail.tsx` — §10 polish: suppress the redundant
  `Ref: <value>` line when it equals the computed display label.

## 10. Verification results

- No fabricated QA scores remain — confirmed by full removal of
  `QualityScoring.tsx` and every score/percentage literal in `QAReview.tsx`.
- No `Math.random()`/hardcoded operational-quality values remain in the QA
  module — confirmed by full-file review; none existed before either (the
  fabrication was static, not randomized).
- No fake reviewer/status/approval data remains.
- All displayed values trace to `useCallData`/`useChatLogs`, the same live
  hooks Call Logs/Chat Logs use.
- Voice and Chat drill-down verified live: `GET /api/calls/data` and
  `GET /api/chat/logs` against production both return real rows (680 total
  calls, real chat sessions including `chat-de0e1945-...`), and the dialogs
  are invoked with the exact same object/ID shape as their known-working
  Call Logs/Chat Logs call sites.
- Agent identities: both hooks source `agentId`/`agentDisplayName` /
  `agentId`/`agentName` from the same `/agents`-rooted data Call Logs/Chat
  Logs/Campaigns/Agent Detail already use — no second identity model.
- No duplicate/conflicting quality formula vs. Session 6 — this screen
  computes nothing (no aggregation, no formula), it only lists and filters
  already-real per-interaction fields.
- No new serverless function — function count confirmed **11** before and
  after.
- `tsc --noEmit`: clean. `npm run build`: clean. `npm run lint`: 56 errors
  (down from the pre-existing 57-error baseline — deleting
  `QualityScoring.tsx` removed one baseline issue; zero new errors in any
  touched file).
- Customer 360's `CIF003` row: the redundant `Ref: CIF003` line is now
  suppressed (verified via code path — `sourceCustomerRef !== displayLabel`
  is false when they're equal, so the line doesn't render; `displayLabel`
  is computed once and reused for both the heading and the suppression
  check).

Deployed to production; confirmed serving 200 and returning live data
through the exact endpoints this screen depends on.
