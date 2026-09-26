import type {
  CallAgentContract,
  CampaignAgentInputMapping,
  InputMappingValidationResult,
} from './types.js';

/**
 * Session 9.1 Phase 4 — pure, deterministic (no LLM, no fuzzy matching)
 * validation of a campaign's input mapping against its selected agent's
 * contract. When the contract's `expectedInputFields` is empty (true for
 * every real agent today, since /agents is roster-only —
 * contractCompleteness: 'partial'), this trivially returns valid with no
 * missing fields — it never invents a required field that Call Centre
 * hasn't actually declared.
 */
export function validateInputMapping(
  contract: CallAgentContract,
  mappings: CampaignAgentInputMapping[],
): InputMappingValidationResult {
  const mappedCodes = new Set(mappings.map((m) => m.agentInputFieldCode));
  const missingRequiredFieldCodes = contract.expectedInputFields
    .filter((f) => f.required && !mappedCodes.has(f.fieldCode))
    .map((f) => f.fieldCode);
  return { valid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}

/**
 * Deterministically resolves one target's mapped input values from the
 * three supported source classes (Phase 4) — never an LLM, never a
 * generic external-CRM lookup. Returns only the fields that could
 * actually be resolved; a caller combines this with
 * validateInputMapping's result to decide whether it's safe to trigger.
 */
export function resolveMappedInputValues(
  mappings: CampaignAgentInputMapping[],
  sources: {
    customer360Fields: Record<string, unknown>;
    csvFields: Record<string, unknown>;
    campaignFields: Record<string, unknown>;
  },
): { values: Record<string, unknown>; unresolvedRequiredFieldCodes: string[] } {
  const values: Record<string, unknown> = {};
  const unresolvedRequiredFieldCodes: string[] = [];

  for (const mapping of mappings) {
    const sourceBag =
      mapping.sourceType === 'customer360'
        ? sources.customer360Fields
        : mapping.sourceType === 'csv'
          ? sources.csvFields
          : sources.campaignFields;
    const value = sourceBag[mapping.sourceField];
    if (value === undefined || value === null || value === '') {
      if (mapping.required) unresolvedRequiredFieldCodes.push(mapping.agentInputFieldCode);
      continue;
    }
    values[mapping.agentInputFieldCode] = value;
  }

  return { values, unresolvedRequiredFieldCodes };
}
