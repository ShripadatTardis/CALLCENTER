# Session 11.5B — Customer 360 UI Implementation

VoiceForce-only UI session, built on the completed Session 11.5A backend
foundation (`docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md`) and the
Session 11.5 review (`docs/SCREEN_REVIEW_05_CUSTOMER_360.md`). Respects
Session 11.7's Agent Contract consolidation and Campaign Result
semantics — neither was touched. No Call Centre code touched, no
enhanced/unavailable Partner API field mocked, no VoiceForce-side LLM,
no `agent_version`, no Initiate Call/Campaign-workflow changes, no
Activities/Diary UI, no schema changes. Not deployed — local commit
only.

---

## Exact files changed

- `src/pages/Customers.tsx` — G1/C1/S1/L1, real pagination (rewrite)
- `src/pages/CustomerDetail.tsx` — 4-section restructure, Campaign
  Participation section, F1-ized grouping filter, N1 origin nav,
  S1 badges, G1 table density (rewrite)
- `src/types/customer.ts` — `CustomerCampaignRow`/`CustomerCampaignsResponse` (additive)
- `src/services/customers/customersService.ts` — `fetchCustomerCampaigns` (additive)
- `src/services/customers/customersKeys.ts` — `campaigns` query key (additive)
- `src/hooks/customers/useCustomerCampaigns.ts` — new hook
- `src/lib/detailOrigin.ts` — `'customers'` added to `DetailOrigin` (additive, same pattern as the existing `'live-view'` forward-reuse entry)

No other file touched. No API/backend/schema change was necessary —
Session 11.5A's `GET /api/customers/{id}?action=campaigns` endpoint and
`useCustomers`'s existing `page` parameter already supported everything
this session needed.

---

## Customer Index — pagination fix

**Before**: `Customers.tsx` never rendered pager controls or
incremented `page`; the API/hook already accepted `page`/`pageSize=25`
but the UI had no way to reach it. `useCustomers(search, page)` was
already wired to accept `page` — the gap was entirely in the page
component, not the data layer.

**After**: `page` state + a Call-Logs-style Prev/Next footer
(`{totalCount} total customers · Page N of M`), computed from
`data.pagination.totalCount`/a fixed `PAGE_SIZE = 25` (matching the
hook's hardcoded `pageSize: 25`). A new search term resets `page` to 1
(the previous page may not exist under the new result set — same
discipline Call Logs applies to its own server-side filters). Applied
G1 density (`h-9` header / `py-1.5` rows, down from `py-2`/default
`<th>`), S1 status badges (`positive`/`escalated`/`secondary` replacing
the old `destructive`/`secondary` pair), and bounded the workspace
(`h-full min-h-0 flex flex-col`, table region `flex-1 overflow-auto` —
the exact L1 pattern already verified for Call Logs). F1's floating
filter panel was deliberately NOT added: per the review, there is no
second real filter dimension today to justify one — search remains the
one persistent control, consistent with "filters are controls, not
content," not added merely for completeness.

**Not live-verified against real paginated data** — see Verification
gap below.

---

## Customer Detail — 4-section restructure

1. **Identity & Contact** — new compact `SectionCard`: customer ref
   (CIF, when present) and phone number(s), masked via the existing
   `maskPhoneLast4` helper (never rendered unmasked) — no new field, no
   CRM fabrication, exactly the data already returned by
   `CustomerDetailResponse`.
2. **Interaction History** — unchanged data/behavior, G1 density
   applied to the table (`h-9`/`py-1.5`, down from `py-2`/default
   `<th>`), S1 badges for Outcome/Channel. The always-on
   `GroupedInteractionTree` block is now inside a `FilterPopover`
   ("Group by Category / Agent / Channel", active-count badge,
   `collapsedByDefault`) instead of permanent page real estate — the
   exact treatment Call Logs 11.3A already established for this same
   situation ("grouping is optional; when narrowing by a dimension is
   the real task, use it as a filter"). `GroupedInteractionTree`/
   `groupInteractions` themselves are unmodified; only how/where the
   tree is mounted changed.
3. **Campaign Participation — NEW.** Consumes
   `GET /api/customers/{id}?action=campaigns` via the new
   `useCustomerCampaigns` hook. Columns: Campaign, Call Agent
   (`campaignAgentName ?? campaignAgentId`, never `agent_version`),
   Target Status, Attempts, Latest Execution, **Current Result**, Follow-up,
   Action (View call). See "Campaign History fields rendered" and
   "Current Result verification" below.
4. **Existing summary/aggregate info** — the pre-existing `MetricStrip`
   (First/Last seen, Visible interactions, Latest intent/outcome,
   Escalations) is unchanged — no new metric added, all of it already
   confirmed authorized-safe by the Session 11.5 review.

**N1 navigation**: `'customers'` added to `DetailOrigin`
(`src/lib/detailOrigin.ts`), `CustomerDetail.tsx` now resolves via
`resolveDetailOrigin(location.state?.origin, 'customers')` instead of a
hardcoded `navigate('/customers')`, and `Customers.tsx` passes
`{ state: { origin: 'customers' } }` on both click and keyboard-Enter
navigation. Today Customers.tsx is still the only screen linking into
Customer Detail, so this always resolves to "Back to Customers" in
practice — the mechanism itself is the same one AI Agents/Dashboard/
Live View already use, extended additively rather than built in
parallel.

**L1 note (documented deviation, not an oversight)**: Customer Detail
keeps ordinary page-level scroll (`min-h-full`) rather than a single
strict zero-delta L1 region. Unlike Customer Index — a genuinely
backend-record-count-driven list, where L1 is required and
implemented — this customer's own interaction/campaign volume is
bounded in practice (max ~566 interactions across all 26 customers
combined; campaign participation is a handful of rows per customer).
Forcing one shared scroll region across four independent sections would
need a tabbed/panel redesign larger than this session's scope — this is
the §17 "document the deviation" escape hatch, not an unbounded-growth
risk. The compact sections already avoid the "long CRM profile page"
failure the standard is actually guarding against.

---

## Campaign History — exact fields rendered

Against the §C.3 "at minimum" list: Campaign ✅, Call Agent ✅, target/
campaign state ✅ (Target Status + Latest Execution — kept as two
separate columns rather than one, since Execution Status and Target
Status are explicitly different concepts per 11.5A §A and collapsing
them would reintroduce the conflation the whole session's design is
built to avoid), latest attempt/execution information ✅ (Attempts
count + Latest Execution status), **Current Result** ✅ (exact
terminology, never an unqualified "Result" — badge-styled, see below),
follow-up/`next_action_at` ✅, relevant reconciled interaction
navigation ✅ ("View call" button, only rendered when
`latestReconciledInteractionId` is present).

**Not built**: a historical-attempts drill-down (expandable row/modal
showing prior `campaign_results` rows). The §C.3 instruction made this
explicitly optional ("if historical attempt/result data can be exposed
cleanly using existing real data with no new backend/schema work... do
not expand scope merely to create it") — the flat Current Result
display is sufficient for this session's scope; a drill-down is a
reasonable future enhancement, not a gap.

**Current Result semantics** — `currentResultLabel`/
`currentResultBadgeVariant` in `CustomerDetail.tsx` mirror
`CampaignDetail.tsx`'s existing `reconciliationLabel` fallback ladder
exactly (same underlying field reads: `effectiveResultId` →
`campaignResultLabel ?? 'Classified'`; otherwise a
`latestReconciliationStatus`-keyed fallback) — no new/alternative
result-selection policy introduced, no best-result/first-success/
ranking logic added. The one deliberate change from `CampaignDetail`'s
older presentation: S1 badge variants (`positive`/`escalated`/
`secondary`/`warning`/`outline`) replace the older raw
`text-green-400`/`text-red-400` inline classes, for consistency with
every other Session 11 screen — `CampaignDetail.tsx` itself was left
untouched (out of scope; its own styling predates S1 and can be
revisited in its own session).

---

## Authorization behavior

Reuses Session 11.5A's implementation exactly — `handleCampaigns`
(`api/customers/[id]/index.ts`) resolves the same
`authorizedAgentIds` already computed for interactions, then filters
campaign rows to those whose `campaignAgentId` is in that set. No
client-side authorization logic was added or duplicated in this
session; the frontend renders whatever the endpoint already returns.

**Verification status**: could not be exercised against real
authorized-vs-unauthorized data this session — see Verification gap
below (the local API could not be reached at all). Per the standing
v1-decision record (11.5A, restated here): `role_customer360_categories`
was confirmed empty in the reviewed environment, so the category-scoped
path has zero real-world exercise anywhere in this product yet — this
session does not change that state, and this UI should not be
considered production-verified for a category-scoped role until a real
role with populated categories exists to test against.

---

## Current Result verification

**Not completed** — required live data (a real customer with a
multi-attempt campaign target) and a working API to spot-check
`effective_result_id` against the rendered badge. Could not be reached
this session; see Verification gap below. The implementation itself
reuses `CampaignDetail.tsx`'s already-shipped, already-correct field
reads verbatim (no new derivation logic was written — `currentResultLabel`
is a renamed/restyled copy of the exact same logic, not a
reimplementation), so the risk of a genuine semantic bug here is low,
but "low risk" is not the same as "verified," and this is reported
honestly as unverified rather than claimed.

---

## Empty/loading/error states

- **Customer Index**: unchanged loading/error copy; empty-search-result
  copy unchanged; pagination footer only renders when `totalCount > 0`
  (no dangling "Page 1 of 1" for a zero-result search).
- **Customer Detail — Campaign Participation**: three explicit states —
  loading spinner (`campaignsQuery.isLoading`), a plain "Campaign
  history is unavailable right now" message on error (no crash, no
  raw error object rendered), and an honest "This customer has not
  been part of any campaign" empty state for `campaigns.length === 0`
  — never a fabricated placeholder row.
- **Interaction History**: unchanged existing states (loading, "no
  visible interactions", "no interactions in the selected group").

None of these were exercised against live data this session (see
below) — verified by code inspection and the conditional structure
only, not by observing them render.

---

## Responsive/theme results — same limitation as Session 11.7, reported honestly

**Could not be completed.** Attempted `vercel dev --listen 3000`
locally to run the Playwright+Edge harness against the app's own new
code with working API routes. The dev server itself started
successfully (`Ready! Available at http://localhost:3000`, `GET /`
returns `200`), but every API route failed:

```
curl http://localhost:3000/api/customers?page=1&pageSize=25 -H "x-user-role: admin"
→ HTTP 502, "An error occurred with this application. NO_RESPONSE_FROM_FUNCTION"
```

This is the same pre-existing local `vercel dev` environment-
propagation problem Session 11.7 already hit and documented (traced
back to a Session 2 issue) — not a regression introduced by this
session's code, and not something this session's scope includes fixing.
Per this session's explicit instruction, this is reported as an
outstanding gap rather than silently marked passed: **the 4-viewport ×
Light/Dark responsive harness run, and every "verify against real
data" item in §I (pagination page 2+, Campaign History against real
`campaign_targets`, the Current Result spot-check, the no-campaigns
empty state, the authorization path) could not be executed this
session.** `tsc`/build/lint were run and pass cleanly (below), and the
implementation was built directly against the same live production data
shapes already documented in Sessions 11.5/11.5A's review (real field
names, real response shapes, no invented types) — but genuine
browser-rendered verification is still outstanding and requires either
a fix to the local `vercel dev` environment issue or a deployment,
neither of which is in this session's scope.

---

## TypeScript / build / lint / function count

- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeds (`vite build`, 3778 modules, no new
  warnings beyond the pre-existing chunk-size notice).
- `npm run lint` — **117 errors / 36 warnings**, identical to the
  documented baseline. The one warning inside a file this session
  touched (`CustomerDetail.tsx:206`, `react-hooks/exhaustive-deps` on
  `allInteractions`) is pre-existing — present verbatim in the file
  before this session's changes (same line/pattern in the original
  `useMemo` dependency array) — not newly introduced.
- Vercel function count: **still 11** — no `api/*.ts` file was added or
  changed this session; both new frontend pieces (`useCustomerCampaigns`,
  `fetchCustomerCampaigns`) call the endpoint Session 11.5A already
  built on the existing dispatcher.

---

## Remaining Customer 360 gaps (found along the way, not fixed here — out of scope)

- The local `vercel dev` environment-propagation issue (see above) —
  blocks live verification for any session working against real API
  data without a deploy; worth a dedicated fix outside any single
  screen session.
- No historical-attempts drill-down for Campaign Participation (noted
  above as explicitly optional/deferred, not a defect).
- `CampaignDetail.tsx`'s own target table still uses the pre-S1
  `text-green-400`/`text-red-400` styling — now visibly inconsistent
  with Customer Detail's S1 badges for the same underlying concept;
  worth a small follow-up to bring it in line, not done here since it
  was explicitly out of this session's file scope.
- Every other gap already flagged in `docs/SCREEN_REVIEW_05_CUSTOMER_360.md`
  §16 and `docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md`'s "Remaining
  decisions" (campaign-history authorization sign-off, activity
  authorization, no real user/team model) is unchanged by this session.

---

## Confirmation

- Activities/Diary: **no UI exposed anywhere this session** — no new
  route, component, or reference to `customer_activities`/
  `activityRepository` in any file this session touched. The backend
  foundation from 11.5A is untouched.
- Enhanced Partner API fields (`expected_input_fields`,
  `expected_outcomes`, `output_fields`, `actual_outcome_code`,
  `actual_outcome_name`, `structured_outputs`, enhanced `agent_inputs`):
  **not referenced anywhere in this session's code.** Campaign
  Participation renders only fields already live in
  `CustomerCampaignRow`/today's `campaign_results`/`campaign_targets`
  data.
- Session 11.7's Agent Contract consolidation (`CallAgentContract` in
  `src/types/campaign.ts`) and Campaign Result semantics were not
  touched, imported, or altered by this session — Customer Detail's
  Campaign Agent column uses the plain `campaignAgentName`/
  `campaignAgentId` fields already on `CustomerCampaignRow`, not the
  `CallAgentContract` shape (no Agent Contract inspection is needed for
  a one-line "which agent ran this campaign" display).
- No DB/schema change was made or needed.
- Not deployed — no `vercel --prod`. A local git commit was made (see
  below); pushing/deploying is left to the user.

---

## Local commit

`git add` (exact files only, no `git add -A`):
`src/pages/Customers.tsx`, `src/pages/CustomerDetail.tsx`,
`src/types/customer.ts`, `src/services/customers/customersService.ts`,
`src/services/customers/customersKeys.ts`,
`src/hooks/customers/useCustomerCampaigns.ts`, `src/lib/detailOrigin.ts`,
`docs/SESSION_11_5B_CUSTOMER_360_UI_IMPLEMENTATION.md`.

Commit hash: `f1f4495`.
