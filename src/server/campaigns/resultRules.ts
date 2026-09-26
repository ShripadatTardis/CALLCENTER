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
  };

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
      structuredOutputs: null,
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
    structuredOutputs: null,
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
