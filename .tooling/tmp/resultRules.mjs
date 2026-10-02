// src/server/campaigns/resultRules.ts
function deriveCampaignResult(callData, rules) {
  const fieldValue = {
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
    actual_outcome_code: callData.actual_outcome_code
  };
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
      resultCode: "unclassified",
      resultLabel: "Unclassified",
      isSuccess: null,
      resultDetail: null,
      resultSource: "rule_match",
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
      // Session 12.6 fields — this pure function has no campaign outcome-
      // policy context, so it never derives a classification itself. The
      // real caller (reconcileExecutions.ts) always spreads its own
      // deriveCampaignClassification() result over this return value, so
      // these defaults are only ever a fallback, matching the same
      // "no policy captured" null/false/null deriveCampaignClassification
      // itself returns.
      campaignClassificationCode: null,
      classificationContractDrift: false,
      classificationNextActionType: null
    };
  }
  const nextAction = match.nextActionType && match.nextActionDelayDays != null ? `${match.nextActionType} in ${match.nextActionDelayDays}d` : match.nextActionType ?? null;
  return {
    callStatus: callData.status ?? null,
    callOutcome: callData.outcome ?? null,
    intent: callData.intent ?? null,
    resultCode: match.resultCode,
    resultLabel: match.resultLabel,
    isSuccess: match.isSuccess,
    resultDetail: null,
    resultSource: "rule_match",
    nextAction,
    nextActionType: match.nextActionType,
    agentId: null,
    agentName: null,
    structuredOutputs,
    actualOutcomeCode,
    actualOutcomeName,
    // See the no-match branch above for why these default to the
    // "no classification derived here" state.
    campaignClassificationCode: null,
    classificationContractDrift: false,
    classificationNextActionType: null
  };
}
function defaultResultRules() {
  return [
    {
      priority: 10,
      matchField: "escalation_trigger",
      matchValue: "escalated",
      resultCode: "needs_review",
      resultLabel: "Needs manual review",
      isSuccess: false,
      nextActionType: "escalate",
      nextActionDelayDays: null,
      active: true
    },
    {
      priority: 20,
      matchField: "outcome",
      matchValue: "resolved",
      resultCode: "resolved",
      resultLabel: "Resolved",
      isSuccess: true,
      nextActionType: "close",
      nextActionDelayDays: null,
      active: true
    }
  ];
}
export {
  defaultResultRules,
  deriveCampaignResult
};
