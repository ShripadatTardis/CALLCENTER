import type { CallDataEntryDto } from '../../types/api/calls.js';
import type { CampaignResultRule, DerivedCampaignResult } from './types.js';

/**
 * Pure, deterministic result derivation (plan §10) — called ONLY when an
 * execution's reconciliation_status has just transitioned to
 * 'reconciled', against a real reconciled call-data row. No LLM
 * involvement anywhere in this function, per the brief's explicit
 * prohibition.
 *
 * `is_success` is read directly from the matching rule's own
 * configuration (plan §10's explicit amendment) — never inferred from
 * `result_code`/`result_label` text.
 */
export function deriveCampaignResult(callData: CallDataEntryDto, rules: CampaignResultRule[]): DerivedCampaignResult {
  const fieldValue: Record<string, string | null | undefined> = {
    status: callData.status,
    outcome: callData.outcome,
    escalation_trigger: callData.escalation_trigger,
    intent: callData.intent,
    // Session 12.5 §9 — made available as a matchField so an operator
    // CAN configure a campaign_result_rule against the agent-specific
    // actual_outcome_code if they choose to (e.g. treat a specific
    // business outcome as the success signal for that campaign's
    // outcome policy), without this function — or defaultResultRules()
    // below — ever doing so automatically. A campaign with no rule
    // referencing this field behaves byte-for-byte as before.
    actual_outcome_code: callData.actual_outcome_code,
  };

  // Session 12.5 §3/§4 — the agent-specific business result, read
  // straight from the authoritatively matched row, computed once here
  // and attached to BOTH branches below unconditionally. This is
  // deliberately NOT part of the rule-matching above: whether a
  // generic campaign_result_rule matched has no bearing on whether the
  // agent itself reported a business outcome — the two concepts never
  // overwrite or gate one another. A historical row with both fields
  // null produces the same null/null pair a pre-Session-12.5 build
  // would have (via the hardcoded nulls this replaced in
  // reconcileExecutions.ts).
  const actualOutcomeCode = callData.actual_outcome_code ?? null;
  const actualOutcomeName = callData.actual_outcome_name ?? null;
  const structuredOutputs = callData.structured_outputs ?? null;

  const active = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  const match = active.find((rule) => fieldValue[rule.matchField] === rule.matchValue);

  if (!match) {
    return {
      callStatus: callData.status ?? null,
      callOutcome: callData.outcome ?? null,
      intent: callData.intent ?? null,
      resultCode: 'unclassified',
      resultLabel: 'Unclassified',
      isSuccess: null,
      resultDetail: null,
      resultSource: 'rule_match',
      nextAction: null,
      nextActionType: null,
      // Session 9.1 Phase 7 — filled in by the caller (reconcileExecutions.ts)
      // from the campaign's own agent snapshot; this pure function never
      // has campaign context, so it always defaults these to null.
      agentId: null,
      agentName: null,
      structuredOutputs,
      actualOutcomeCode,
      actualOutcomeName,
    };
  }

  const nextAction =
    match.nextActionType && match.nextActionDelayDays != null
      ? `${match.nextActionType} in ${match.nextActionDelayDays}d`
      : match.nextActionType ?? null;

  return {
    callStatus: callData.status ?? null,
    callOutcome: callData.outcome ?? null,
    intent: callData.intent ?? null,
    resultCode: match.resultCode,
    resultLabel: match.resultLabel,
    isSuccess: match.isSuccess,
    resultDetail: null,
    resultSource: 'rule_match',
    nextAction,
    nextActionType: match.nextActionType,
    agentId: null,
    agentName: null,
    structuredOutputs,
    actualOutcomeCode,
    actualOutcomeName,
  };
}

/**
 * Conservative default rules seeded per campaign (plan §10/§13) — based
 * only on real, confirmed call-data values (plan §3). Never a "safe
 * default" guessing at business-specific outcomes like promise-to-pay.
 */
export function defaultResultRules(): Array<Omit<CampaignResultRule, 'id' | 'campaignId'>> {
  return [
    {
      priority: 10,
      matchField: 'escalation_trigger',
      matchValue: 'escalated',
      resultCode: 'needs_review',
      resultLabel: 'Needs manual review',
      isSuccess: false,
      nextActionType: 'escalate',
      nextActionDelayDays: null,
      active: true,
    },
    {
      priority: 20,
      matchField: 'outcome',
      matchValue: 'resolved',
      resultCode: 'resolved',
      resultLabel: 'Resolved',
      isSuccess: true,
      nextActionType: 'close',
      nextActionDelayDays: null,
      active: true,
    },
  ];
}
