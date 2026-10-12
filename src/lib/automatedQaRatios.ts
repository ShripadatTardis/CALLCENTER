import { computeQaRatios, type QaFindingLike, type QaRatioResult } from './qaRatios.js';
import type { QaParameterCode, QaResultValue } from './qaParameters.js';

/**
 * Session 16.3 — adapter into the canonical ratio engine (brief §16:
 * "reuse the existing measurement logic wherever possible... where the
 * automated observation model differs from the Human QA persistence
 * model, build a well-defined adapter into the canonical ratio engine").
 * computeQaRatios groups "interaction"-level parameters (repetition_loop_rate,
 * customer_correction_rate) by `reviewId` — an automated evaluation's own
 * `id` plays that exact same structural role (one evaluation = one
 * reviewed interaction, same as one qa_review = one reviewed interaction),
 * so no new ratio math is written here, only a field rename.
 */
export interface AutomatedQaObservationLike {
  evaluationId: string;
  parameterCode: QaParameterCode;
  value: QaResultValue;
}

export function computeAutomatedQaRatios(observations: AutomatedQaObservationLike[]): Record<QaParameterCode, QaRatioResult> {
  const findings: QaFindingLike[] = observations.map((o) => ({
    reviewId: o.evaluationId,
    parameterCode: o.parameterCode,
    value: o.value,
  }));
  return computeQaRatios(findings);
}
