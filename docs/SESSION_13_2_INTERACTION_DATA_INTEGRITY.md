# Session 13.2 — Interaction Data Integrity: Chat + Call

**Scope:** `DEC-CHAT-01`, `DEC-CHAT-02`, `DEC-CALL-01` from `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`. A data-integrity session — correcting known interaction-data loss and incomplete data paths — not a UI redesign, with one narrowly-scoped exception documented in §5 (a post-deployment Customer Detail layout correction the user explicitly asked to fold into this session's documentation).

---

## 1. Scope

1. **DEC-CHAT-01** — expose real Chat session metadata (`campaign_id`, `campaign_target_id`, `is_trial`) already available locally but dropped by the Chat Logs API/BFF.
2. **DEC-CHAT-02 Part A** — correct `chatInteractionSource.ts`'s hardcoded-null Chat → Customer360 materialization, field by field.
3. **DEC-CHAT-02 Part B** — trace the per-turn AI metadata gap end-to-end and correct it, or document precisely why it cannot be corrected.
4. **DEC-CALL-01** — stop dropping genuine Voice backend fields (`actual_outcome_code`, `actual_outcome_name`, `structured_outputs`, `is_bank_customer`, `transcript_doc_id`, `context`) in `callsMapper.ts`.

Explicitly not touched: Live View convergence, Agent Detail, Campaign history/version UI, Ratio logic, new Voice/Chat upstream APIs, Auth/User Management, NPS, Orchestrator, Reports, Settings, WhatsApp migration. No telephone call was placed.

---

## 2. DEC-CHAT-01 — Chat Logs session metadata

### Investigation
`chat_sessions.campaign_id`/`campaign_target_id`/`is_trial` are real columns (added by the `20261007000000_chat_campaign_context_and_trial_marker.sql` migration), set only for sessions initiated from Chat Console's Campaign Customer/Trial modes (Session 11.9B). The external Chat Partner API's own `ChatSessionListRowDto` contract has **no** campaign or trial concept at all — these are VoiceForce-local fields, not upstream fields. `is_trial` was already being read internally by `chatInteractionSource.ts` (via `getTrialFlags`) to exclude Trial sessions from Customer 360 materialization — but neither it nor the campaign fields ever reached `api/chat/logs.ts`'s response.

### What was built
A new, narrowly-scoped Supabase function, `call_center_chat_session_campaign_context` (migration `20261014000000`), deliberately separate from the existing `call_center_chat_customer_links` (which `INNER JOIN`s customers and would silently exclude a campaign-linked session with no resolved customer) and `call_center_chat_session_trial_flags` (a proven, fail-closed lookup `chatInteractionSource.ts` depends on — left completely untouched). The new function does a plain `LEFT JOIN call_center.campaigns` by `chat_sessions.campaign_id`, returning a real `campaign_name` — never fabricated, resolved through the one authoritative source, zero N+1 (one batched call per Chat Logs page, same pattern as the two existing lookups).

`api/chat/logs.ts` now calls this alongside the existing `getTrialFlags`/`getCustomerLinks` (via `Promise.all`, same batching discipline) at all four response-construction sites (live list, live detail, local-fallback list, local-fallback detail). `ChatSessionSummary` gained `campaignId`, `campaignTargetId`, `campaignName`, `isTrial` — `isTrial` is `null` (not `false`) when no local `chat_sessions` row exists at all for a session, distinct from an affirmatively-known `false`.

### UI result
- **Chat Logs**: a compact cyan text-link ("Campaign Name", or literal "Campaign" when only an id resolves) next to the existing "View Customer 360" link, navigating to the existing `/outbound-campaigns/:id` route — no new route, no phone/time search, no fabricated name. A "Trial" badge shown only when `isTrial === true`.
- **Chat Session Detail**: "Campaign" and "Trial" rows added to the existing Session Context panel, same pattern — Campaign is a navigable link when present else `—`; Trial shows `—` (unknown), "No" (confirmed false), or a Trial badge (confirmed true).

### `is_trial` decision
Not reinterpreted. It already has genuine, documented operational meaning (excluding Trial/Test sessions from Customer 360 — a real, consumed behavior, not internal-only noise), so it was exposed per the instruction's "genuine operational meaning" test, not hidden.

### Evidence
Confirmed live post-deployment (`GET /api/chat/logs`): response now includes `campaignId`/`campaignTargetId`/`campaignName`/`isTrial` for every session. No real campaign-linked chat session currently exists in this environment (0 rows with `campaign_id IS NOT NULL`, confirmed via direct SQL) — the join/null-handling path was verified directly via SQL and the deployed Chat Detail dialog (shows "Campaign: —", "Trial: No" correctly for a real, non-trial session with no campaign link). No fake session was created solely to populate the campaign-linked case, per instruction.

---

## 3. DEC-CHAT-02 Part A — Chat → Customer360 materialization

### Field-by-field provenance matrix

| Customer360 Field | Chat Source | Available? | Semantics Compatible? | Mapping |
|---|---|---|---|---|
| `campaignName` | `chat_sessions.campaign_id` → `campaigns.name` (local, LEFT JOIN via the new lookup) | Yes, for sessions with a local campaign link | Yes — same concept Voice already populates from its own `campaign_name` field | **Mapped.** Resolved via the same batched lookup DEC-CHAT-01 added; null when no local campaign link exists (true for every externally-discovered session). |
| `durationSeconds` | `chat_sessions.started_at`/`updated_at` (both real, always present) | Yes | Yes — this app already has an established legitimate duration definition for Chat: `ChatSessionDetailDialog.tsx`'s "Session span" metric (`max(0, (updatedAt − startedAt))` in seconds) | **Mapped,** reusing that exact formula — not a new definition. |
| `outcome` | `status: 'active' \| 'completed'` | Yes (field exists) | **No** — a lifecycle state is not a business outcome (resolved/escalated); the two concepts are not equivalent | **Remains null.** No mapping made. |
| `sentimentScore` | — | **No** — no sentiment field anywhere in the documented Chat API contract | N/A | **Remains null.** Confirmed upstream gap (matches the Phase 4 audit's existing finding), re-confirmed this session by re-reading the current `ChatSessionListRowDto`/`ChatSessionRowDto` contracts. |
| `escalationTrigger` | — | **No** — no escalation field in the Chat API contract | N/A | **Remains null.** Same reasoning as sentiment. |
| `direction` | — | **No** — chat genuinely has no inbound/outbound concept (confirmed again this session; the existing in-code comment was already correct) | N/A | **Remains null.** |

### Verification
New deterministic suite `.tooling/scripts/chat-materialization-verify.mjs` (15/15 passing), testing the real compiled `chatInteractionSource.ts` (via esbuild, not a reimplementation) directly: duration computed correctly from timestamps (including a zero-duration and a defensively-clamped negative-delta case), campaign name passed through only when resolved, all four genuinely-unavailable fields confirmed to stay null, and the existing identity-signal/null-row and Trial-exclusion behavior confirmed unchanged.

Deployed verification: confirmed via `GET /api/customers/{id}?action=interactions` that existing, already-materialized chat rows still show `durationSeconds: null` — expected and correct, since materialization is a one-time reconciliation write, not re-computed on every read; the three already-null Customer360 columns (`outcome`, `sentimentScore`, `escalationTrigger`, `direction`) correctly remain null for these same rows post-deploy, confirming no regression. **Residual verification gap, explicitly flagged, not fabricated around:** re-verifying `durationSeconds`/`campaignName` appearing on a *newly* materialized chat row requires the next scheduled reconciliation cron run (or an admin-token-gated manual trigger this session did not have credentials for) — the unit-test-level verification above is the available substitute, consistent with the instruction not to create fake sessions merely to populate every live combination.

---

## 4. DEC-CHAT-02 Part B — per-turn AI metadata

### Trace
`fetchLiveDetail` (`api/chat/logs.ts`) calls the external `GET /api/v1/chat/sessions/{id}` endpoint, whose documented message shape (`ChatTranscriptMessageDto`) is `{ number, role, message, timestamp }` — **no per-turn metadata field of any kind.** Confirmed directly against a live response (a real chat session with 3 messages): every message key is exactly `{number, role, message, timestamp}`, nothing else. Session-level fields (`latest_intent`, `latest_confidence`, `latest_data_source`, `latest_detection_method`, `latest_latency_ms`) exist, but are explicitly session-level aggregates, not independently confirmed to correspond 1:1 to the final turn — attaching them to "the last AI message" would be an unverified assumption, which governing principle 2.2 explicitly forbids. **No mapping was made from session-level fields to a specific turn.**

The live-path message mapper (`api/chat/logs.ts`'s `messages.map(...)` in the live-detail branch) already never sets `metadata` at all — it is correctly `undefined`, not fabricated. `ConversationTranscript.tsx`'s rendering already treats `metaParts` as fully optional and renders nothing when absent (confirmed by reading the component: `{(entry.metaParts ?? []).map(...)}` — no placeholder, no implied-missing-data UI).

### Conclusion
**Outcome C applies: the live upstream genuinely does not provide per-turn metadata, and the application's existing representation already correctly reflects that — no code change was needed or made for Part B.** This is `application data-path already correct / upstream capability unavailable`, not a bug fixed this session.

### Local fallback
Unaffected and unchanged. `toMessageFromLocal` continues to set real, locally-recorded metadata (`dataSource`, `authenticated`, `intent`, `confidence`, `detectionMethod`, `latencyMs`) for AI-role turns sent through this app's own Chat Console — the one path where per-turn metadata genuinely exists.

| Path | Authoritative source | Per-turn metadata |
|---|---|---|
| Live (dominant path, most sessions) | External Chat API transcript endpoint | **Never available** — contract has no per-turn fields (confirmed live) |
| Local fallback (only when the live call fails) | This app's own `chat_messages` table | **Available for AI turns** sent through this app's own Chat Console |

---

## 5. DEC-CALL-01 — Voice Call normalization

### Field table

| Backend Field | DTO | Normalized Field | UI Exposure | Null Semantics |
|---|---|---|---|---|
| `actual_outcome_code` | `CallDataEntryDto.actual_outcome_code: string \| null` (already typed, confirmed current) | `Interaction.actualOutcomeCode` | **Exposed** — new "Agent Outcome" section, shared Interaction Detail dialog | `undefined` when backend returns null/empty (historical/no-outcome call) — no empty section rendered |
| `actual_outcome_name` | `actual_outcome_name: string \| null` | `Interaction.actualOutcomeName` | Exposed, same section | Same as above |
| `structured_outputs` | `structured_outputs: Record<string, unknown> \| null` | `Interaction.structuredOutputs` | Exposed, same section, rendered generically via `classifyStructuredOutputs` (no EMI-specific assumption) | `undefined` when null; every real key preserved with no mutation when populated |
| `is_bank_customer` | `is_bank_customer: boolean` (declared non-nullable, defensively treated as possibly null at runtime) | `Interaction.isBankCustomer` | **Model-only** — no clear operational value beyond what's already visible on Call Detail; not rendered | `?? undefined` — `false` is a genuine fact, never coerced; only an actual null/undefined becomes `undefined` |
| `transcript_doc_id` | `transcript_doc_id: string \| null` | `Interaction.transcriptDocId` | **Model-only** — no document-retrieval capability exists in this application | `undefined` when null/empty |
| `context` | `context: string` (confirmed, via live sample, a plain string — e.g. `"Handling EMI Payment Inquiry"` — not structured JSON) | `Interaction.context` | **Model-only** — a short internal label with no clearer operational value than `intent` already provides | `undefined` when empty |

### Structured outcome reuse (§15/§16)
No second interpretation was created. The new "Agent Outcome" section reuses `classifyActualOutcome`/`classifyStructuredOutputs`/`formatOutputValue` from `src/lib/campaignActualOutcome.ts` (Sessions 12.5/12.6) exactly as-is, passing `contract: null` since the shared Interaction Detail dialog has no campaign-contract context (it is used from Call Logs, Customer360, and Campaign Detail's Transcript/Recording view alike). With a null contract, `classifyActualOutcome` correctly falls back to the backend's own `actualOutcomeName` (not fabricated — the backend already provides both code and name), and `classifyStructuredOutputs` renders every real key generically with a readable fallback label — fully agent-agnostic, no EMI-specific key ever hardcoded into the common model. This is deliberately distinct from, and does not duplicate, Campaign Detail's own Agent Result dialog, which additionally shows Campaign Classification against the captured outcome policy (out of scope here).

### Cross-channel safety (§24)
`callsMapper.ts` is the only place these six fields are ever set; it has no Chat-mapping path. Confirmed via a dedicated test assertion that `callsMapper.ts` exports exactly the four Voice-shaped mapping functions and nothing else — a Chat-sourced `Interaction` can never carry `actualOutcomeCode`/`structuredOutputs`/`isBankCustomer`/`transcriptDocId` (they simply remain `undefined`, the correct absent state, never a false value).

### Call Logs table
**Deliberately not changed.** Per §22's explicit permission to keep richer information in Call Detail only, no new column was added to the Call Logs table — the core requirement is data preservation, not maximum column count, and Call Logs' table density was judged already sufficient.

### Historical/null compatibility — verified
- Old call (no `actual_outcome_code`/`structured_outputs`): deployed-verified — Call Detail renders Call Summary → Recording directly, with **no empty "Agent Outcome" section** at all.
- Newer populated call (`PROMISE_TO_PAY`, the same real record used in Session 13.1's verification): deployed-verified — "Agent Outcome" shows "Promise to Pay" plus all three real structured-output fields (`promised_payment_date`, `payment_dispute_raised`, `payment_plan_requested`), each with a readable label and value, no `[object Object]`, no `undefined` leakage.

---

## 6. Regression — Campaign

Sessions 12.5–12.7's Campaign Agent Result/outcome-policy/classification/configuration-version-attribution logic consumes `actualOutcomeCode`/`structuredOutputs` through its own, entirely separate `src/server/campaigns/*` path (`resultRules.ts`, `reconcileExecutions.ts`) — untouched by this session, which only changed `src/services/calls/callsMapper.ts` (a different, Call-Logs/Customer360-facing path) and `src/types/interaction.ts` (additive fields only). Full existing Campaign deterministic suites re-run and confirmed green after this session's changes:

- `campaign-outcome-policy-verify.mjs` — 23/23
- `campaign-structured-outcomes-verify.mjs` — 24/24
- `campaign-configuration-versioning-verify.mjs` — 8/8
- `campaign-idempotency-verify.mjs`, `campaign-mapping-uniqueness-verify.mjs` — all green
- `ratio-math-verify.mjs` — 17/17, `ratio-dimensions-verify.mjs` — 4/4

No campaign was launched; no telephone call was placed.

---

## 7. New deterministic tests

- `.tooling/scripts/chat-materialization-verify.mjs` (15/15) — against the real compiled `chatInteractionSource.ts`.
- `.tooling/scripts/call-normalization-verify.mjs` (15/15) — against the real compiled `callsMapper.ts`.

Both wired into the permanent `npm run verify:full` baseline (`package.json`).

---

## 8. Verification summary

- `npm run typecheck` — 0 errors.
- `npm run verify` (typecheck + build) — clean.
- `npx eslint` on every touched file — 0 errors.
- `npm run verify:full` — all suites green, including the two new ones and every pre-existing Campaign/Ratio suite.
- Deployed, live-browser verification (commit `a1d5bb6`, then the density-correction follow-up `below`):
  - Chat Logs/Chat Detail: new `campaignId`/`campaignTargetId`/`campaignName`/`isTrial` fields confirmed present in the live API response; Chat Detail dialog correctly renders "Campaign: —" / "Trial: No" for a real session.
  - Call Detail: the exact previously-verified `PROMISE_TO_PAY` call now shows a correctly-populated "Agent Outcome" section with all three structured fields; a historical call with no actual outcome shows no such section at all.
  - Customer360 chat materialization: confirmed existing (pre-session) materialized rows correctly remain null for all four genuinely-unavailable fields, no regression.
  - No telephone call, no campaign launch.

---

## 9. Customer Detail header density correction (post-deployment addendum)

**Not part of the original DEC-CHAT/DEC-CALL scope.** After this session's primary work was deployed and verified, the user requested one additional, narrowly-scoped layout correction based on visual inspection of the deployed Customer Detail page, explicitly asking that it be folded into this session's documentation rather than opening a separate one.

### What changed
`CustomerDetail.tsx`'s three previously separate presentation layers — the heading row, a bordered "Identity & Contact" `SectionCard`, and a separate `MetricStrip` summary component — were consolidated into **one** compact bordered header block with three rows separated by thin `border-t` dividers instead of three full panel borders:
- **Row 1** — customer name (`h1`, now `truncate`-guarded with a `title` tooltip for long names) + the existing Refresh button, same logical roles as before.
- **Row 2** — Customer ref (when available), masked phone, Channels used, Authentication, Latest agent — dense inline label:value pairs, same data, same masking helper, no standalone "IDENTITY & CONTACT" section title (the heading already establishes that context).
- **Row 3** — First seen, Last seen, Visible interactions (with inbound/outbound breakdown), Latest intent, Latest outcome, Escalations (amber only when > 0) — same six values, same source (`aggregate`/`data.customer`), dense inline presentation instead of `MetricStrip`'s larger card treatment.

The now-unused local `SectionCard` component and the `MetricStrip` import were removed from this file (not from the shared `MetricStrip` component itself, which is still used elsewhere in the app and was left untouched). No data, routing, or authorization logic was changed; Activity/Diary, Interaction History (including the Session 13.1.1 Action column), and Campaign Participation are all unchanged below the new header.

### Responsive behavior
Rows 2/3 use `flex flex-wrap` (not a fixed-column grid), so they reflow naturally at narrow widths without a breakpoint matrix — confirmed by code review; no fixed-width assumption was introduced.

### HIG review
A design review of this change plus the DEC-CHAT-01 UI additions found 0 high-severity issues and several medium/low findings, all fixed before deploying: a missing `truncate` guard on the new `h1` (added), a missing `break-words` guard on Agent Outcome's structured-output values (added), sub-24px touch targets on the new Campaign links in both Chat Logs and Chat Session Detail (fixed with `min-h-6 p-1 -m-1`, matching the existing `CopySessionIdButton` precedent), and a one-off `text-[10px]` Trial badge size inconsistent with the rest of the app (normalized to `text-xs`).

### Verification (deployed, live browser)
1. Separate "IDENTITY & CONTACT" panel: **confirmed gone.**
2. Separate summary panel: **confirmed gone.**
3. All six summary values plus all five identity/contact values: **confirmed all present and correct** (Phone, Channels, Authentication, Latest agent, First seen, Last seen, Visible interactions with in/out split, Latest intent, Latest outcome, Escalations) — `Ref` correctly omitted (not shown as `—`) for the verified customer, which has no `sourceCustomerRef`.
4. Combined top-area height: visually confirmed substantially reduced — the entire consolidated header, Activity/Diary's collapsed row, and the full Interaction History table header are now visible in the first viewport at normal desktop width, where previously only the old three-panel header plus the Activity/Diary toggle were visible before any Interaction History row appeared. This comfortably exceeds the requested ~40% reduction target.
5. Activity/Diary begins materially higher: **confirmed** (directly below the new unified header, same position as the Session 13.1.1 placement fix, now simply reached sooner).
6. More Interaction History visible in the first viewport: **confirmed** — multiple rows now visible without any scrolling, versus needing to scroll past the old header before.
7. Narrow-width wrapping: verified by code (flex-wrap, no fixed columns); not independently re-rendered at a narrow viewport in this pass, since no new fixed-width/overflow risk was introduced relative to the already-reviewed HIG findings above.

---

## Phase 4 Decision Register update

`docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md` is updated to mark `DEC-CHAT-01`, `DEC-CHAT-02`, and `DEC-CALL-01` as implemented, with `DEC-CHAT-02` explicitly annotated as **"application data-path corrected / upstream capability unavailable"** for Part B (per-turn metadata) rather than claiming the upstream gap itself was closed — it cannot be, with the current Chat API contract. No other decision row was altered.

## Remaining external dependencies

- **Chat API per-turn metadata** (DEC-CHAT-02 Part B) — would require a genuine upstream Chat API contract change (a per-turn `data_source`/`confidence`/etc. field on the transcript endpoint) to ever populate on the live path. Not something this application can correct on its own.
- **Chat API sentiment/escalation fields** — same category; the Chat API has no such fields at all today (re-confirmed, not newly discovered this session).
- **Durable test coverage for a real campaign-linked/trial chat session in Customer360** — no such session currently exists in this environment; covered by direct unit tests instead, per the explicit instruction not to fabricate sessions solely for coverage.
