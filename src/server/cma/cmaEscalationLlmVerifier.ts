// Session 7 Part E — targeted LLM integration for the escalation_reason
// reference evaluator, reusing the EXISTING genericLlmClient.ts
// (callGenericLlm) — no new LLM provider, no new integration framework.
//
// Asks ONE specific, structured question per interaction, never a
// generic "analyse this conversation" prompt, and never asks the model
// to calculate a business percentage (brief: "the LLM must not invent
// facts or directly calculate business percentages"). Evidence
// citations are returned as transcript turn indices; validating them
// against the real transcript is already `evaluateEscalationReasonEvidence`'s
// job (cmaEscalationEvidence.ts) — this module only asks the question
// and returns the honest, unvalidated model output.
//
// Live execution is opt-in: `enabled: false` (the default a caller
// should use unless explicitly configuring this for a controlled POC
// run) short-circuits to `null` before any network call — "no
// requirement to invoke an LLM" and "make live LLM execution opt-in"
// both apply here.

import { callGenericLlm, isRetryableLlmError } from '../qa/genericLlmClient.js';
import type { EscalationReasonVerificationResult } from './cmaEscalationEvidence.js';
import type { CmaTranscriptEvidenceTurn } from './cmaTranscriptEvidenceCache.js';
import type { CmaEscalationLlmAsker } from './cmaEvidenceOrchestrator.js';

export const CMA_ESCALATION_REASON_PROMPT_VERSION = 'cma-escalation-reason-v1';

/** Mirrors cmaEscalationEvidence.ts's own KNOWN_REASON_CATEGORIES (not exported from that deployed Session 6 file — duplicated here as a short, stable literal list rather than editing that file's exports for this). Keep in sync if that list ever changes. */
const REASON_CATEGORIES = [
  'customer_requested_human',
  'agent_unable_to_resolve',
  'policy_required_escalation',
  'technical_failure',
  'unresolved',
];

export interface CmaEscalationLlmAskerOptions {
  /** Explicit opt-in gate — false (the safe default) means this asker never calls the real LLM endpoint. */
  enabled: boolean;
  modelId?: string;
  /** Bounded retry count for retryable errors only (rate_limited/llm_unavailable/inference_timeout) — a permanent validation error is never retried. */
  maxRetries?: number;
}

function buildPrompt(outcome: string | null, escalationTrigger: string | null, transcript: CmaTranscriptEvidenceTurn[]) {
  const transcriptText = transcript.map((t, i) => `[${i}] ${t.speaker} (${t.timestamp}): ${t.text}`).join('\n');
  const systemPrompt =
    'You are assisting a Central Measures Authority (CMA) with a single, narrowly-scoped evidence question about one phone call. ' +
    'Answer only the specific question asked, citing exact transcript turn indices as evidence. ' +
    'Never calculate percentages or any business metric — that is not your role; CMA calculates all authoritative measures itself. ' +
    'If you cannot determine the answer from the transcript, say so honestly rather than guessing.';
  const userPrompt = [
    'Existing structured API analysis already recorded for this call:',
    `- outcome: ${outcome ?? '(none recorded)'}`,
    `- escalation_trigger: ${escalationTrigger ?? '(none recorded)'}`,
    '',
    'Question: why was this call escalated (or why does the evidence suggest it should have been)? ' +
      'Classify the reason using ONLY one of the listed categories, based strictly on the transcript turns below.',
    `Allowed categories: ${REASON_CATEGORIES.join(', ')}`,
    '',
    'Transcript turns:',
    transcriptText,
  ].join('\n');
  return { systemPrompt, userPrompt };
}

const ESCALATION_REASON_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reason_category: { type: 'string', enum: REASON_CATEGORIES },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidence_turn_indices: { type: 'array', items: { type: 'integer' } },
  },
  required: ['reason_category', 'confidence', 'evidence_turn_indices'],
};

/**
 * Production wiring: a `CmaEscalationLlmAsker` (cmaEvidenceOrchestrator.ts)
 * that actually calls the Generic Local LLM API, gated by `options.enabled`.
 */
export function makeGenericLlmEscalationAsker(options: CmaEscalationLlmAskerOptions): CmaEscalationLlmAsker {
  return async (interactionId, outcome, escalationTrigger, transcript) => {
    if (!options.enabled) return null;
    if (transcript.length === 0) return null;

    const { systemPrompt, userPrompt } = buildPrompt(outcome, escalationTrigger, transcript);
    const maxAttempts = (options.maxRetries ?? 2) + 1;

    let lastResult: Awaited<ReturnType<typeof callGenericLlm>> | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const requestId = `cma-escalation-reason-${interactionId}-${attempt}-${Date.now()}`;
      // eslint-disable-next-line no-await-in-loop
      const response = await callGenericLlm({
        requestId,
        systemPrompt,
        userPrompt,
        jsonSchema: ESCALATION_REASON_JSON_SCHEMA,
        temperature: 0,
        modelId: options.modelId,
      });
      lastResult = response;
      if (response.success) break;
      if (!isRetryableLlmError(response.errorCode)) break;
    }

    if (!lastResult || !lastResult.success) return null; // network/timeout/invalid-schema failures all surface as "unresolved" upstream, never guessed

    const output = lastResult.output as Record<string, unknown> | null;
    if (
      !output ||
      typeof output.reason_category !== 'string' ||
      typeof output.confidence !== 'number' ||
      !Array.isArray(output.evidence_turn_indices)
    ) {
      return null; // malformed structured output — treated as a verifier failure, never guessed
    }

    const result: EscalationReasonVerificationResult = {
      reasonCategory: output.reason_category,
      confidence: output.confidence,
      evidenceTurnIndices: output.evidence_turn_indices.filter((i): i is number => typeof i === 'number'),
      modelId: lastResult.modelId,
      promptVersion: CMA_ESCALATION_REASON_PROMPT_VERSION,
    };
    return result;
  };
}
