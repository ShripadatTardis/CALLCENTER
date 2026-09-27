# Session 11.7 — AI Agents Implementation

Implements the approved recommendations in `docs/SCREEN_REVIEW_06_AI_AGENTS.md`
(including its addendum), reconciled against `docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md`'s
confirmed Campaign Result policy and the coordinator's follow-up
amendment confirming that policy explicitly. VoiceForce-only: no Call
Centre code touched, no revised/enhanced Partner API field mocked or
fabricated, no `agent_version`, no VoiceForce-side LLM, no DB schema
changes, no Initiate Call changes, no live calls/messages/campaigns
triggered. **Not deployed** — local commit only, per this session's
explicit instruction to report before deploying.

---

## A. Avg Handle Time — correctness fix

**Root cause confirmed exactly as the review found it**: `src/lib/format.ts`
already defines `isStaleDuration()` (4-hour guard) and single-call
formatters already use it, but `computeAgentCallMetrics()`
(`src/services/agents/agentPerformanceAggregator.ts`) averaged every
call's raw `durationSeconds` with no such guard — one dirty demo row
(implausible duration from a `start_time` months in the past) could
silently drag an agent's average up by tens/hundreds of hours.

**Fix applied**: `computeAgentCallMetrics` now filters `isStaleDuration()`
rows out of the average (same guard, not a new/second outlier rule),
and returns a new `staleAhtExcludedCount` field. Agent Detail's
Technical Performance section now shows an explicit caveat — "`N`
call(s) excluded from Avg handle time (implausible/stale duration, same
4h guard used elsewhere)" — only rendered when `staleAhtExcludedCount > 0`,
so agents with no stale rows see no extra text.

No before/after live numbers captured (see §Verification limitation
below — local `vercel dev` could not reach the live Partner API this
session); the fix is a mechanical, directly-inspectable change to the
averaging input set, not a numeric claim requiring a live before/after
screenshot to trust.

---

## B/C. AI Agents list + agent-scoped campaign usage

`src/pages/AIAgents.tsx` reskinned to G1/C1/S1/L1: **Agent | Direction |
Usage | Action**.

- **Agent**: `display_name` primary line, Default badge inline (unchanged
  mechanism — `agent.isDefault`), immutable `agent_id` as a compact
  secondary mono line underneath. Identity cell has no fixed max-width
  (C1), so "Inbound Banking Assistant" never truncates.
- **Direction**: unchanged `secondary` badge, `formatStatusLabel(agent.direction)`.
- **Status / Contract columns**: deliberately not added — `status` and
  contract metadata are not live (§13 of the review).
- **F1 filtering**: deliberately not added — 3 agents, no useful filter
  dimension yet (§7 of the review).
- **Usage**: real campaign count for this exact immutable `agent_id`.

**Agent-scoped campaign query — smallest appropriate capability, no
schema change**: rather than adding a new repository method/RPC/API
route, I added one small pure function, `countCampaignsByAgent()`
(`agentPerformanceAggregator.ts`), that groups an already-fetched
`CampaignWithStats[]` array by `agentId`. The list screen calls the
existing `useCampaigns({ pageSize: 100 })` hook (same hook/bound
`useAgentDetail` already used) and feeds its result through this
function — one function, two consumers (list Usage column, Detail
Campaign Usage section), exactly as instructed. This is bounded to the
most recent 100 campaigns, same convention as every other "bounded
sample" metric in this app (Calls/Chats handled); the list surfaces a
tooltip caveat ("Counted from the most recent 100 campaigns") only if
`pagination.totalCount > 100`. **No new Vercel function, no new SQL,
no new migration** — function count is unaffected (still 11, verified
below).

I considered adding a dedicated `listCampaignsByAgent(agentId)`
repository method backed by a new SQL RPC, but that would have required
a migration, which is an explicit hard boundary for this session ("No
DB schema changes"). The pure-function approach satisfies "smallest
appropriate capability" without crossing that boundary.

---

## D. Canonical Agent Contract — type consolidation

Confirmed the review's finding: `CallAgentContract`/`AgentInputField`/
`AgentOutcomeDefinition`/`AgentOutputField`/`AgentContractSource`/
`AgentContractCompleteness` were independently hand-maintained in TWO
places — `src/server/campaigns/types.ts` (server, consumed by
`supabaseCampaignRepository.ts`/`campaignRunner.ts`/etc.) and
`src/types/campaign.ts` (client, consumed by `CreateCampaign.tsx` via
`src/lib/campaignAgentContract.ts`).

**Types consolidated cleanly** (no bundling/import problem — both files
already sit in the pure-types layer with zero server-only deps):
`src/types/campaign.ts` is now the single authoritative definition;
`src/server/campaigns/types.ts` re-exports the same six names via
`export type { ... } from '../../types/campaign.js'`, so every existing
`import { CallAgentContract } from './types.js'` across the server code
(unchanged) keeps working with zero call-site edits.

**The two `buildAgentContractFromRoster()` BUILDER functions were left
as two**, deliberately, and documented rather than forced together:
`src/server/campaigns/agentContract.ts`'s version takes the raw
`AgentSummaryDto` (snake_case Partner API DTO) and is currently unused
dead code (grepped — no call site references it); `src/lib/campaignAgentContract.ts`'s
version takes the mapped `AgentSummary` (camelCase, what `useAgents()`
actually returns and what every client page already has in hand). AI
Agents is a client page, so it reuses the client builder — the same one
`CreateCampaign.tsx` already uses — making AI Agents the **second real
consumer** of that exact function (not a third independent field
definition). Merging the two builders would require either importing a
DTO-mapping concern into the client builder or vice versa, for a
function pair that already agrees on the *output* type (now singular)
and only differs in *input* shape by design — not a bundling risk, just
not a clean 1:1 merge worth forcing in this session. **Authoritative
path**: client code → `src/lib/campaignAgentContract.ts`; server code →
`src/server/campaigns/agentContract.ts` (currently unused, kept for a
future server-side snapshot path).

**Campaign creation / `agentContractSnapshot` regression check**: `src/pages/CreateCampaign.tsx`
is untouched — still imports from `@/lib/campaignAgentContract`, still
builds against `AgentSummary`, still sends `agentContractSnapshot` in
the create request; `api/campaigns.ts`'s `CreateCampaignBody.agentContractSnapshot`
type now resolves through the same consolidated `CallAgentContract`
(re-exported), so its shape is unchanged. `tsc --noEmit` is clean across
the whole repo, which would have failed immediately on any shape
mismatch between the two former independent definitions.

---

## E. Agent Detail — five-section restructure

`src/pages/AgentDetail.tsx` restructured into exactly the five sections
from the review's finalized design:

**1. Call Agent Contract — Call Centre.** `direction` plus Persona/Language
demoted to secondary metadata rows (moved out of the header line, per
§8A "demote don't drop"). Consumes the canonical `CallAgentContract` via
`buildAgentContractFromRoster(agent)` (workstream D) — an honest,
compact caveat paragraph replaces any large empty contract table:
"Expected inputs, expected outcomes and structured outputs are not yet
published by the live Partner API... nothing is fabricated here." No
`status`/`description`/expected-fields shown, because none are live.

**2. VoiceForce Usage.** `MetricStrip`: Calls handled (hint: "Most
recent 100 call-data rows"), Chats handled (hint: "Most recent 100 chat
sessions"), Campaigns (hint: "Most recent 100 campaigns") — labels now
explicit rather than bare unlabeled numbers, satisfying the "must not
look like lifetime totals" instruction. Added a new Customer 360
category-mapping card, reusing the **existing** `useClassification()`
hook (`GET /api/agents?action=classification`, already live, zero
backend change) — filters `classification.categories` to those whose
`agentIds` include this `agentId`, rendered as outline badges, or an
honest "Not assigned to a Customer 360 category" line.

**3. Operational Performance.** Unchanged metric set (Resolved,
Escalated, FCR rate, Intent accuracy with its unresolved
accuracy-vs-confidence caveat carried forward verbatim, Sentiment,
Intent confidence (chat), Authenticated voice/chat), plus the corrected
Avg handle time (§A) with its new stale-exclusion caveat, plus Avg turn
latency (chat, unchanged), with the correctly-omitted per-agent voice
latency still omitted. Card subtitles now explicitly say "Observed —
historical aggregate, not the Agent Contract" so this section can never
be visually confused with section 1's (currently-empty) future
`expected_outcomes`.

**4. Campaign Usage — VoiceForce.** See §Reconciliation below — kept
the existing `campaignOutcomes` computation as-is (already correct
against the confirmed model), added a subtitle naming the policy
explicitly, and changed nothing about the underlying calculation.

**5. Recent Interactions.** Unchanged — same compact grid, same N1
origin-aware drill-down into the existing Call Logs/Chat Logs detail
dialogs.

---

## 11.5A reconciliation — explicit, per the coordinator's amendment

Checked the actual SQL computing `classified_count`/`success_count`
(`supabase/migrations/20260926090000_campaigns_foundation.sql:196-207`,
`call_center_campaign_list`'s stats subquery) against the confirmed
policy:

```sql
count(distinct t.id) filter (where t.effective_result_id is not null and r.is_success is not null) as classified_count,
count(distinct t.id) filter (where t.effective_result_id is not null and r.is_success = true)      as success_count
```

**No discrepancy found.** This is already exactly the confirmed model:
"Classified" = a target whose `effective_result_id` currently points at
a result with a known `is_success` value (i.e. has a valid *current
effective* Campaign Result); "Success" = that same current effective
result's `is_success = true`. Per 11.5A's audit, `effective_result_id`
always points at the most recently reconciled attempt ("latest attempt
wins"), so both counts inherently already reflect "current effective
result," not "best result ever seen" or any alternative ranking — no
code changes were needed to align the calculation with the confirmed
policy, only the **display** needed to say so honestly.

**What was kept as-is** (already correct, confirmed matching): Campaigns
count, Targets, Classified, Success rate — all four, computed exactly as
before via `computeAgentCampaignOutcomeSummary` (unchanged function).

**What was reframed** (display-only change): the Campaign Usage section
now carries an explicit subtitle — "Reflects each target's current
effective result (latest reconciled attempt) — see Session 11.5A" —
instead of presenting Success rate/Classified as unqualified statistics.

**What was omitted**: nothing needed to be omitted — every metric in
this section already traces cleanly to the confirmed `effective_result_id`/`is_success`
semantics, so there was no metric this session couldn't honestly compute.

**Authorization**: no additional AI-Agents-specific authorization
mechanism was built, per the amendment's §4 — Agent Detail's campaign
data flows through the existing `useCampaigns`/`api/campaigns.ts`
`handleList`, which already applies 11.5A's `authorizedAgentIds`
filtering (unchanged, not touched this session).

---

## F. Boundaries held

No Call Centre file touched. No revised-API field
(`status`/`description`/`expected_input_fields`/`expected_outcomes`/`output_fields`)
mocked, fabricated, or given placeholder UI — every "not live" gap is
either omitted entirely or rendered as an explicit honest caveat
sentence. No `agent_version` anywhere (confirmed — grepped, zero
occurrences added). No VoiceForce-side LLM. No DB schema
changes/migrations. No Initiate Call file touched. No live calls,
messages, or campaign launches — only existing/historical data read.

---

## G. Verification

- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeds (3777 modules, same pre-existing chunk-size
  notice, no new warnings).
- `npm run lint` — **117 errors / 36 warnings**, identical to the
  documented baseline; zero new problems in any file this session
  touched.
- Vercel function count: **still 11** (`find api -maxdepth 3 -name "*.ts" ! -name "_*"`
  unchanged — no new endpoint/route added; the campaign-usage capability
  is a pure client-side function reusing an existing endpoint).
- Regression review (static/code-level, see limitation below):
  - **Campaign Agent Contract snapshot**: `CreateCampaign.tsx` untouched,
    still imports the same client builder against the now-consolidated
    (but shape-identical) `CallAgentContract` type; `tsc` across the
    whole repo is clean, which would fail on any shape drift between the
    former two independent definitions.
  - **Agent Detail origin-aware (N1) navigation**: `resolveDetailOrigin`/`DetailNavigationState`
    usage in `AgentDetail.tsx` is byte-for-byte unchanged from the prior
    version — only content below the header changed.
  - **Agent-scoped campaign usage query**: `countCampaignsByAgent` is a
    pure, directly-inspectable grouping function over real
    `CampaignWithStats[]` data (not fabricated) — traced its output type
    and call sites; no live numeric spot-check was possible this session
    (see limitation below).
  - **Stale-duration AHT exclusion**: traced the fix directly in
    `agentPerformanceAggregator.ts` — `nonStaleDurations` is computed via
    the exact same `isStaleDuration()` import used by `src/lib/format.ts`'s
    formatters, applied before `average()`, with the excluded count
    surfaced as `staleAhtExcludedCount`. No live numeric spot-check was
    possible this session (see limitation below).

### Verification limitation — could not complete live/responsive checks this session

This session's instructions required running the standard Playwright +
Edge responsive harness at all 4 viewports × Light/Dark against a
running instance of these changes, without deploying. I attempted this
against a local `vercel dev` server (`.vercel` project link already
present). This repo has a **previously documented, unresolved**
limitation with this exact setup — confirmed in
`docs/CALL_CENTRE_SESSION2_IMPLEMENTATION_PLAN.md`: *"this environment's
local `vercel dev` had an unresolved env-var propagation issue, so live
verification against the production alias remains primary."* I
reproduced the identical symptom this session: `vercel dev` starts and
serves `/api/*` routes, but `VOICEBOT_BASE_URL`/`VOICEBOT_API_KEY` are
not visible to the function runtime even when present in `.env.local`
or copied into `.vercel/.env.development.local` — every `/api/agents`
call returns `{"detail":"VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not
configured on the server"}`. This is an environment/tooling gap, not a
defect in this session's code changes, and it predates this session.

Since this session's instructions explicitly forbid deploying before
reporting, I could not fall back to this repo's other established
verification path (checking against the production alias) either.
**Responsive/theme verification at the 4 required viewports, and a live
numeric spot-check of the AHT fix and campaign-usage counts, are
therefore genuinely outstanding** — recommend the user either (a)
authorize a preview/production deploy so the standard harness can run
against it, or (b) resolve the local `vercel dev` env-propagation gap
(out of scope for this session to fix) so future sessions can verify
fully offline. The temporary `.vercel/.env.development.local` file I
created while investigating this was deleted before finishing — nothing
was left behind, no secrets committed (`.vercel/` and `.env.local` are
both gitignored; confirmed via `git check-ignore`).

Build/tsc/lint/function-count checks (all of which do not require a
running server) all passed cleanly, and every code path was manually
traced against its actual source/target files rather than assumed.

---

## Files changed

- `src/services/agents/agentPerformanceAggregator.ts` — stale-duration
  AHT exclusion + `staleAhtExcludedCount`; new `countCampaignsByAgent()`.
- `src/pages/AIAgents.tsx` — reskinned to G1/C1/S1/L1 Agent/Direction/Usage/Action.
- `src/pages/AgentDetail.tsx` — restructured into the 5-section
  architecture; consumes `CallAgentContract`/`useClassification`.
- `src/types/campaign.ts` — now the sole authoritative Agent Contract
  type definition (comment updated).
- `src/server/campaigns/types.ts` — Agent Contract types now re-exported
  from `src/types/campaign.ts` instead of independently redefined.

No new files. No migrations. No `api/*` changes.

---

## Commit

Local commit only, not pushed, not deployed:

```
5b7cf3e Session 11.7: AI Agents G1/C1/S1/L1 reskin, 5-section Agent Detail, AHT stale-duration fix
```

(exact-file `git add`, not `git add -A` — only the 5 files listed above staged)
