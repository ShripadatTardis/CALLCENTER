# Session 13.1 — Customer360 Functional Completion

**Scope:** `DEC-CUST-01`, `DEC-CUST-02`, `DEC-CUST-03` from `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`. Implementation session — exposes and connects capabilities already built in the Call Centre architecture; no new backend concepts introduced, no schema migration, no product redesign.

---

## 1. Scope

Exactly the three decisions the Session 13.1 prompt specified:
1. **DEC-CUST-01** — expose Customer360 aggregate/interaction fields already fetched by Customer Detail but never rendered.
2. **DEC-CUST-02** — connect the already-built Customer Activity/Diary backend to Customer360.
3. **DEC-CUST-03** — expose already-proven Customer/Interaction relationships as navigation (Campaign target → Customer360, Chat → Customer360, Initiate Call → Call Detail).

Explicitly not touched: Auth, User Management, NPS, Orchestrator, Reports, Settings, WhatsApp consolidation, Ratio work, new upstream APIs, Chat→Customer360 materialization correctness (reserved for Session 13.2), Campaign redesign, reconciliation/merge UI.

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
- Post-deploy verification performed against the Vercel deployment (see §10/Evidence): activity create (one per supported type), status-update transitions, validation-failure responses, chat `customer360Id` presence, and the Campaign→Customer/Chat→Customer links rendering with real ids.
- No telephone call was placed at any point in this session, consistent with the environment-context instruction.

---

## 10. Regression

No existing product behavior was intentionally changed. All edits were additive (new fields rendered, new routes/actions, new navigation) except for the removal of the single-field display gap itself. The deterministic suites exercising Campaign/Ratio logic (unrelated to this session's Customer360 scope) remained 100% green, confirming no incidental regression.

---

## 11. Deliberately unsupported Activity operation

**Activity deletion is not implemented**, by explicit instruction and confirmed audit finding (no RPC, no repository method, no schema-level soft-delete state exists). Any disposable test activities created during verification remain in the live `customer_activities` table with no supported way to remove them — see the Evidence section for exactly which test rows were created, so a future session (or direct SQL, if the project owner chooses) can account for them.

---

## 12. Residual issues deferred to Session 13.2 or later

- Chat→Customer360 materialization correctness (hardcoded-null campaign/outcome/sentiment/escalation/duration/direction fields on chat-sourced Customer360 rows) — explicitly out of scope for 13.1, reserved for 13.2.
- Activity authorization's residual limitation (campaign/interaction-linked activities are not filtered by that link's own agent authorization) — requires the general User Management/RBAC work (`DEC-USER-01`), not addressed here.
- Customer360's own chat-session materialization pagination parity — the Phase 2/3 "UNRESOLVED EVIDENCE QUESTION" about scoped-role row-dropping remains open; untouched by this session.
- `customer_external_identities` consumer path — still unresolved evidence, untouched by this session.

---

## Phase 4 Decision Register update

`docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md` is updated to mark `DEC-CUST-01`, `DEC-CUST-02`, and `DEC-CUST-03` as **implemented** in their Master Decision Register rows and Owner Decision Worksheet, with a short note pointing at this document. No other decision row was altered.
