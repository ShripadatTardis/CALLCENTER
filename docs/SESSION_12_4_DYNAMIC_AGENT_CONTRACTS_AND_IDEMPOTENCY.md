# Session 12.4 — Dynamic Agent Contracts & Idempotent Campaign Triggering

Prompt: `prompts/callCprompt 75 12.4 Dynamic Agent Contracts & Idempotent Campaign Triggering.txt`
Commit: `73f243b3248ab81ceb6134ff93b2d897366539c5` (2026-09-30 19:57:49 +0530)
Deployment: `https://callcenter-okslhoy0n-sk-tardis-projects.vercel.app` → aliased to production `https://callcenter-three-livid.vercel.app` (deployment id `dpl_38i8eYscJkLyMkoc9CTQnq3WjY5D`, readyState `READY`)

## 1. Live contracts observed

### Agents API (`GET /api/v1/agents`, proxied via `/api/agents`)

Live-verified post-deploy through the production proxy (`https://callcenter-three-livid.vercel.app/api/agents`). Response shape: `{ success, default_agent_id, agents: [...] }`, 3 agents total.

`emi-reminder-agent` returns the full contract — `agent_id`, `agent_name`, `display_name`, `persona_name`, `direction`, `status`, `description`, `language`, `is_default`, and:

- `expected_input_fields[]` — **8 fields observed**, not the prompt's illustrative 3: 3 required (`customer_name` string, `emi_amount` decimal, `emi_due_date` date/`YYYY-MM-DD`) + 5 optional (`loan_type`, `loan_reference_last4`, `late_fee`, `instalments_remaining`, `total_outstanding`), each with `field_code`, `display_name`, `data_type`, `required`, `description`, `allowed_values`, `format`.
- `expected_outcomes[]`, `output_fields[]` — present on the contract, not exercised by this session (see §4).

The inbound default agent (`inbound-banking-default`) returns the same three arrays, genuinely empty — confirming the "legacy/zero-field agent" case is real, not hypothetical.

### Trigger Call API (`POST /api/v1/call`)

`agent_inputs?: Record<string, unknown>` confirmed as documented, alongside the existing `agent_id`/`customer_id`/`to_phone_number`. Backend validates before dialing (unknown/inactive `agent_id`, missing required input, wrong type/format, undeclared input); omitting `agent_id`/`agent_inputs` retains legacy/default-agent behavior. `Idempotency-Key` header confirmed per the documented semantics (§3 below).

## 2. Files / schema changed

No Supabase migration was needed — the `campaign_agent_input_mappings` table and its SQL functions (`call_center_campaign_create_execution`, etc.) already existed from Session 9.1/11.7 and are reused unchanged.

Source files (9 total, see commit `73f243b`):
- `src/types/api/agents.ts`, `src/types/api/calls.ts` — DTOs extended to the real contract.
- `src/types/campaign.ts` — `AgentInputField.format?`, `AgentOutputField.nullable?` added.
- `src/services/agents/agentsMapper.ts` — maps the new DTO fields into `AgentSummary`.
- `src/lib/campaignAgentContract.ts` — `buildAgentContractFromRoster` now passes the real contract through (`contractSource: 'partner_api'`, `contractCompleteness: 'complete'`) instead of always synthesizing a partial/legacy one.
- `src/server/campaigns/agentContract.ts` — **deleted** (confirmed dead: a stale server-side duplicate with zero importers).
- `src/server/campaigns/triggerCallPayload.ts` — builds `agent_inputs` from mappings, restricted to declared field codes; computes `unresolvedRequiredFieldCodes` as the union of "no mapping at all" and "mapped but unresolvable."
- `src/server/campaigns/campaignRunner.ts` — pre-dial gate on `unresolvedRequiredFieldCodes`; `Idempotency-Key` header wired; `classifyTriggerCallFailure` for 409/503/other.
- `src/pages/CreateCampaign.tsx` — Agent Contract step renders real expected inputs/outcomes; Input Mapping step is a real per-field mapping form (Customer 360 / CSV column), required-and-unmapped blocks Launch Now only.

## 3. Idempotency-key lifecycle

**Key = the `campaign_executions` row's own id.** `createExecution` is called exactly once per target per `runCampaignBatch` pass (and again, as a new row, on a genuinely new attempt via `retryTarget`'s next batch pass). Its id is therefore inherently stable across any transport-level retry of the same attempt (no separate call ever creates a second row for that attempt) and inherently distinct for any deliberately new attempt — no new key-generation or key-tracking state was needed. Verified deterministically: two separate targets/attempts in the test suite receive two different keys; the same attempt's key is never regenerated. The key is never exposed in the UI. 409 (`idempotency_key_conflict`, `request_in_progress`) and 503 (not dialled, key not consumed) are classified explicitly in `classifyTriggerCallFailure` so neither can be read as success or silently retried with a fresh key.

## 4. Item 8 audit — actual agent-specific outcomes/outputs

Call Data (`GET /api/v1/call-data`) now has schema slots for `actual_outcome_code`, `actual_outcome_name`, `structured_outputs` on every call row. **Live-verified null on all 689 real call records scanned (7 full pages), including today's own proven Phase E call.** Typed and documented in `CallDataEntryDto` as present-but-unused. Per the prompt's explicit instruction, this was **not** wired into Campaign reconciliation/result classification — the existing `call_sid == call_id` correlation and existing result-classification model are unchanged. This is recorded as the remaining dependency: wiring real per-call agent outcomes requires this field to actually populate on a real call first.

## 5. Local validation / failure behavior

A real pre-existing gap was found and fixed by this session's own test suite: `resolveMappedInputValues` only detects "a mapping exists but its source value is blank" — a contract-required field with **no mapping row at all** was invisible to it. `triggerCallPayload.ts` now also calls the pre-existing (previously unused by the runner) `validateInputMapping`, and unions both checks. `campaignRunner.ts` gates on this before ever calling `backend.triggerCall` — the execution row is created (for audit history) but marked `failed` with a diagnostic reason naming the missing field code(s), and no dial is attempted.

## 6. Backward compatibility

`agent_inputs` is omitted entirely (not sent as `{}`) whenever the contract declares zero expected input fields or no contract is known — verified for both the zero-field agent and a null-contract target, producing a byte-identical legacy request shape.

## 7. Tests / build / lint

- New: `.tooling/scripts/campaign-idempotency-verify.mjs` against the real esbuild-bundled `campaignRunner.ts` — **15/15 assertions passed** (fully-mapped success; missing-required-mapping → no dial; undeclared field never sent; zero-field agent → `agent_inputs` omitted; null contract → same; two attempts → two distinct idempotency keys; simulated 409 → classified, never counted as triggered).
- Regression: `.tooling/scripts/ratio-math-verify.mjs` **17/17**, `.tooling/scripts/ratio-runtime-state-verify.mjs` **22/22** — both unchanged, confirming zero collateral impact on Ratio Explorer (R4.1/R4.2/R4.3) from this session's Campaign-only changes.
- `tsc --noEmit`, `npm run build`, `npm run lint` — all clean at baseline (lint: 117/36, unchanged from session start).

## 8. Live post-deploy verification

- `GET /api/agents` through the production proxy returns the full live contract, confirmed above (§1).
- Phase E evidence confirmed unmutated via direct read-only SQL against Supabase project `dtbaczafdzgctkbqviod`:
  - Campaign `b0de9fae-e9bf-4746-b916-04101cc4dae6`: `agent_contract_snapshot` still `{contractSource: 'legacy', contractCompleteness: 'partial', expectedInputFields: []}` — its immutable pre-session snapshot, exactly as expected (new campaigns created after this deploy will show `partner_api`/`complete`; this one never will, by design).
  - Target `7c319e38-8ab9-49ad-8f18-4201d87f6cd1`: still `status: completed`, `effective_result_id: d99b6246-cf6b-4b5a-b11e-c674f1193b0f`.
  - Execution `32d6e4bb-5305-4533-9836-1063c66960e3`: still `status: triggered`, `call_sid: 45237051-9843-42e6-bfbd-f7d7fbda6c82` (the proven call).
- No new Trigger Call was placed at any point this session — every check above was read-only (fetch/SQL select) or exercised entirely against in-memory test fixtures, never the real Voice Agent backend's dial path.

## 9. Confirmation

No unauthorized telephone call was placed during this session. Phase E's historical records (campaign `b0de9fae-...`, target `7c319e38-...`, execution `32d6e4bb-...`, call `45237051-...`) were read-only verified and remain byte-for-byte as they were before this session began.
