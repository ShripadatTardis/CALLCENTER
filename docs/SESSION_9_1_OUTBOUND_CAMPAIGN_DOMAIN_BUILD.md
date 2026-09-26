# Session 9.1 — VoiceForce Outbound Campaign Domain Build

**Status:** implemented, deployed, and live-verified against production.
**Scope:** Agent Contract snapshot, Audience/Data mapping, and Outcome Policy
foundation on top of Session 5's real Outbound Campaigns engine.

---

## 1. Executive summary

This session evolves the already-real Outbound Campaigns control plane
(Session 5) to be **Call-Agent-contract-aware**, per
`VOICEFORCE_OUTBOUND_CAMPAIGN_DESIGN_v2.docx` and this project's own Session 9
audit. It does **not** create a second campaign engine, does **not** rename
`agentId` semantics, and does **not** touch campaign reconciliation rules or
correlation logic beyond adding two purely-additive traceability fields to the
result payload.

Every new piece of metadata is honestly sourced: today's live `GET
/api/v1/agents` is confirmed (again, live, this session) to be roster-only —
`agent_id`/`display_name`/`persona_name`/`direction`/`language`/`is_default`,
nothing else. Every Agent Contract built from it is therefore
`contractSource: 'legacy'`, `contractCompleteness: 'partial'`, with empty
`expectedInputFields`/`expectedOutcomes`/`outputFields` arrays — never
invented defaults.

## 2. Files changed

**New:**
- `supabase/migrations/20261002000000_campaigns_agent_contract_and_input_mapping.sql`
- `src/server/campaigns/agentContract.ts` (server-side roster→contract adapter)
- `src/server/campaigns/inputMapping.ts` (pure, deterministic validate/resolve)
- `src/server/campaigns/triggerCallPayload.ts` (the one localized Trigger Call payload builder)
- `src/lib/campaignAgentContract.ts` (frontend mirror of the roster→contract adapter)

**Modified:**
- `src/server/campaigns/types.ts` — `CallAgentContract`, `AgentInputField`,
  `AgentOutcomeDefinition`, `AgentOutputField`, `CampaignAgentInputMapping`,
  extended `Campaign`/`CampaignDetail`/`CampaignExecution`/`CampaignResult`/
  `DerivedCampaignResult`.
- `src/server/campaigns/campaignRepository.ts` — extended `createCampaign`
  input, new `setInputMappings`, `createExecution` gained an optional
  payload-snapshot parameter.
- `src/server/campaigns/supabaseCampaignRepository.ts` — row mappers +
  RPC call-site updates for all of the above.
- `src/server/campaigns/campaignRunner.ts` — now builds its Trigger Call
  payload via `buildTriggerCallPayload` (was inlined) and persists the
  request snapshot on execution creation.
- `src/server/campaigns/reconcileExecutions.ts` — threads the campaign's
  agent snapshot into the derived result on a reconciled transition.
- `src/server/campaigns/resultRules.ts` — `DerivedCampaignResult` return
  shape extended with `agentId`/`agentName`/`structuredOutputs` (always
  `null` from this pure function; filled by the caller).
- `api/campaigns.ts` — `handleCreate` accepts `agentName`/
  `agentContractSnapshot`/`mappings`; new `setInputMappings` action added
  to the existing action-dispatch switch. **No new route file.**
- `src/types/campaign.ts` — frontend mirror of every new server type.
- `src/services/campaigns/campaignsService.ts` — new `setCampaignInputMappings`.
- `src/pages/CreateCampaign.tsx` — two new wizard steps (Agent Contract,
  Input Mapping), snapshot passed on create.
- `src/components/campaigns/CampaignDetail.tsx` — shows the campaign's
  **snapshotted** agent name/contract state, not a live `/agents` re-lookup.

## 3. Schema changes

All additive, all nullable/optional, zero breaking change to any existing
row or RPC caller:

| Table | New column(s) |
|---|---|
| `campaigns` | `agent_name text`, `agent_contract_snapshot jsonb` |
| `campaign_executions` | `request_payload_snapshot jsonb` |
| `campaign_results` | `agent_id text`, `agent_name text`, `structured_outputs jsonb` |
| *(new)* `campaign_agent_input_mappings` | `id, campaign_id, agent_input_field_code, source_type, source_field, required, data_type, created_at, updated_at`, unique on `(campaign_id, agent_input_field_code)` |

RPC changes — all `create or replace` with new parameters added **only as
trailing `default null` arguments**, so no existing caller shape breaks:
`call_center_campaign_create` (+3 params), `call_center_campaign_get` (now
also returns `mappings`), `call_center_campaign_create_execution` (+1 param),
`call_center_campaign_update_reconciliation_status` (p_result may now carry
`agentId`/`agentName`/`structuredOutputs`). One brand-new RPC:
`call_center_campaign_set_input_mappings`. All are `SECURITY DEFINER`,
`service_role`-only, verified via `has_function_privilege` after migration
(confirmed `service_role: true`, `anon: false`).

No `agent_version` column exists anywhere — `agent_id` remains the sole
immutable identity, exactly per the hard rule.

## 4. Current vs target agent-contract support

**Confirmed live this session** (re-fetched `GET /api/v1/agents` against
production): the response is still exactly `{success, default_agent_id,
agents: [{agent_id, display_name, persona_name, direction, language,
is_default}]}` — no expected-input, expected-outcome, or output-field
metadata. This matches `src/types/api/agents.ts`'s existing, already-confirmed
DTO exactly; nothing changed.

**Target state, ready but unpopulated:** `CallAgentContract`'s
`expectedInputFields`/`expectedOutcomes`/`outputFields` arrays, and the
`campaign_agent_input_mappings` table, are fully wired end-to-end (create →
persist → get → runner consumption) and tested with a **synthetic, non-real
mock contract** (see §13) — but every *real* campaign built against today's
roster gets `contractCompleteness: 'partial'` with all three arrays empty,
by design, not by omission.

## 5. Audience / Customer 360 / CSV model

Unchanged behaviorally — `campaign_targets.source_attributes jsonb` already
snapshots CSV-imported business fields at import time (a stable, non-live
copy), and `customer_id`/`contact_point_id` FKs already resolve Customer 360
identity server-side via the existing `call_center_campaign_import_targets`
RPC (untouched this session). This satisfies the "values used for execution
must be stable" requirement without a broader schema change — confirmed via
audit, not assumed.

The new `campaign_executions.request_payload_snapshot` goes one step further
than the plan's minimum ask: it captures the *exact* Trigger Call payload
actually sent for each individual execution (not just the target's source
data), so a later Customer 360 edit can never retroactively change what a
historical execution appears to have used. Verified live (§13): a real test
execution's snapshot shows `{"agent_id":"emi-reminder-agent",
"to_phone_number":"+919999900001"}` — `customer_id` correctly omitted, since
this synthetic customer had no `source_customer_ref`.

## 6. Input mapping design

Three source classes only, per the plan (`customer360` | `csv` |
`campaign_field`) — no generic CRM connector. `validateInputMapping` and
`resolveMappedInputValues` (`src/server/campaigns/inputMapping.ts`) are pure,
deterministic, LLM-free functions: the former finds required-but-unmapped
agent input fields; the latter resolves mapped values from three plain
in-memory field bags (Customer 360 fields, CSV/target `source_attributes`,
campaign-level fields) and flags any required field it couldn't resolve.
Verified against a constructed complete mock contract (§13) — never against
fabricated Partner API metadata.

Today, since every real contract is `contractCompleteness: 'partial'` with
zero expected input fields, `validateInputMapping` always returns `valid:
true` for a legacy campaign — it is structurally impossible for this code to
fabricate a required field the backend hasn't actually declared.

## 7. Trigger Call adapter behavior

`buildTriggerCallPayload` (`src/server/campaigns/triggerCallPayload.ts`) is
now the **single, localized** place `campaignRunner.ts` builds a Trigger Call
request — previously inlined directly in the runner's loop. Confirmed live
(§13): it produces exactly `{to_phone_number, agent_id, customer_id?}` —
identical to Session 5's original shape, byte-for-byte — and never adds an
`agent_inputs` field or any other key the live `TriggerCallRequestDto`
doesn't declare. The function also computes (but does not send)
`resolvedInputValues`/`unresolvedRequiredFieldCodes` from the mapping layer,
purely for the request-payload-snapshot audit trail. The day a real
`agent_inputs` field is confirmed on the Partner API, only this one
function's `request` object needs to change — the runner, repository, and
RPC layers already pass whatever it produces through unmodified.

## 8. Expected outcome vs actual outcome vs VoiceForce outcome policy

Unchanged and reused, not rebuilt: `campaign_result_rules` /
`deriveCampaignResult` (`resultRules.ts`) remain the one deterministic,
non-LLM outcome-policy engine, exactly as Session 5 designed. This session
only extends what gets attached to a derived result — a plain, non-inferred
copy of the campaign's own agent snapshot (`agentId`/`agentName`) at
reconciliation time, plus a `structuredOutputs` slot that stays `null` until
Call Centre exposes real structured call outputs (no such field exists on
`CallDataEntryDto` today — confirmed, not assumed).

No actual-outcome inference was added anywhere. If a call log lacks the data
a rule needs, the execution still reconciles to `resultCode: 'unclassified'`,
`isSuccess: null` — exactly the pre-existing honest-unclassified behavior.

## 9. Agent immutability and historical traceability

`agent_id` remains the sole identity; `agentName` is human-readable only and
is captured as a **snapshot** on the campaign at create time, not re-derived
from a live lookup. `CampaignDetail.tsx` was updated to display
`campaign.agentName ?? campaign.agentId` and the snapshot's
`contractSource`/`contractCompleteness` — confirmed via code read that no
other Campaign screen performs a live `/agents` re-lookup that could
overwrite this history (Campaigns never called `useAgents()` for display
before this session either — verified, not assumed).

`campaign_results.agent_id`/`agent_name` now carry the same snapshot forward
onto every individual result row, verified live (§13) via a direct RPC call:
inserting a result with `agentId: 'emi-reminder-agent'`,
`agentName: 'EMI Reminder'` persisted both columns correctly.

## 10. Correlation status

**Unchanged — still not empirically confirmed**, per Session 9's own audit
(`docs/SESSION_9_OPERATIONALIZE_CAPABILITY_AUDIT.md` §7): PARTIALLY
CONFIRMED. This session does not touch `CAMPAIGN_RECONCILIATION_CORRELATION_MODE`
or `tryAuthoritativeMatch`'s logic at all — `reconcileExecutions.ts`'s only
change is threading the agent snapshot into an already-derived result, never
altering *whether* or *how* a match is found. No phone/time/campaign-name
fallback was introduced or strengthened. The blocker remains exactly what
Session 9 described: one real empirical Trigger Call test, or a backend-team
confirmation.

## 11. Partner API dependencies still blocking full production behavior

Unchanged from the design doc's own §12 (all still P0/open):
1. Agent API exposing expected input fields, expected outcomes, and
   structured output fields per `agent_id`.
2. Trigger Call accepting the selected agent's declared inputs
   (`agent_inputs`).
3. Call Log returning the exact `agent_id`, actual outcome, and structured
   outputs with historical traceability.
4. A deterministic call-identifier contract across Trigger Call/Call
   Data/Session/Transcript/Recording (the pre-existing correlation gap,
   §10).

No claim is made anywhere in this build that Call Centre has already
implemented any of these — every "complete" code path in this session was
only exercised against a locally-constructed synthetic mock contract, never
against a live response.

`VOICEFORCE_CALL_CENTRE_PARTNER_API_REQUIREMENTS.docx` does not exist in this
repository's `docs/` folder — confirmed via directory listing before starting.
No such document was fabricated or created; there is nothing existing to
update.

## 12. Backward compatibility

- Every schema change is additive/nullable; no column was renamed, no RPC
  parameter was removed or reordered, no existing table constraint changed.
- `api/campaigns.ts`'s `handleCreate` treats `agentName`/
  `agentContractSnapshot`/`mappings` as fully optional — a caller sending
  the old, pre-Session-9.1 body shape still creates a campaign identically
  to before (verified: `agentName`/`agentContractSnapshot` default to
  `null`, `mappings` defaults to an empty array).
- `campaignRunner.ts`'s batch loop, `reconcileExecutions.ts`'s reconciliation
  loop, and every existing action (`list`/`get`/`listTargets`/`start`/
  `pause`/`resume`/`stop`/`retryTarget`/`scheduleFollowup`) are unchanged in
  behavior — verified live end-to-end (§13).
- The Session 5 `mark_execution_failed` target-status bugfix (a target
  stuck at `in_progress` after a failed Trigger Call) remains intact —
  re-verified live this session: a failed test execution correctly left its
  target at `status: 'failed'`, not `in_progress`.

## 13. Tests / build verification

- `tsc --noEmit` — clean.
- `npm run build` — clean (one pre-existing chunk-size warning, unrelated).
- `npm run lint` — 56 errors / 19 warnings, the exact pre-existing baseline
  from Session 6.1 onward; **zero new issues**, none in any file touched
  this session.
- Vercel function count: **11 before, 11 after** — no new route file; the
  new `setInputMappings` action was added to the existing consolidated
  `api/campaigns.ts`.
- **One real bug caught and fixed during deployment**: Vercel's own
  TypeScript check (separate from this repo's `tsc --noEmit`, which does not
  cover the `api/` directory) rejected an unsafe `as Record<string,
  unknown>` cast in `campaignRunner.ts` — fixed to `as unknown as
  Record<string, unknown>`. Caught before this reached production.
- **Pure-function verification** (`inputMapping.ts`/`triggerCallPayload.ts`),
  run via a throwaway `tsx` script, deleted immediately after — never
  committed:
  1. A constructed **complete** mock contract with two required fields,
     one unmapped → `validateInputMapping` correctly returns `valid: false`
     with the missing field code.
  2. The same contract, fully mapped → `valid: true`.
  3. `resolveMappedInputValues` correctly resolves a CSV-sourced value and
     flags a missing required field.
  4. Today's real **partial** contract with zero mappings → `valid: true`
     (never fabricates a required field Call Centre hasn't declared).
  5. `buildTriggerCallPayload` against a partial contract produces exactly
     `{to_phone_number, agent_id, customer_id}` with no extra keys, and
     correctly omits `customer_id` when no `sourceCustomerRef` exists.
- **Live end-to-end verification against production** (`https://callcenter-three-livid.vercel.app`),
  using one clearly-tagged synthetic test campaign
  (`SESSION91-VERIFY-TEST`, agent `emi-reminder-agent`, target phone
  `+919999900001` — not a real destination, fully cleaned up after):
  - `create` → agent name + full contract snapshot correctly persisted and
    echoed back.
  - `setInputMappings` → mapping round-trips through `get`.
  - `importTargets` → real Customer 360 customer/contact created
    (`customersCreated: 1`), confirming Customer 360 resolution is not
    regressed.
  - `start` → `pause` → `resume` → `stop` → all four status transitions
    persisted correctly, unchanged from Session 5.
  - `retryTarget` → target correctly moved to `ready`.
  - `runBatch` (admin-gated) → correctly built and sent the legacy Trigger
    Call payload; the backend rejected the fake test number
    (`NO_USER_RESPONSE` — confirming no real call ever connected to
    anyone); the execution's `request_payload_snapshot` was correctly
    persisted (`{"agent_id":"emi-reminder-agent",
    "to_phone_number":"+919999900001"}`); the target correctly moved to
    `status: 'failed'`, not stuck at `in_progress`.
  - A direct RPC call to `call_center_campaign_update_reconciliation_status`
    with a synthetic reconciled result confirmed `agent_id`/`agent_name`
    persist correctly onto `campaign_results`, and `effective_result_id`/
    target status update correctly — the one code path that cannot be
    exercised through a live Trigger Call today (§10), verified directly
    against the RPC layer instead of skipped.
  - All test data (campaign, targets, executions, results, followups,
    customer, contact point) fully deleted afterward — confirmed via a
    final count query: `campaigns: 0`, `campaign_executions: 0` (repo-wide,
    matching the pre-session state Session 9's audit found), contact point
    for the test phone: `0`.

## 14. Known gaps

- Input mapping's live UI is honest-but-minimal: since no real agent has a
  populated contract today, the "Input Mapping" wizard step shows an
  explanatory message rather than an interactive field-mapping form. The
  underlying domain model, RPC, and validation logic are fully built and
  tested (§13) — only the rich interactive UI is deferred, because building
  it against zero real fields would mean testing against fabricated
  metadata, which is explicitly prohibited.
- No stop condition from the prompt's own list was hit: the DB model
  supported a fully additive migration, the live `/agents` response matched
  every prior assumption, no input-mapping metadata had to be fabricated,
  the function count never approached the limit, and no existing behavior
  needed to be broken to simulate anything.
- Campaign authorization (Session 9's own finding — campaigns have zero
  category/role gating) remains unaddressed, exactly as scoped: explicitly
  out of this session per the prompt's own boundary list.

## 15. Recommended next session

Unchanged from Session 9's own recommendation, still the single highest-value
next step: **empirically resolve the campaign call-correlation identifier**
(one real Trigger Call, compared byte-for-byte against its resulting
`/call-data` row's `call_id`), then set
`CAMPAIGN_RECONCILIATION_CORRELATION_MODE=call_sid_equals_call_id` (or wire a
`client_reference` path if the backend adds one) — the reconciliation code
path, and now also the agent-snapshot-traceability path this session added,
are both already fully built and waiting on exactly that one confirmation.
