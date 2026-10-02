// src/server/campaigns/outcomePolicy.ts
function deriveCampaignClassification(actualOutcomeCode, policy, unresolvedFallbackCode) {
  if (!actualOutcomeCode) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  if (!policy) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  const mapping = policy.mappings.find((m) => m.agentOutcomeCode === actualOutcomeCode);
  if (mapping) {
    return {
      campaignClassificationCode: mapping.campaignClassificationCode,
      classificationContractDrift: false,
      classificationNextActionType: mapping.nextActionType
    };
  }
  return {
    campaignClassificationCode: unresolvedFallbackCode,
    classificationContractDrift: true,
    classificationNextActionType: null
  };
}
export {
  deriveCampaignClassification
};
