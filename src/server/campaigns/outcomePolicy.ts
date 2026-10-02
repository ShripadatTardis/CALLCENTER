import type { NextActionType, OutcomePolicySnapshot } from './types.js';

/**
 * Session 12.6 — pure, deterministic Campaign Classification
 * derivation: actual_outcome_code -> the campaign's own captured
 * outcomePolicySnapshot -> a Universal Campaign Classification code.
 *
 * Deliberately the ONLY function in this codebase that turns an agent
 * outcome into a classification — called identically by the normal
 * reconciliation path (reconcileExecutions.ts's reconcilePendingExecutions)
 * and the enrichment path (enrichReconciledExecutionsWithActualOutcome),
 * so the two can never disagree about how a given (actualOutcomeCode,
 * policy) pair classifies.
 *
 * Never reads transcript, summary, generic callOutcome, intent,
 * sentiment, or FCR — only the two inputs named in its signature. Per
 * §7's explicit instruction, this is the sole classification path;
 * nothing else in the Campaign subsystem is permitted to assign a
 * campaignClassificationCode.
 */
export interface DerivedClassification {
  campaignClassificationCode: string | null;
  classificationContractDrift: boolean;
  classificationNextActionType: NextActionType | null;
}

/**
 * `unresolvedFallbackCode` is the one classification code whose row in
 * call_center.campaign_classifications has is_fallback_unresolved =
 * true — the caller looks this up from the live classifications list
 * (never a hardcoded 'UNRESOLVED' string here), per the explicit
 * instruction that Campaign Classification is a system-configured
 * vocabulary, not something business logic hardcodes.
 */
export function deriveCampaignClassification(
  actualOutcomeCode: string | null,
  policy: OutcomePolicySnapshot | null,
  unresolvedFallbackCode: string | null,
): DerivedClassification {
  // §8 — a null actual outcome is NOT automatically UNSUCCESSFUL or
  // UNRESOLVED. "Agent Outcome unavailable" has no classification at
  // all, regardless of whether a policy exists.
  if (!actualOutcomeCode) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }

  // Legacy campaign (no captured policy) — never synthesize one, never
  // classify. The target still has a real actual outcome displayed
  // (Session 12.5), just no campaign-business-policy interpretation of
  // it.
  if (!policy) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }

  const mapping = policy.mappings.find((m) => m.agentOutcomeCode === actualOutcomeCode);
  if (mapping) {
    return {
      campaignClassificationCode: mapping.campaignClassificationCode,
      classificationContractDrift: false,
      classificationNextActionType: mapping.nextActionType,
    };
  }

  // §5/§13 — an actual outcome exists, a policy exists, but this
  // specific code has no captured mapping (contract drift, a newer
  // agent outcome than the policy was configured against, or a stale
  // configuration). Preserve the raw actualOutcomeCode (already stored
  // separately by Session 12.5 — never dropped) and fall back to the
  // system's designated UNRESOLVED code, flagged as drift so the UI
  // can show it honestly rather than presenting it as an ordinary
  // policy-driven UNRESOLVED.
  return {
    campaignClassificationCode: unresolvedFallbackCode,
    classificationContractDrift: true,
    classificationNextActionType: null,
  };
}
