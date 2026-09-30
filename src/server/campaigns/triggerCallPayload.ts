import type { TriggerCallRequestDto } from '../../types/api/calls.js';
import type { CallAgentContract, CampaignAgentInputMapping, RunnableTarget } from './types.js';
import { resolveMappedInputValues, validateInputMapping } from './inputMapping.js';

/**
 * Session 9.1 Phase 5, rewritten Session 12.4 — the single deterministic
 * server-side function that builds the Trigger Call request for one
 * campaign execution. This was already the one place a future, richer
 * Partner API contract (an `agent_inputs` field carrying the agent's
 * declared input values) would be wired in — confirmed live, now wired.
 *
 * `agent_inputs` is built ONLY from values whose `agentInputFieldCode`
 * matches a field the contract actually declares (`contract.expectedInputFields`)
 * — never an arbitrary resolved value, since the backend now explicitly
 * rejects an undeclared input field. The object is omitted entirely
 * (not sent as `{}`) when the contract declares zero expected input
 * fields (e.g. the inbound default agent) or when no contract is known
 * — this is what "preserves legacy/default-agent behavior" means in
 * practice: such a target's request is byte-for-byte the same shape it
 * always was.
 */
export interface BuiltTriggerCallPayload {
  request: TriggerCallRequestDto;
  resolvedInputValues: Record<string, unknown>;
  unresolvedRequiredFieldCodes: string[];
}

export function buildTriggerCallPayload(
  target: RunnableTarget,
  contract: CallAgentContract | null,
  mappings: CampaignAgentInputMapping[],
): BuiltTriggerCallPayload {
  const { values, unresolvedRequiredFieldCodes: unresolvedMapped } = resolveMappedInputValues(mappings, {
    customer360Fields: { phone_number: target.contactRawValue, customer_id: target.sourceCustomerRef ?? undefined },
    csvFields: target.sourceAttributes ?? {},
    campaignFields: {},
  });

  // Session 12.4 fix — resolveMappedInputValues only ever catches "a
  // mapping exists but its source value is blank"; a contract-required
  // field with NO mapping row at all was previously invisible to the
  // caller entirely. validateInputMapping (already existed, previously
  // unused by the runner) is the one place that checks "every
  // contract-required field has SOME mapping" — combined here so a
  // target can never be dialled missing a required value for either
  // reason.
  const missingMapping = contract ? validateInputMapping(contract, mappings).missingRequiredFieldCodes : [];
  const unresolvedRequiredFieldCodes = Array.from(new Set([...missingMapping, ...unresolvedMapped]));

  const request: TriggerCallRequestDto = {
    to_phone_number: target.contactRawValue,
    agent_id: target.campaignAgentId,
    // Never fabricated — only populated when Customer 360 already has a
    // sourceCustomerRef for this customer (unchanged from the original
    // Session 5 behavior).
    customer_id: target.sourceCustomerRef ?? undefined,
  };

  const declaredFieldCodes = new Set((contract?.expectedInputFields ?? []).map((f) => f.fieldCode));
  if (declaredFieldCodes.size > 0) {
    const agentInputs: Record<string, unknown> = {};
    let hasAny = false;
    for (const [code, value] of Object.entries(values)) {
      if (!declaredFieldCodes.has(code)) continue; // never send an undeclared field — the backend rejects it
      agentInputs[code] = value;
      hasAny = true;
    }
    if (hasAny) request.agent_inputs = agentInputs;
  }

  return { request, resolvedInputValues: values, unresolvedRequiredFieldCodes };
}
