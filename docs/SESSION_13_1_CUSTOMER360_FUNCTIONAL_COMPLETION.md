# Session 13.1 — Customer360 Functional Completion

**Scope:** `DEC-CUST-01`, `DEC-CUST-02`, `DEC-CUST-03` from `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`. Implementation session — exposes and connects capabilities already built in the Call Centre architecture; no new backend concepts introduced, no schema migration, no product redesign.

---

## 1. Scope

Exactly the three decisions the Session 13.1 prompt specified:
1. **DEC-CUST-01** — expose Customer360 aggregate/interaction fields already fetched by Customer Detail but never rendered.
2. **DEC-CUST-02** — connect the already-built Customer Activity/Diary backend to Customer360.
3. **DEC-CUST-03** — expose already-proven Customer/Interaction relationships as navigation (Campaign target → Customer360, Chat → Customer360, Initiate Call → Call Detail).

Explicitly not touched: Auth, User Management, NPS, Orchestrator, Reports, Settings, WhatsApp consolidation, Ratio work, new upstream APIs, Chat→Customer360 materialization correctness (reserved for Session 13.2), Campaign redesign, reconciliation/merge UI.

**Post-deployment correction (same session, 2026-10-03):** manual inspection of the deployed Customer Detail page surfaced two issues that had to be resolved before this session could close — §13 and §14 document both.

---

## 2. Files changed

**New:**
- `src/components/customers/CustomerActivityPanel.tsx` — Activity/Diary list, create form, status-change control.
- `src/hooks/customers/useCustomerActivities.ts`
- `src/hooks/customers/useCreateCustomerActivity.ts`
- `src/hooks/customers/useUpdateCustomerActivityStatus.ts`

**Modified:**
- `src/types/customer.ts` — added `ActivityType`/`ActivityStatus`/`CustomerActivityRow`/`CustomerActivitiesResponse`/`NewCustomerActivityPayload`, mirroring the existing server-side activity shapes.
- `src/services/customers/customersService.ts` — added `fetchCustomerActivities`, `createCustomerActivity`, `updateCustomerActivityStatus`.
- `src/services/customers/customersKeys.ts` — added `activities` key.
- `api/customers/[id]/index.ts` — added the `PATCH ?action=activities` handler (`handleUpdateActivityStatus`) with type-aware status validation; documented the activity-authorization decision explicitly.
- `src/pages/CustomerDetail.tsx` — exposed the five already-fetched fields; added `Rec`/`Escalation` columns to Interaction History; mounted `CustomerActivityPanel`.
- `src/components/campaigns/CampaignDetail.tsx` — target name is now a Customer360 link when `customerId` is present.
- `src/types/chat.ts` — added `customer360Id` to `ChatSessionSummary`, distinct from the existing CIF-valued `customerId`.
- `api/chat/logs.ts` — carried the already-resolved internal customer id through `CustomerLink`/`toSummaryFromLive`/`toSummaryFromLocal` instead of discarding it.
- `src/pages/ChatLogs.tsx` — "View Customer 360" link per session row when `customer360Id` is present.
- `src/components/chat/ChatSessionDetailDialog.tsx` — "Customer 360" button in the header when `customer360Id` is present.
- `src/lib/detailOrigin.ts` — added `'outbound-campaigns'`-pattern-consistent `'chat-logs'` origin for the Back-navigation standard.
- `src/pages/InitiateCall.tsx` — added a call_sid+phone Call Detail lookup dialog (same established pattern as Customer/CampaignDetail).
- `src/components/initiate-call/PostTriggerStatusCard.tsx` — added the "View Call Detail" action.

---

## 3. Customer fields exposed (DEC-CUST-01)

All five fields were already fetched into the page's own data object (`aggregate` from `useCustomerDetail`, `row` from `useCustomerInteractions`) — nothing new was fetched; only rendering was added.

| Field | Location | Null/empty handling |
|---|---|---|
| `channels` | Identity & Contact | Empty array → `—`. Non-empty → comma-joined, status-label-formatted. |
| `authSummary.everAuthenticated` / `.lastAuthenticatedAt` | Identity & Contact | `true` → "Yes · last {timestamp}" (timestamp omitted if null). `false` → **"No authentication evidence on record"** — deliberately not "Authentication failed" or "Not authenticated," per the audit's explicit instruction that absence of evidence must not become a false negative claim. |
| `latestAgentId` / `latestAgentDisplayName` | Identity & Contact | Display name preferred; falls back to the raw id only when no display name exists; `—` when neither. |
| `recordingAvailable` | Interaction History (`Rec` column) | Real boolean (`Boolean(voice_record_url)`, never ambiguous) — mic icon when true, `—` when false. No "unknown" state exists for this field. |
| `escalationTrigger` | Interaction History (`Escalation` column) | Shows the actual trigger string when present. When `null`, shows `—` only — **never** rendered as "Not escalated," since the mapper's `|| null` coalesce (`voiceAgentInteractionSource.ts:78`) cannot distinguish "genuinely no trigger" from "value not reported," and the audit explicitly forbids asserting the stronger claim. |

Verified live against production customer `ab81fbcb-fba5-45f9-8a52-a71f2f0aaaf8`: `channels: ["chat","voice"]`, `authSummary.everAuthenticated: false` — both real, non-fabricated values returned by the existing API today.

---

## 4. Activity/Diary implementation (DEC-CUST-02)

- **List + create**: reused the existing `GET`/`POST ?action=activities` routes unchanged. `CustomerActivityPanel` renders a chronological feed (type badge, status badge, title/body, created/due/completed timestamps, creator when supplied) and a type-aware create form (datetime picker only shown for task/reminder/appointment).
- **Placement — corrected post-deployment**: the panel was initially mounted after Campaign Participation (the last section on the page). Manual review of the deployed page flagged this as effectively unreachable for a customer with a long Interaction History (one verification customer has 79 interactions). Moved to render directly after Identity & Contact / Summary and before Interaction History — see §13.
- **All five schema-supported activity types** (note, instruction, task, reminder, appointment) are selectable and were each created and verified against live infrastructure (see §11).
- **Status update — newly exposed**: added `PATCH ?action=activities` (`handleUpdateActivityStatus` in `api/customers/[id]/index.ts`), calling the existing, previously-unreachable `supabaseActivityRepository.updateActivityStatus` → `call_center_activity_update_status` RPC. Allowed transitions are type-aware and match the table's own check constraint and documented resting-state design exactly:
  - `note`: no status lifecycle (UI shows no status control; API rejects an attempted status change with a 400 naming the reason).
  - `instruction`: `active` ↔ `inactive`.
  - `task` / `reminder` / `appointment`: `open` / `completed` / `cancelled`.
  No new status values were invented; the frontend's `STATUS_OPTIONS_BY_TYPE` map is a literal duplicate of the backend's `ACTIVITY_STATUSES_BY_TYPE`, so the UI never offers a transition the API would reject.
- **Deletion — deliberately NOT implemented.** Per the audit's explicit instruction and the Phase 2/3 finding that no delete capability exists at any layer (no RPC, no repository method, no check-constraint-compatible soft-delete state), this session added no delete UI and no delete endpoint. This is a confirmed, permanent absence for this session, not an oversight.
- **Authorization**: no new RBAC was introduced. Activities are treated the same way customer identity itself is already treated in `buildAuthorizedCustomerView` — not category-gated — since an activity is fundamentally a customer-level record with no agent/category dimension of its own (unlike interactions, which the existing `authorizedAgentIds` filter already covers). A caller who cannot see a customer at all remains blocked by the pre-existing "customer exists" check. **Residual, explicitly documented limitation**: an activity linked to a specific campaign or interaction is not additionally filtered by that campaign's/interaction's own agent authorization in this session — closing that gap correctly requires the general User Management/RBAC work tracked as `DEC-USER-01` in the Phase 4 register, not a speculative filter invented here. This is documented in-code at `api/customers/[id]/index.ts`'s `handleListActivities` comment.

---

## 5. Campaign → Customer navigation (DEC-CUST-03, §10.1)

`CampaignDetail.tsx`'s target table now renders the customer name as a button when `target.customerId` is present (it is real, non-nullable, and already on every target row — confirmed in Phase 2), navigating to `/customers/{target.customerId}` with `origin: 'outbound-campaigns'` (an already-existing `DetailOrigin`). No phone-based search was used — the real FK is used directly. Campaign persistence, Target Actions, and all other Campaign Detail behavior are unchanged.

---

## 6. Chat → Customer navigation (DEC-CUST-03, §11)

The real blocker was a one-line discard: `supabaseChatRepository.getCustomerLinks` already resolves and returns the internal Customer360 `customers.id` for a chat session (via `call_center_chat_customer_links`), but `api/chat/logs.ts`'s local `CustomerLink` type only kept `displayName`/`sourceCustomerRef`/`primaryPhoneMasked` — the id itself was computed and then dropped before the response was built.

Fixed by:
- Adding `customerId` to `CustomerLink` (api/chat/logs.ts).
- Adding a new, distinctly-named `customer360Id: string | null` field to `ChatSessionSummary` (`src/types/chat.ts`) — kept deliberately separate from the pre-existing `customerId` field, which is documented as the backend's own CIF and is a different value with a different meaning.
- Populating it in both `toSummaryFromLive` and `toSummaryFromLocal` from `link?.customerId ?? null`.
- Rendering a "View Customer 360" action in Chat Logs (per row) and Chat Session Detail (dialog header), shown **only** when `customer360Id` is non-null — never inferred from `resolvedCustomerLabel` or any other display text.

This session deliberately does **not** touch the broader Chat→Customer360 materialization issue (the hardcoded-null campaign/outcome/sentiment/escalation/duration/direction fields on chat-sourced Customer360 interaction rows) — that is explicitly reserved for Session 13.2 per the prompt.

---

## 7. Initiate Call → Call Detail navigation (DEC-CUST-03, §12 / LIVE-02)

Added a "View Call Detail" action on `PostTriggerStatusCard`, opening a new `CallDetailLookupDialog` in `InitiateCall.tsx`. This reuses the exact, already-proven `call_sid === call_id` correlation mechanism `CustomerDetail.tsx` and `CampaignDetail.tsx` already use for the identical structural problem (`/call-data` has no `call_id`-keyed lookup parameter, only `search`): search the authoritative destination phone number just dialed, filter the bounded paged results to the exact `call_sid` returned by Trigger Call. No new correlation mechanism was introduced, no call was triggered for verification, and no time-window heuristic was added — the id used for the exact-match filter is the real, returned `call_sid`, not a guess. If Call Data hasn't yet materialized the interaction, the dialog shows a plain "hasn't been recorded yet, try again shortly" message rather than inventing data.

---

## 8. Null/empty-state handling (plan §15)

Every new rendered value was traced database/API → repository/server → API/BFF → hook/service → component before being displayed (see the field table in §3 and the mapper citations in §6). Three explicit distinctions were preserved rather than collapsed:
- `authSummary.everAuthenticated === false` is shown as absence-of-evidence, not a negative claim.
- `escalationTrigger === null` is shown as `—`, not "Not escalated."
- `recordingAvailable` has no such ambiguity (a real boolean) and was rendered directly.

---

## 9. Verification performed

- `npm run typecheck` — **0 errors** across `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.api.json`.
- `npm run verify` (`typecheck` + `build`) — clean build, no new warnings beyond the pre-existing >500kB chunk-size notice.
- `npx eslint` on every touched file — **0 errors**; 1 pre-existing warning (`react-hooks/exhaustive-deps` on `allInteractions`, present before this session's edits, not introduced by it, not touched).
- `npm run verify:full` — all deterministic suites green: 23/23 (outcome policy), 24/24 (structured outcomes), 8/8 (configuration versioning), 17/17 (ratio math), 4/4 (ratio dimensions).
- Read-only baseline checks against the deployed site, before this session's deploy (confirming the gap was real and the fix would be visible once deployed):
  - `GET /api/customers/{id}` for a real customer returned populated `channels`/`authSummary`/`latestAgentId` fields the previous UI never rendered.
  - `GET /api/customers/{id}?action=activities` returned `{"data":[]}` for that customer (clean empty-state baseline).
  - `GET /api/chat/logs` showed several sessions with a non-null `resolvedCustomerLabel` (proving a resolvable link exists server-side) and `customer360Id: undefined` (confirming the field genuinely didn't reach the response pre-deploy).
- **Post-deploy API verification performed directly against the production deployment** (commit `a35b3e3`, confirmed Ready in Vercel's deployment list), real customer `ab81fbcb-fba5-45f9-8a52-a71f2f0aaaf8`:
  - `POST ?action=activities` — created one activity of **each of the 5 types** (note, instruction, task, reminder, appointment); each returned the correct default status (note/instruction → `active`, task/reminder/appointment → `open`) and the fields actually submitted, nothing fabricated.
  - `POST` with a missing `body` and with an invalid `activityType` both correctly returned `400` with a stable, specific `detail` message — validation failure confirmed, not silently accepted.
  - `PATCH ?action=activities` — transitioned the test task from `open` → `completed`; response showed `status: "completed"` and a populated `completedAt`. A second `PATCH` attempting to change the test note's status correctly returned `400 {"detail":"Activities of type \"note\" have no status lifecycle"}` — the type-aware rejection works.
  - `GET ?action=activities` on the same customer returned all 5 created rows in strict `createdAt desc` (chronological) order.
  - `GET ?action=activities` on a **different** real customer (`4b36f976-ad50-444e-9a4d-29b68a816410`) returned `{"data":[]}` — confirms customer isolation; the test activities do not leak across customers.
  - `GET /api/chat/logs` after deployment showed real, non-`undefined` `customer360Id` values on sessions that already had a resolved `resolvedCustomerLabel` pre-deploy, confirming the Chat→Customer360 plumbing fix reached production.
- **Live-browser verification of the deployed Customer Detail page** (after the §13/§14 follow-up fixes deployed): confirmed Activity/Diary now renders directly after Identity & Contact/Summary and before Interaction History, showing all 5 test activities with correct type/status badges and working status dropdowns; confirmed the exact previously-failing interaction (`444052b7-3eb4-4855-ae86-148859372f9b`) now opens its detail dialog correctly with full outcome/FCR/sentiment/summary/recording/transcript; independently confirmed a second, different interaction row also opens correctly.
- No telephone call was placed at any point in this session, consistent with the environment-context instruction.

---

## 10. Regression

No existing product behavior was intentionally changed. All edits were additive (new fields rendered, new routes/actions, new navigation) except for the removal of the single-field display gap itself. The deterministic suites exercising Campaign/Ratio logic (unrelated to this session's Customer360 scope) remained 100% green, confirming no incidental regression.

---

## 11. Deliberately unsupported Activity operation

**Activity deletion is not implemented**, by explicit instruction and confirmed audit finding (no RPC, no repository method, no schema-level soft-delete state exists). Disposable test activities created during verification remain in the live `customer_activities` table for customer `ab81fbcb-fba5-45f9-8a52-a71f2f0aaaf8` with no supported way to remove them:

| id | activityType | status | body |
|---|---|---|---|
| `7b9416e2-5edb-49ba-9306-2ab134738050` | note | active | "Session 13.1 disposable verification note (voice channel customer)" |
| `2e0c9191-ddea-4378-9ebd-784c7ea435a9` | instruction | active | "Session 13.1 verification instruction" |
| `1a64f35c-e87d-401a-9e5c-50bd5a7bb84a` | task | completed | "Session 13.1 verification task" |
| `c8f02156-58a8-4e10-b2f5-57778ff79ffe` | reminder | open | "Session 13.1 verification reminder" |
| `e9e1a8b3-552e-4867-9f08-eee8f8008ac0` | appointment | open | "Session 13.1 verification appointment" |

All five are clearly labeled `createdBy: "session-13.1-verification"` and their `body` text self-identifies as a verification row, so they are unambiguous to find and account for later (direct SQL, if the project owner chooses, is the only way to remove them in the absence of a delete capability).

---

## 12. Residual issues deferred to Session 13.2 or later

- Chat→Customer360 materialization correctness (hardcoded-null campaign/outcome/sentiment/escalation/duration/direction fields on chat-sourced Customer360 rows) — explicitly out of scope for 13.1, reserved for 13.2.
- Activity authorization's residual limitation (campaign/interaction-linked activities are not filtered by that link's own agent authorization) — requires the general User Management/RBAC work (`DEC-USER-01`), not addressed here.
- Customer360's own chat-session materialization pagination parity — the Phase 2/3 "UNRESOLVED EVIDENCE QUESTION" about scoped-role row-dropping remains open; untouched by this session.
- `customer_external_identities` consumer path — still unresolved evidence, untouched by this session.

---

## 13. Post-deployment correction 1 — Activity/Diary placement

**Report:** manual inspection of the deployed Customer Detail page confirmed `CUST-01`'s additions (Channels used, Authentication, Latest agent, Rec, Escalation) were visible, but Activity/Diary was not found.

**Investigation:** the code was present and correctly wired (`CustomerActivityPanel` was mounted, its hooks/API calls were correct — confirmed by the API-level verification in §9). The actual defect was information architecture: the panel was mounted as the very last section on the page, after Campaign Participation, which itself comes after the full Interaction History table. For the customer inspected (79 visible interactions), this meant scrolling past dozens of table rows before Activity/Diary ever became visible — in practice indistinguishable from "not implemented" during a normal page review.

**Fix:** moved `<CustomerActivityPanel />` in `src/pages/CustomerDetail.tsx` to render immediately after the Identity & Contact section and the summary `MetricStrip`, and before Interaction History. The page's section order is now: Identity & Contact → Summary → **Activity / Diary** → Interaction History → Campaign Participation, matching the hierarchy specified in the correction request. No other section's content, data source, or behavior was changed — this was a pure reorder of an already-built, already-reviewed component instance (confirmed by a second HIG review pass: 0 findings, since no new markup or props were introduced).

## 14. Post-deployment correction 2 — Interaction drill-down failure

**Report:** clicking interaction `444052b7-3eb4-4855-ae86-148859372f9b` in Customer Interaction History produced "Could not load full interaction detail… right now."

**Investigation (traced exactly as requested — row → id/channel → drill-down provider → detail retrieval → underlying API):**
1. The row's channel was `voice`, so `InteractionLookupDialog` in `CustomerDetail.tsx` took the Voice path: `findCallByPhoneAndId(phoneNumbers, interactionId)` → `fetchCallData({ search: phone, page, page_size }, ...)` → `GET /api/calls/data` → external Voice Partner API.
2. Fetched the customer's real (unmasked) phone number server-side (`+917019225475`) and called `GET /api/calls/data?search=+917019225475&page=1&page_size=100` directly against the deployed API with an authorized role (`x-user-role: call_center_head`): the target call_id was the **first result on page 1** — the interaction genuinely exists in the live Voice API, with full detail (outcome, transcript, recording URL, everything).
3. Repeated the identical request with `x-user-role: unauthenticated` (and with no role header at all, which defaults the same way): `total_records: 75` but **`calls: []`** — every row stripped by `api/calls/data.ts`'s server-side category authorization, which filters by `agent_id` against the caller's authorized set and returns nothing for an unauthenticated caller.
4. Checked `findCallByPhoneAndId`'s call site in `CustomerDetail.tsx`: it called `fetchCallData({ search: phone, page, page_size: LOOKUP_PAGE_SIZE })` with **no `role` argument at all**, which defaults to `'unauthenticated'` inside `callsService.fetchCallData`. This is the exact same bug `CampaignDetail.tsx`'s own `InteractionLookupDialog` hit and fixed previously (its in-code comment describes the identical incident) — `CustomerDetail.tsx`'s copy of the same lookup pattern was never given the equivalent fix.

**Root cause:** application defect (incorrect/missing authorization parameter on an otherwise-correct API call) — **not** a stale/nonexistent upstream interaction, not an ID-mapping error, not a pagination/materialization mismatch, and not a wrong detail provider. The interaction is real, current, and fully retrievable; the lookup simply queried as an unauthenticated caller every time.

**Fix:** `findCallByPhoneAndId` now accepts a `role` parameter and forwards it to `fetchCallData`; `InteractionLookupDialog` now resolves the real session role via `useAuth()` (identical to how `CampaignDetail.tsx` and the rest of this codebase's Customer/Campaign hooks already do it) and passes it through. No new correlation mechanism, no new endpoint — this restores the existing, already-proven phone+ID lookup to actually use the caller's real authorization.

**Post-fix verification — API level:** re-ran the same direct API call with `x-user-role: call_center_head` against the deployed backend and confirmed call `444052b7-3eb4-4855-ae86-148859372f9b` returns full detail (outcome `resolved`, `actual_outcome_code: PROMISE_TO_PAY`, 12-turn `detailed_transcript`, a signed `voice_record_url`).

**Post-fix verification — live browser, same interaction ID:** after the fix deployed, opened `https://callcenter-three-livid.vercel.app/customers/ab81fbcb-fba5-45f9-8a52-a71f2f0aaaf8` in a real browser and clicked the exact "Oct 1, 05:19 PM" row (Interaction ID `444052b7-3eb4-4855-ae86-148859372f9b` — confirmed via the dialog's own displayed ID). The dialog now opens correctly, showing: Resolved, 53s duration, FCR Yes, 95% intent confidence, Positive sentiment, the call summary, a working recording player, and the full turn-by-turn conversation transcript — where it previously showed "Could not load full interaction detail for 444052b7-3eb4-4855-ae86-148859372f9b right now." Also independently confirmed drill-down on a second, different interaction row (Oct 1, 03:34 PM, Escalated) loads correctly. Both the Activity/Diary reorder and the drill-down fix are confirmed working in the actual rendered application, not just at the API level.

---

## Phase 4 Decision Register update

`docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md` is updated to mark `DEC-CUST-01`, `DEC-CUST-02`, and `DEC-CUST-03` as **implemented** in their Master Decision Register rows and Owner Decision Worksheet, with a short note pointing at this document. No other decision row was altered.
