import type { TriggerCallRequestDto } from '../../types/api/calls.js';
import type { CallAgentContract, CampaignAgentInputMapping, RunnableTarget } from './types.js';
import { resolveMappedInputValues } from './inputMapping.js';

/**
 * Session 9.1 Phase 5 — the single deterministic server-side function
 * that builds the Trigger Call request for one campaign execution. This
 * is the one place a future, richer Partner API contract (an
 * `agent_inputs` field carrying the agent's declared input values) would
 * be wired in — the campaign runner itself never builds this payload
 * inline, so that future upgrade stays localized here.
 *
 * Today's production `TriggerCallRequestDto` (src/types/api/calls.ts,
 * confirmed against the vendor's docs) only accepts
 * to_phone_number/from_phone_number/english_accent/voice_name/agent_id/
 * customer_id — there is no `agent_inputs` field on the live API. This
 * function therefore builds and returns exactly that legacy shape today,
 * and NEVER sends an unknown field the live backend doesn't support.
 * `resolvedInputValues` is still computed and returned alongside the
 * request (for the request_payload_snapshot audit trail, Phase 3/7) even
 * though it isn't sent — so nothing about mapping resolution is lost,
 * and the day a real `agent_inputs` field is confirmed, only the
 * `request` object's shape below needs to change.
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
  const { values, unresolvedRequiredFieldCodes } = resolveMappedInputValues(mappings, {
    customer360Fields: { phone_number: target.contactRawValue, customer_id: target.sourceCustomerRef ?? undefined },
    csvFields: target.sourceAttributes ?? {},
    campaignFields: {},
  });

  const request: TriggerCallRequestDto = {
    to_phone_number: target.contactRawValue,
    agent_id: target.campaignAgentId,
    // Never fabricated — only populated when Customer 360 already has a
    // sourceCustomerRef for this customer (unchanged from the original
    // Session 5 behavior).
    customer_id: target.sourceCustomerRef ?? undefined,
  };

  // contract is currently unused for the live request shape (legacy API
  // has nothing to accept beyond the fields above) — kept as a parameter
  // so a future contractCompleteness === 'complete' branch can extend
  // `request` with a real agent_inputs field without touching call sites.
  void contract;

  return { request, resolvedInputValues: values, unresolvedRequiredFieldCodes };
}
