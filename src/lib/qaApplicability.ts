import { QA_TIER_1_PARAMETERS, type QaParameterCode } from './qaParameters';

/**
 * Session 16.1 — the structural (never NLP/heuristic) Tier-1
 * applicability rules from docs/MANUAL_QA_MEASUREMENT_CONTRACT.md §3.
 * `role` must already be normalized to 'agent' | 'customer' by the
 * caller (voice speaker labels and chat roles differ; normalization
 * happens once at the transcript-mapping layer, not here).
 */
export interface QaOrderedTurn {
  turnId: string;
  role: 'agent' | 'customer';
}

export interface QaTier1Applicability {
  isFirstAgentTurn: boolean;
  /** True when this agent turn responds to what is still the customer's very first utterance — "follow-up" has no meaning yet. */
  respondingToFirstCustomerTurn: boolean;
}

/** One pass over the ordered turn list; returns Tier-1 applicability per agent turnId. */
export function computeTier1Applicability(turns: QaOrderedTurn[]): Map<string, QaTier1Applicability> {
  const result = new Map<string, QaTier1Applicability>();
  let agentTurnSeen = false;
  let customerTurnsSoFar = 0;
  for (const turn of turns) {
    if (turn.role === 'customer') {
      customerTurnsSoFar += 1;
      continue;
    }
    result.set(turn.turnId, {
      isFirstAgentTurn: !agentTurnSeen,
      respondingToFirstCustomerTurn: customerTurnsSoFar <= 1,
    });
    agentTurnSeen = true;
  }
  return result;
}

export interface QaAutoFinding {
  parameterCode: QaParameterCode;
  value: 'PASS';
}

/**
 * "Good + Next" (brief §10/§12) — the clean findings auto-recorded for
 * one agent turn, per its Tier-1 applicability. Never produces a
 * finding for a parameter whose structural rule doesn't apply to this
 * specific turn (context_continuity_rate on a first agent turn;
 * followup_understanding_rate responding to the first customer
 * utterance) — those are left with NO finding row at all (§2: no row =
 * not assessed, never silently PASS). task_progression_rate has no
 * conditional rule — it's eligible on every agent turn by definition.
 * Tier-2 parameters are never included here; they require the reviewer
 * to explicitly engage via the exception editor.
 */
export function goodNextAutoFindings(applicability: QaTier1Applicability): QaAutoFinding[] {
  const findings: QaAutoFinding[] = [];
  for (const code of QA_TIER_1_PARAMETERS) {
    if (code === 'context_continuity_rate' && applicability.isFirstAgentTurn) continue;
    if (code === 'followup_understanding_rate' && applicability.respondingToFirstCustomerTurn) continue;
    findings.push({ parameterCode: code, value: 'PASS' });
  }
  return findings;
}
