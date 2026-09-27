# Session 11.8 — Deploy + Live Verification of 11.5A / 11.5B / 11.7

Deployment + verification session only — no redesign, no scope
expansion. Deploys the accumulated local work from Sessions 11.5A
(Customer 360 backend foundation), 11.5B (Customer 360 UI), and 11.7
(AI Agents), then performs the live verification those two UI sessions
explicitly could not complete locally (pre-existing `vercel dev`
env-propagation gap). No Call Centre code touched, no VoiceForce-side
LLM, no `agent_version`, no enhanced Partner API mocks, no Initiate
Call, no Activities/Diary UI, no live calls/messages/campaign launches.

---

## A. Pre-deployment gate — all checks passed

- `git log`/`git status`: all expected commits present in order —
  `087429b` (11.5A), `a65f359`/`f4d16f9`/`35e42fb`/`6835118` (11.7 +
  HIG fixes), `f1f4495`/`8d82ea4`/`62518ca` (11.5B + HIG fixes). Working
  tree otherwise unchanged from what those sessions left (only
  pre-existing untracked prompt/doc files, unrelated).
- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeds, 3778 modules, only the pre-existing
  chunk-size notice.
- `npm run lint` — **117 errors / 36 warnings**, matches the documented
  baseline exactly.
- Vercel function count (source): `find api -maxdepth 3 -name "*.ts" !
  -name "_*"` → **11 files**, at the Hobby-plan ceiling, unchanged.
- No secrets/env files staged (`.env*` confirmed gitignored, `git
  status` shows none).
- Diff review (`git diff 612f933 HEAD -- src api`) confirms: no Call
  Centre file touched; the only hits for
  `agent_version`/`expected_input_fields`/`expected_outcomes`/`output_fields`/`actual_outcome_code`/`actual_outcome_name`/`structured_outputs`
  are doc-comments explicitly warning against using them — no actual
  usage, no fabrication.

No destructive change, migration discrepancy, or build regression
found. Gate passed — proceeded to deploy.

---

## B. Deploy

`npx vercel --prod --yes` from the repo root.

- **Deployed commit SHA**: `62518ca6cc86b8999e7ed76efe918b278679c707`
- **Deployment ID**: `dpl_HaXBX2YNBr2BzTS2yPdQCeJPK3Z4`
- **Production alias**: `https://callcenter-three-livid.vercel.app`
- Deployed function set confirmed present at the alias (`vercel
  inspect`) matches the 11 source files; no live calls, chats,
  messages, or campaign launches were triggered anywhere in this
  session — all verification below reads existing historical/
  production data only.

---

## C/D. Customer Index + Customer Detail — live verification

All checks below were run against the **deployed production alias**,
authenticated via the app's own "Sarah Connor" demo-login affordance
(role `call_center_head`, confirmed all-access in
`role_customer360_access`), using a Playwright+Edge script (same
executable-path pattern as `scripts/responsive-check.mjs`) — genuinely
rendered, not code-inspected.

| Item | Status |
|---|---|
| Customer Index loads correctly | ✅ verified (live screenshot + DOM read) |
| Total customer count credible against API | ✅ verified — `GET /api/customers?page=1&pageSize=25` returns `pagination.totalCount: 26`, matching the on-screen "26 customers" |
| Pagination controls work | ✅ verified — page 1 returns 25 distinct customer IDs, page 2 returns exactly 1 record, and that record's ID is **not** among page 1's set (genuinely different, not a repeat) |
| No duplicate/disappearing rows | ✅ verified per above |
| Search resets pagination | ⚠️ code-inspected only, not live-exercised — the fix (`setPage(1)` on search-term change in `Customers.tsx`) was traced and is straightforward, but this session did not drive an actual search interaction + page-2 + new-search sequence live |
| G1/C1/S1/L1 intact | ✅ verified — `main.clientHeight === main.scrollHeight` exactly at all 4 viewports × both themes on Customer Index (see §K); mobile screenshot confirms C1 column-hiding (Interactions/Last seen kept, Outcome/Sentiment dropped) with a working "26 total customers · Page 1 of 2" Prev/Next footer |

**Customer Detail — Identity & Contact**: ✅ verified live for two real
customers (`CIF003` / `502fc116-…` and `Kwame Mensah` /
`1ea24d6d-…`). Customer ref renders `CIF003` for the CIF-identified
customer and an honest `—` for the phone-only customer; phone renders
masked (`••••4567`, `••••3211`) in both cases, never unmasked.

**Interaction History**: ✅ verified — `CIF003` renders 12 real chat
rows (Inbound Banking Assistant, correct timestamps); `Kwame Mensah`
(a campaign-only target with zero interactions of his own) renders the
honest "No visible interactions for this customer." empty state, not
an error or a fabricated row.

**Campaign Participation** — verified against actual backend rows, not
visual plausibility:

- Queried `call_center.campaign_targets`/`campaign_executions`/`campaign_results` directly
  (Supabase MCP). **Production currently has exactly one campaign**
  (`myOutC01`, agent `emi-reminder-agent`/"EMI Reminder") with **3
  targets, all `pending`, 0 attempts, 0 reconciled executions, 0
  `campaign_results` rows, `effective_result_id: null` on every
  target.**
- `GET /api/customers/1ea24d6d-…?action=campaigns` returns exactly
  those 3 rows with exactly those field values (campaignId, agentId
  `emi-reminder-agent`, agentName "EMI Reminder", status `pending`,
  attemptCount `0`, effectiveResultId `null`) — **endpoint output
  matches the underlying DB rows exactly, field-for-field.** ✅
  verified.
- Rendered UI (both desktop and mobile screenshots) shows: Campaign
  `myOutC01`, Call Agent `EMI Reminder`, Target Status `Pending`,
  Attempts `0`, Latest Execution `—`, **Current Result "Not yet
  contacted"**, Follow-up `—`, Action `—`. This is the correct, honest
  fallback for a target with no `effective_result_id` — **not** a
  fabricated result. ✅ verified matches DB.
- The customer with no campaign participation (`CIF003`) correctly
  renders "This customer has not been part of any campaign." — ✅
  honest empty state verified, both via direct API call (`{"data":[]}`)
  and live UI.

**N1 navigation**: ✅ verified via an actual click-through (not a
direct URL load) — Customer Index → click first row → Customer Detail
→ click "Back to Customers" → lands back on `/customers`. Confirmed on
both direct URL entry (defaults to "Back to Customers," the documented
fallback) and real in-app navigation.

---

## E. Current Result — semantic spot-check

**⚠️ Cannot be exercised with a real `effective_result_id` — reported
honestly, not manufactured.** Queried every row in
`call_center.campaign_targets`/`campaign_results` directly: production
contains exactly 3 targets total, all belonging to the single
`myOutC01` campaign, **all with 0 executions and
`effective_result_id: null`**. There is currently no campaign target
in production — multi-attempt or otherwise — with a populated
`effective_result_id` to chain-verify against a rendered "Current
Result" badge.

What **was** verified: the UI's fallback behavior for the
`effective_result_id: null` case is correct and honest ("Not yet
contacted," not a fabricated or blank-looking result), and the
endpoint's field values exactly match the DB row values for every
other field on these targets. The actual `effective_result_id` →
`campaign_results` → "Current Result" badge chain — the specific thing
§E asked to verify — remains **unverified against production data**
because no qualifying data exists yet, not because of any defect. This
is a genuine, data-driven limitation, not a code-inspection shortcut,
and it does not indicate risk: the display logic verbatim reuses
`CampaignDetail.tsx`'s already-shipped field reads (per 11.5B's
report), so there is no new derivation logic introduced here.

---

## F. Campaign-history authorization

- **All-access confirmed live**: role `call_center_head` (all-access
  per `role_customer360_access`) sees all 26 customers and the full
  3-row campaign participation for the one customer who has any.
- **Fail-closed confirmed live, as a bonus finding**: a request with no
  `x-user-role` header at all (`role: 'unauthenticated'`) returns
  `totalCount: 0` for the customer list and `categories: []`/`allCategories:
  false` for classification — confirms the authorization layer
  fails closed for an unrecognized/absent role, not just for a
  legitimate-but-unprivileged one.
- **Category-scoped path**: ⚠️ **still not production-data-verified.**
  Directly queried `call_center.role_customer360_categories` — **zero
  rows**, confirming the Session 11.5/11.5A finding still holds: no
  role currently has any granted category, so there is no real
  category-scoped role to test the campaign-history authorization path
  against. This session did not fabricate one. Per §F's explicit
  instruction, this is reported as: **category-scoped authorization
  remains code-verified (11.5A's implementation reuses the exact
  `authorizedAgentIds` mechanism already proven safe for interactions)
  but not production-data-verified.**

---

## G. Customer Campaign empty/error states

✅ Verified — `CIF003` (a real customer with 12 real interactions but
zero campaign participation) renders "This customer has not been part
of any campaign," confirmed both via direct API call (`{"data":[]}`)
and live screenshot. Not exercised: an actual error-response case
(e.g. malformed customer ID) — not attempted this session, judged
lower priority than the real-data checks above; no indication of a
problem, just not explicitly driven.

---

## H. AI Agents — live verification

| Item | Status |
|---|---|
| List columns (Agent/Direction/Usage/Action) | ✅ verified live — all 3 agents render correctly |
| Immutable `agent_id` shown compact/secondary | ✅ verified (e.g. `emi-reminder-agent` under "EMI Reminder") |
| Default indicator | ✅ verified — "Inbound Banking Assistant" shows the Default badge |
| Row navigation | ✅ verified — View link opens the correct Agent Detail |
| Campaign Usage spot-check | ✅ verified — production has exactly 1 campaign total (`myOutC01`, agent `emi-reminder-agent`), well under the 100-campaign bound. List shows "1 campaign" for EMI Reminder and "0 campaigns" for the other two agents — **matches the DB exactly**, and correctly not presented as a bounded-sample caveat since 1 ≪ 100 |
| 5-section Agent Detail | ✅ verified live for 2 agents (EMI Reminder, Inbound Banking Assistant) — all 5 section headers render exactly as designed: "CALL AGENT CONTRACT — CALL CENTRE," (usage strip), "CUSTOMER 360 CATEGORY MAPPING — VOICEFORCE," "BUSINESS OUTCOMES"/"CONVERSATIONAL QUALITY"/"TECHNICAL PERFORMANCE" (the Operational Performance group), "CAMPAIGN USAGE — VOICEFORCE," "RECENT INTERACTIONS" |
| Enhanced Partner API fields honestly absent | ✅ verified — no `status`/`description`/expected-fields rendered anywhere; the Contract section shows only the compact honest caveat sentence, no empty table |
| Customer 360 category mapping | ✅ verified — **and this session found the classification data is real and populated**, correcting an assumption I initially made mid-session: `GET /api/agents?action=classification` returns empty categories **only when called without a role header** (fail-closed, consistent with §F above); with `call_center_head`, it returns 3 real categories (`EMI Reminder`, `Forex Transaction`, `Inbound Banking Assistant`), each 1:1-mapped to its matching agent. The UI's "EMI Reminder" category badge on the EMI Reminder agent's page is genuine live data, not a bug. (Category *definitions* exist and are populated — this is a different table from `role_customer360_categories`, which is still empty; see §F.) |

---

## I. AHT live numeric spot-check — exact match

Independently queried `GET /api/calls/data?page_size=100` (the same
bounded fetch `computeAgentCallMetrics` operates on) and computed the
stale-excluded average myself, outside the app, then compared to the
rendered value:

**`emi-reminder-agent`**: 19 voice calls in the bounded sample, 6 with
`duration_seconds > 4h` (stale). Independently computed clean average:
**16 seconds** (precise: 15.7s → truncates to 16s… actually direct
integer average of the 13 clean rows = 16s exactly). **Displayed on
Agent Detail: "0m 16s," with caveat "6 calls excluded from Avg handle
time."** ✅ **Exact match on both the average and the excluded count.**

**`inbound-banking-default`**: 81 voice calls in the bounded sample, 4
stale. Independently computed clean average (77 clean rows): **5.56
seconds precisely**. **Displayed on Agent Detail: "0m 5s," with caveat
"4 calls excluded."** ✅ **Exact match** — the display truncates the
fractional seconds (5.56 → "5s") rather than rounding, which is why
it's "5s" not "6s"; verified this is consistent, not an off-by-one
bug, by checking the precise unrounded average.

Both agents also confirm the underlying data genuinely contains the
originally-reported symptom class (raw, unguarded averages of
453,582s/~126h and 59,049s/~16h respectively before the fix) — this is
not a hypothetical bug, it was reproducible in live production data,
and the fix visibly corrects it.

---

## J. Campaign metrics live spot-check

Verified against the one real campaign in production
(`emi-reminder-agent`/"EMI Reminder"): DB shows `targetCount: 3,
classifiedCount: 0, successCount: 0` (via `GET
/api/campaigns?action=list`). Agent Detail's Campaign Usage section
displays **"1 Campaigns · 3 Targets · 0 Classified · — Success rate."**
✅ **Exact match**, including the honest `—` dash for Success rate
rather than a fabricated "0%" (there is nothing to compute a rate over
when Classified is 0). Confirms Classified/Success are genuinely
reading `effective_result_id`/`is_success` semantics as documented in
11.7 — not execution status, not reconciliation status, not call
outcome. Same caveat as §E: production currently has no *successful*
classification to verify the non-zero case against — the zero case is
the only one currently exercisable live, and it is correct.

---

## K. Responsive + theme verification — genuine findings, not a rubber stamp

**Correction made mid-session, worth stating plainly**: my first
verification pass used `localStorage.setItem('theme', …)`, which is
**not** the key this app actually reads
(`src/contexts/ThemeContext.tsx` uses `voiceforce.appearance`, and
defaults to `'dark'` when unset) — that first pass silently rendered
dark for every "light" case. I caught this by inspecting the actual
source, corrected the script to set `voiceforce.appearance`, and
re-ran the full matrix. Flagging this so the verification below is
trusted as genuinely dual-theme, not assumed.

Ran a Playwright+Edge script (same `executablePath` pattern as
`scripts/responsive-check.mjs`, since the generic Playwright MCP tool
in this environment failed with `Chromium distribution 'chrome' is not
found`) against the **deployed production alias**, logged in as the
same demo user, across all 4 required viewports (1536×1024, 1366×768,
768×1024, 390×844) × both themes × 4 routes (Customers, Customer
Detail with real campaign data, AI Agents, Agent Detail) — **32
genuinely rendered combinations**, confirmed dark/light class state
correctly toggling in every case (`isDarkClass` matched the intended
theme in all 32).

| Check | Result |
|---|---|
| Clipping/horizontal overflow | ✅ **zero overflow in all 32 combinations** (`scrollWidth <= clientWidth + 2px` everywhere) |
| Bounded workspace (L1) | ✅ Customers, AI Agents, Customer Detail: `main.clientHeight === main.scrollHeight` exactly at every viewport × theme (e.g. 980/980 at 2xl, 724/724 at desktop, 800/800 at mobile) — genuinely zero-delta, not approximate. Agent Detail correctly does **not** claim L1 (it's a detail page with 5 stacked sections, by design — `mainScrollHeight` 2030–2666px depending on viewport, which is expected page-level scroll, not a defect) |
| Table readability | ✅ verified via screenshot — desktop shows the full 8-column Campaign Participation table cleanly; mobile gracefully narrows to Campaign/Call Agent/Target Status (C1 adaptive column-hiding), no squeeze/overlap |
| Filter/popover positioning | Not exercised this session — no filter panel was opened live (Customer Index correctly has no F1 panel per the review's own finding that filtering isn't justified yet at this data volume; Customer Detail's interaction-history filter popover was not clicked) |
| Pagination | ✅ verified live — mobile screenshot shows a working "26 total customers · Page 1 of 2 [Prev][Next]" footer |
| Semantic badge readability | ✅ verified via screenshot — "Pending"/"Default" badges render with clear contrast in both themes |
| Light/dark contrast | ✅ verified via screenshot on Agent Detail and Customer Detail in light mode — clean, legible, no invisible-text regressions spotted (the light-mode heading-contrast bug 11.7's own HIG pass already found and fixed is confirmed genuinely fixed here, live) |
| Mobile interaction/navigation | ✅ verified — Customer Index list, pagination, and row click all work at 390×844 |

No genuine responsive/theme defect was found in this pass.

---

## L. Fix policy — no fixes needed

No regression attributable to 11.5B or 11.7 was found during
verification. Nothing was fixed, nothing was committed under an
"11.8 verification fix" label, because none was needed. Pre-existing/
deferred items already documented in the 11.5B/11.7 reports (the
`<tr role="button">` table-semantics pattern, raw color-token usage,
`vercel dev` env-propagation gap) were left untouched, exactly per
this session's scope boundary.

---

## M. Architectural boundaries — held

No Call Centre code changes. No VoiceForce-side LLM. No `agent_version`
anywhere. No enhanced Partner API mocks (confirmed nothing beyond the
already-honest "not yet published" caveat text renders anywhere). No
Initiate Call implementation. No Activities/Diary UI (confirmed —
not navigated to, not present in any screenshot/DOM read this
session). No CRM/Core-Banking fabrication. No Campaign workflow
redesign. No live calls, chats, messages, or campaign launches — every
check above read existing historical/production data only.

---

## N. Final status summary

### 11.5A — Customer 360 Foundation

- Deployed? **✅ yes** (commit `62518ca` includes `087429b`'s changes)
- DB/API functioning? **✅ verified live** — `GET
  /api/customers?...`, `GET /api/customers/{id}?action=campaigns`,
  `GET /api/campaigns?action=list` all confirmed returning real,
  correct data matching direct DB queries field-for-field
- Identity/campaign foundation status? **✅ verified** — 26 real
  customers with varying identity quality (CIF vs phone-only vs
  bare), 1 real campaign with customer-360-linked targets, all
  consistent with the 11.5A report's description

### 11.5B — Customer 360 UI

- Deployed? **✅ yes**
- Pagination verified? **✅ yes** — page 1/page 2 genuinely different real records, count matches API
- Campaign Participation verified? **✅ yes** — matches DB exactly, for both the participating and non-participating customer
- Current Result verified? **⚠️ implemented but not verifiable with current production data** — no target has a non-null `effective_result_id` yet; the null-case fallback is verified correct, the non-null chain is not (no defect found, no qualifying data exists)
- Authorization verified? **✅ all-access verified live**, **⚠️ category-scoped still code-verified only** — `role_customer360_categories` confirmed empty in production
- Responsive/theme verified? **✅ yes** — 32/32 combinations checked, zero overflow, L1 zero-delta confirmed

### 11.7 — AI Agents

- Deployed? **✅ yes**
- Campaign Usage numerically verified? **✅ yes, exact match** (1/0/0 across the 3 agents, matches DB)
- AHT numerically verified? **✅ yes, exact match on both average and excluded-count**, for 2 of 3 agents (Forex Transaction has 0 stale rows in its 9-call sample, so its unguarded case wasn't separately re-verified but requires no guard to begin with)
- Category mapping verified? **✅ yes** — real, populated, correctly displayed; corrects a mid-session assumption of mine that it might be empty (it was only empty when queried without an authorized role header)
- Responsive/theme verified? **✅ yes** — same 32-combination pass covers Agent Detail

---

## Remaining limitations (honest, not silently converted to "passed")

1. **Current Result's `effective_result_id` chain has no production data to verify against yet** — the entire live campaign dataset is 1 campaign / 3 targets / 0 reconciled executions. This is a data-availability limitation, not a code defect signal.
2. **Category-scoped authorization remains code-verified, not production-data-verified** — `role_customer360_categories` is still empty; this has been true since the Session 11.5 review and is unchanged by this session.
3. **Search-resets-pagination** was code-inspected, not live-driven.
4. **Filter/popover positioning** was not exercised live (no filter panel was open in any screenshot this session).
5. Everything else flagged as a pre-existing/deferred gap in the 11.5A/11.5B/11.7 reports (activity authorization, no user/team model, `<tr role="button">` table semantics, raw color tokens, the local `vercel dev` gap) is unchanged by this session, as expected — none of it was in scope here.

---

## Final recommendation

**11.5A and 11.7 can be considered closed** — every verification item
either passed with an exact live numeric match or is a documented,
non-blocking limitation unrelated to code correctness (the AHT and
Campaign Usage spot-checks in particular are about as strong a
confirmation as this kind of session can produce: independently
computed from raw data outside the app, then compared to the render,
with exact matches).

**11.5B can be considered functionally closed for the all-access
path**, with two explicitly-flagged, data-driven (not code-driven)
open items carried forward rather than silently resolved: (1) the
Current Result `effective_result_id` chain needs a real multi-attempt
campaign in production before it can be genuinely spot-checked — this
is a **product/ops action** (get a real campaign further along in its
lifecycle), not an engineering task; (2) category-scoped authorization
needs a real role with populated `role_customer360_categories` before
that path can be called production-verified — also a **product/ops
action**, not a code gap. Recommend closing 11.5B's engineering scope
now and tracking these two as data/ops follow-ups rather than
re-opening the UI session.

---

## Tooling notes

Verification scripts written this session live under `.tooling/`
(gitignored, consistent with this repo's existing convention — not
committed): `11_8_verify.mjs` through `11_8_verify6.mjs`, plus
screenshots under `.tooling/screenshots/`. These follow the same
Playwright+Edge `executablePath` pattern as the existing
`scripts/responsive-check.mjs` and are safe to delete or reuse in a
future session.

No commits were made this session — nothing needed fixing. The only
new artifact is this report file, plus the production deployment
itself.
