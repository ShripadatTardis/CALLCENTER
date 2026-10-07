import { QA_PARAMETER_CODES, QA_PARAMETERS, type QaParameterCode, type QaResultValue } from './qaParameters';

/**
 * Session 16.1 — pure, deterministic Human QA ratio calculation, exactly
 * matching the numerator/denominator/exclusions documented per-parameter
 * in docs/MANUAL_QA_MEASUREMENT_CONTRACT.md §4. Operates over an
 * already-fetched set of Findings (one row per qa_findings record) —
 * no DB access here, so this is directly unit-testable and reusable
 * both for a future ratio display and for verification tests.
 */
export interface QaFindingLike {
  reviewId: string;
  parameterCode: QaParameterCode;
  value: QaResultValue;
}

export interface QaRatioResult {
  parameterCode: QaParameterCode;
  /** The "higher is better" numerator even for lower_better parameters, where it counts the PROBLEM direction per the contract's own phrasing (e.g. "confirmed unnecessary clarification events / eligible opportunities"). */
  numerator: number;
  denominator: number;
  /** null when denominator is 0 — never fabricated as 0% or 100%. */
  rate: number | null;
}

/** response_grounding_rate is the one parameter whose denominator additionally excludes CANNOT_VERIFY (documented explicitly — never silently folded into a generic "all non-N_A" rule). */
const GROUNDING_DENOMINATOR_VALUES: QaResultValue[] = ['GROUNDED', 'NOT_GROUNDED'];

function computeOneRatio(code: QaParameterCode, findings: QaFindingLike[]): QaRatioResult {
  const def = QA_PARAMETERS[code];
  const relevant = findings.filter((f) => f.parameterCode === code);

  if (code === 'response_grounding_rate') {
    const eligible = relevant.filter((f) => GROUNDING_DENOMINATOR_VALUES.includes(f.value));
    const numerator = eligible.filter((f) => f.value === 'GROUNDED').length;
    const denominator = eligible.length;
    return { parameterCode: code, numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
  }

  if (def.appliesTo === 'interaction' || code === 'customer_correction_rate') {
    // Interaction-level rollup (repetition_loop_rate always; customer_correction_rate
    // because a correction is assessed per customer turn but the documented ratio
    // is "reviewed interactions containing a confirmed correction / eligible
    // reviewed interactions" — a review counts once, however many correction
    // turns it contains).
    const byReview = new Map<string, QaResultValue[]>();
    for (const f of relevant) {
      if (f.value === 'N_A') continue;
      const list = byReview.get(f.reviewId) ?? [];
      list.push(f.value);
      byReview.set(f.reviewId, list);
    }
    const denominator = byReview.size;
    let numerator = 0;
    for (const values of byReview.values()) {
      if (values.some((v) => def.problemValues.includes(v))) numerator += 1;
    }
    return { parameterCode: code, numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
  }

  // Standard turn-level parameter: denominator excludes N_A; numerator is
  // the clean value for higher_better, the problem value for lower_better
  // (matching each parameter's own documented numerator in the contract).
  const eligible = relevant.filter((f) => f.value !== 'N_A');
  const numerator =
    def.directionality === 'higher_better'
      ? eligible.filter((f) => f.value === def.cleanValue).length
      : eligible.filter((f) => def.problemValues.includes(f.value)).length;
  return { parameterCode: code, numerator, denominator: eligible.length, rate: eligible.length === 0 ? null : numerator / eligible.length };
}

export function computeQaRatios(findings: QaFindingLike[]): Record<QaParameterCode, QaRatioResult> {
  const result = {} as Record<QaParameterCode, QaRatioResult>;
  for (const code of QA_PARAMETER_CODES) {
    result[code] = computeOneRatio(code, findings);
  }
  return result;
}
