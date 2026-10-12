import { QA_PARAMETER_CODES } from './qaParameters.js';

/**
 * Session 16.3 — the VoiceForce-owned structured-output JSON Schema
 * (brief §9: "a proposed VoiceForce-owned schema, not an API-defined
 * schema"). Deliberately loose on `value`/`reason_code` (a flat string,
 * not a per-parameter enum) — the Generic Local LLM API's supported
 * keyword list (type/properties/required/enum/anyOf/oneOf/$ref/...) has
 * no if/then/else, so expressing "value must be one of THIS parameter's
 * specific allowed values" cleanly per-row isn't possible without an
 * unwieldy 9-way anyOf a 7B model is unlikely to honor reliably. Instead
 * the schema enforces structure and the exhaustive ACROSS-ALL-PARAMETERS
 * value vocabulary, and src/lib/automatedQaValidation.ts enforces the
 * per-parameter subset afterward — same "validate, don't trust" posture
 * brief §10 requires regardless of how tight the schema is.
 *
 * parameter_code uses the EXACT existing QaParameterCode strings
 * (e.g. "context_continuity_rate"), not the brief's illustrative
 * uppercase names (§8's "CONTEXT_CONTINUITY" etc.) — per §8's own
 * instruction ("use exact canonical codes from the existing codebase"),
 * the authoritative source is src/lib/qaParameters.ts, so introducing a
 * second casing/naming scheme would itself be the synonym the brief
 * forbids.
 */

const ALL_RESULT_VALUES = [
  'PASS', 'FAIL', 'NO_ISSUE', 'ISSUE', 'GROUNDED', 'NOT_GROUNDED',
  'CANNOT_VERIFY', 'SUCCESSFUL', 'UNSUCCESSFUL', 'N_A',
] as const;

export function buildAutomatedQaJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['interaction_assessment', 'observations', 'unassessable_parameters'],
    properties: {
      interaction_assessment: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'evaluation_completeness'],
        properties: {
          summary: { type: 'string', maxLength: 400, description: 'One or two sentences on what the customer wanted and what happened.' },
          evaluation_completeness: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] },
        },
      },
      observations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['parameter_code', 'primary_turn_id', 'value'],
          properties: {
            parameter_code: { type: 'string', enum: [...QA_PARAMETER_CODES] },
            primary_turn_id: { type: 'string', description: 'Must be one of the turn ids given in the conversation.' },
            value: { type: 'string', enum: [...ALL_RESULT_VALUES] },
            reason_code: { type: 'string', description: 'Required when value is a problem value. Must be one of this parameter\'s own reason codes.' },
            evidence_turn_ids: { type: 'array', items: { type: 'string' } },
            explanation: { type: 'string', maxLength: 300 },
          },
        },
      },
      unassessable_parameters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['parameter_code', 'reason'],
          properties: {
            parameter_code: { type: 'string', enum: [...QA_PARAMETER_CODES] },
            reason: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
  };
}
