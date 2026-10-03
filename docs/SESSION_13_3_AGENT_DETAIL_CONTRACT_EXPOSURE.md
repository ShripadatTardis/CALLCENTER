# Session 13.3 — Agent Detail Contract Exposure, and Contract-Aware Initiate Call / Chat

**Scope:** `DEC-AGENT-01` from `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`, plus the scope amendment requiring the contract to actually *govern* the application's direct interaction entry points (Initiate Call, and Chat Console where its real backend supports it) — not merely be displayed on Agent Detail. This is the first implementation pass for DEC-AGENT-01; no prior session had begun it.

---

## Contract Consumers

| Consumer | Contract Usage |
|---|---|
| Agent Detail | Read/inspect — full generic exposure (Expected Inputs/Expected Outcomes/Output Fields), read-only |
| Initiate Call | **Direct value entry** — a dynamic, contract-driven Agent Inputs form; values flow into the real Trigger Call request's `agent_inputs` |
| Chat Console | **Not wired** — the real Chat API/transport has no mechanism to receive Agent Contract inputs today (confirmed this session, see §"Chat API capability finding"); no editable fields were added, nothing fabricated |
| Campaign Configuration | Source mapping — unchanged, already existed before this session |

All four consumers read the same `CallAgentContract` shape (`buildAgentContractFromRoster`, `src/lib/campaignAgentContract.ts`) built from the same live `GET /api/v1/agents` response — no second contract definition was created anywhere.

---

## 1. Agent Detail — full contract exposure (baseline DEC-AGENT-01)

### Before
`AgentDetail.tsx`'s "Call Agent Contract" section fetched the real, populated contract (`buildAgentContractFromRoster(agent)`) but rendered only a single line: `Contract source: partner_api`. The actual `expectedInputFields`/`expectedOutcomes`/`outputFields` arrays were fetched and immediately discarded by the UI — confirmed exactly matching the Phase 2/3 audit's finding.

### After
Three generic sub-sections, rendered only when `contract.contractCompleteness === 'complete'` (the "partial/legacy" branch is preserved unchanged for defensive correctness, even though every live agent today returns `'complete'`):
- **Expected Inputs** — one row per field: display name, a data-type badge, a "Required"/"Optional" indicator, and format/allowed-values hints when present. Shows "— none declared" inline when the array is genuinely empty (e.g. `inbound-banking-default`), never a blank gap implying missing data.
- **Expected Outcomes** — one badge per declared outcome, tooltip = description.
- **Output Fields** — same row pattern as Expected Inputs, with a "Nullable" indicator when applicable.

Nothing here is agent-specific markup — the same component renders EMI Reminder's 8 input fields, Forex Transaction's 1, or the inbound default agent's 0, purely from the fetched contract.

---

## 2. Initiate Call — Agent-Contract-aware direct call

### The defect
Initiate Call previously sent only `{ to_phone_number, agent_id }` regardless of which agent was selected. For a contract-rich outbound agent like EMI Reminder (3 required + 5 optional declared inputs, confirmed live), this is structurally incomplete — the real backend validates `agent_inputs` before dialing and would reject or silently under-serve a request missing them.

### What was built

**Shared component — `AgentContractInputs`** (`src/components/agents/AgentContractInputs.tsx`), consuming the exact same `CallAgentContract` shape as Agent Detail and Campaign Configuration. For each declared input field it renders:

| Contract concept | Control |
|---|---|
| `allowedValues.length > 0` (enum, any data_type) | `Select` dropdown of the real declared values |
| `dataType === 'boolean'` | Checkbox |
| `dataType === 'date'` | `<input type="date">` — native browser format/validation, no custom regex invented |
| `dataType === 'integer'` / `'decimal'` | `<input type="number">` with `step="1"` / `step="any"` |
| anything else (`'string'`, or any future/unrecognized `data_type`) | plain text input — §3's "do not assume this is the complete type set" means an unrecognized type is rendered generically, never dropped or crashed on |

Required fields get a red `*` in the label and, once a submit attempt has been made (`showValidation`), a "Required" error directly under the field if still empty — never color-alone (the asterisk and the text label are both always present).

**Pure helpers — `src/lib/agentContractInputs.ts`** (no React dependency, directly esbuild-testable):
- `isFieldSatisfied` / `validateAgentContractInputs` — "required means present and non-blank"; no validation rule beyond what the contract actually declares is invented (no regex for `loan_reference_last4`'s free-text `format: "4 digits"` hint, for example — it's shown as a placeholder only).
- `buildDeclaredAgentInputs` — deliberately mirrors `src/server/campaigns/triggerCallPayload.ts`'s exact discipline: only field codes the contract declares are ever included; an empty optional value is omitted (not sent as `""`); the whole `agent_inputs` object is `undefined` (never `{}`) when the contract declares zero inputs or nothing resolved — so the direct-call path and the Campaign Runner agree on what `agent_inputs` means, not two incompatible interpretations of the same Session 12.4 contract.
- `coerceInputValue` — string-input-event → typed-value coercion for the live-confirmed data types (string/decimal/integer/date/boolean); an unrecognized type falls through to the raw string rather than erroring.

**`useInitiateCall.ts`** now:
- Resolves `contract` for the currently-selected agent via `buildAgentContractFromRoster`, from the same `useAgents()` roster the agent dropdown already renders.
- Holds `agentInputs: Record<string, unknown>` in `CallConfiguration`, cleared completely on every agent change (§10 — "prefer correctness over clever value retention"; a field code happening to match between two different agents' contracts is not treated as a safe carry-over).
- Gates `initiateCall()` on `validateAgentContractInputs(contract, agentInputs).isValid` before ever calling Trigger Call — if invalid, submission is blocked and `showValidation` flips on so the form highlights exactly which required fields are empty.
- Builds the real request as `{ to_phone_number, agent_id, ...(agentInputs ? { agent_inputs: agentInputs } : {}) }`, with `agentInputs` from `buildDeclaredAgentInputs` — undeclared values can never leak into the request body.
- Backend remains authoritative (§8): a real backend rejection still surfaces its real error message via the existing `triggerError`/toast path, unchanged from before this session.

**Customer-aware prefill (§5/§6):** when the entered phone number is valid, `useCustomers(phoneNumber, 1)` — the exact same customer-search path `Customers.tsx` already uses, not a new lookup mechanism — resolves it. If exactly one Customer360 match is found **and** it has a genuine, non-null `displayName`, **and** the selected contract declares a `customer_name` field, **and** the operator hasn't already typed into that field themselves, the resolved name is prefilled into `customer_name` only. No other field is ever prefilled: EMI/loan attributes (`emi_amount`, `emi_due_date`, `loan_type`, `loan_reference_last4`, `late_fee`, `instalments_remaining`, `total_outstanding`) have no Customer360 source and are never guessed by field-name similarity, never inferred from transcripts or previous calls, and never fabricated when Customer360 only has CIF/phone identity (the common case in this dataset today — see Verification).

**Layout (§9):** Phone Number and AI Agent moved from two full-width stacked fields to a `flex flex-wrap` side-by-side row; Agent Inputs renders directly below using the contract's own field count (nothing hardcoded for EMI or any other agent) with responsive wrapping (`flex flex-wrap`, no fixed grid). An agent with zero declared inputs (e.g. the inbound default agent) shows no Agent Inputs section at all — not an empty shell (§11).

---

## 3. Chat Console — contract applicability finding

### Trace (§12)
1. `ChatRequestDto` (`src/types/api/chat.ts`) — the documented real request shape for `POST /api/v1/chat` — has exactly 7 fields: `message`, `session_id`, `agent_id`, `customer_id`, `contact_id`, `caller_name`, `phone_number`. **No `agent_inputs` field, no equivalent structured-initialization field of any kind.**
2. `api/chat/index.ts`'s `handleSend` builds `upstreamPayload` explicitly field-by-field from the request body — confirmed by reading the full function: it only ever copies `agent_id`/`customer_id`/`contact_id`/`caller_name`/`phone_number` onto the upstream payload. `campaign_id`/`campaign_target_id`/`is_trial` are read from the body but are explicitly documented and coded as **VoiceForce-local only, never part of `upstreamPayload`, never sent to the backend** (Session 11.9B).
3. No separate "chat session initialization" endpoint exists anywhere in `api/chat/*.ts` that could carry a richer payload.

### Conclusion: **Outcome C** — the real Chat backend does not currently accept Agent Contract inputs in any form.

Per the explicit instruction, **no fabricated support was added.** Chat Console was left unchanged — no editable Agent Inputs fields were added to Chat Console (which would misleadingly imply the contract is being supplied when it genuinely cannot be), and `ChatIdentitySelector.tsx`'s existing identity/campaign/trial selection UI (unrelated to contract inputs) was not touched. Agent Detail still fully exposes the contract regardless of this limitation (§1). This is recorded as a genuine external/upstream dependency, not a false "closed" decision.

---

## 4. Request construction (§7) — shared discipline, not a second implementation

| Concern | Campaign Runner (`triggerCallPayload.ts`) | Initiate Call (`useInitiateCall.ts` + `agentContractInputs.ts`) |
|---|---|---|
| Source of values | Resolved from CSV/Customer360 column mappings | Direct operator entry (+ the one narrow, authoritative `customer_name` prefill) |
| Declared-field filtering | `declaredFieldCodes.has(code)` check against `contract.expectedInputFields` | Same check, same contract shape, via `buildDeclaredAgentInputs` |
| Empty contract / no contract | `agent_inputs` omitted entirely | Same — `undefined`, never `{}` |
| Required-field gating | `validateInputMapping` — blocks a target from running | `validateAgentContractInputs` — blocks the Initiate Call button |
| `agent_id` / `agent_inputs` meaning | Session 12.4 contract | Same Session 12.4 contract |

Two call sites, one shared meaning of the contract — not two interpretations.

---

## 5. Verification

### Deterministic (`.tooling/scripts/agent-contract-inputs-verify.mjs`, 23/23 passing, against the real esbuild-compiled `agentContractInputs.ts`)
Covers (§21): required string, optional string, decimal/integer/date coercion (including non-numeric fallback-to-raw for decimal/integer, and integer rejecting a non-integer value), an unrecognized/future `data_type` falling through to raw text rather than erroring, a zero-input contract, a `null` contract, undeclared-value exclusion from the built payload, full payload construction with no key loss, and the exact "all three required EMI fields missing → all three listed" / "all required filled → valid" validation cases.

### Live contract shape re-confirmed (not assumed from memory, per §18)
`GET /api/v1/agents` queried directly against the deployed proxy this session:
- `emi-reminder-agent`: 8 input fields — `customer_name` (string, required), `emi_amount` (decimal, required), `emi_due_date` (date, required, format `YYYY-MM-DD`), `loan_type` (string, optional), `loan_reference_last4` (string, optional, format hint `"4 digits"`), `late_fee` (decimal, optional), `instalments_remaining` (integer, optional), `total_outstanding` (decimal, optional).
- `forex-transaction-agent`: 1 input field — `customer_name` (string, required). Used as the "contract-light agent" verification target (§18).
- `inbound-banking-default`: 0 input fields, 0 outcomes, 0 output fields — the genuine zero-input case (§11).

### Trigger request payload construction (§19) — proven without a telephone call
`buildDeclaredAgentInputs`/`validateAgentContractInputs` are unit-tested directly (above) against the real EMI contract shape, proving: the correct `agent_id` role each field plays, required-field gating blocks submission until satisfied, and no undeclared field can appear in the constructed `agent_inputs` object. `useInitiateCall.ts`'s request-construction line (`{ to_phone_number, agent_id, ...(agentInputs ? { agent_inputs: agentInputs } : {}) }`) is a thin, already-tested composition of these same functions — not independently re-tested at the hook level, consistent with this repository's existing testing convention of covering pure logic modules rather than React hooks directly. No telephone call was placed at any point in this session.

### Customer360 prefill — authoritative-only, verified against real data
Queried the live customer roster: of 32 real customers, exactly 1 (`Kwame Mensah`) has a non-null `displayName` — every other customer genuinely has only CIF/phone identity, confirming the prefill correctly stays silent for the overwhelming majority of real records rather than fabricating a name. That one customer's stored raw phone number (`2.332E+11`) is itself a pre-existing spreadsheet-import data-quality artifact in the source dataset (unrelated to this session, not fixed here — out of scope) and could not be used to phone-search-trigger a live prefill demonstration; the prefill *logic* (authoritative-match-only, never-clobber-operator-input) was verified by code review of the exact condition chain in `useInitiateCall.ts` rather than a live UI demonstration, and this limitation is recorded honestly rather than staged around.

### Agent switching / stale-input clearing
Verified by code: `updateSelectedAgent` unconditionally resets `agentInputs` to `{}` and clears the touched-fields tracking set — confirmed via reading the implementation; no partial-retention logic exists that could leak a value typed for one agent's contract into a request for a different agent.

### Recent Calls / Initiate Call → Call Detail (§17)
Unchanged — `PostTriggerStatusCard`'s "View Call Detail" action and the Session 13.1 `call_sid`-based lookup were not touched by this session; `LastTriggeredCall`'s shape is unchanged.

### Full regression
`npm run typecheck` — 0 errors. `npm run build` — clean. `npx eslint` on every touched file — 0 errors. `npm run verify:full` — all suites green, including every pre-existing suite from Sessions 12.5–13.2.

---

## 6. DEC-AGENT-01 closure criteria (§23)

Per the amendment's explicit closure bar:
- [x] Agent Detail exposes the contract — full generic Expected Inputs/Expected Outcomes/Output Fields.
- [x] Initiate Call respects the contract — dynamic Agent Inputs, required-field gating, declared-field-only payload construction.
- [x] Campaign Configuration continues respecting it — unchanged, already did before this session.
- [x] Chat Console — the real backend's lack of contract-input support is explicitly established (Outcome C), not falsely closed.

All four conditions are satisfied; `DEC-AGENT-01` is implemented to the extent the current upstream contracts support.

---

## Remaining external dependency

**Chat Agent Contract inputs** — would require an actual upstream Chat API contract change (an `agent_inputs`-equivalent field on `POST /api/v1/chat`, or a separate structured chat-initialization endpoint) before this application could ever pass contract values into a Chat conversation the way it now does for Voice. Not something this application can close on its own; recorded here as an explicit, un-fabricated external dependency rather than a closed decision.
