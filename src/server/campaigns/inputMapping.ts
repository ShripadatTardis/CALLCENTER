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
 * Session 12.4.1 — a source field (CSV column or Customer 360 field) may
 * back at most one agent input within a campaign; otherwise the runner
 * would have to guess which agent input a real value was "meant" for.
 * The uniqueness key is `${sourceType}:${sourceField}` — deliberately
 * NOT the field's display label, so `csv:phone` and `customer360:phone`
 * never collide with each other despite sharing a label. This is the
 * single source of truth for the rule; both the persistence boundary
 * (api/campaigns.ts's handleSetInputMappings, which rejects a stale/
 * manipulated client payload containing duplicates) and the React UI
 * (CreateCampaign.tsx, which additionally prevents the invalid state by
 * excluding an already-used source from the other dropdowns) call this
 * same function rather than each re-deriving the rule.
 */
export interface MappingSourceUniquenessResult {
  valid: boolean;
  /** e.g. "csv:customerReference" — the exact colliding source key(s), for a concise, unambiguous message. */
  duplicateSourceKeys: string[];
}

export function validateMappingSourceUniqueness(
  mappings: Array<Pick<CampaignAgentInputMapping, 'sourceType' | 'sourceField'>>,
): MappingSourceUniquenessResult {
  const counts = new Map<string, number>();
  for (const m of mappings) {
    if (!m.sourceField) continue;
    const key = `${m.sourceType}:${m.sourceField}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateSourceKeys = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  return { valid: duplicateSourceKeys.length === 0, duplicateSourceKeys };
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
