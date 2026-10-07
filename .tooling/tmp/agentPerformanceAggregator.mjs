// src/lib/format.ts
var STALE_DURATION_SECONDS = 4 * 60 * 60;
function isStaleDuration(seconds) {
  return seconds !== void 0 && seconds >= STALE_DURATION_SECONDS;
}

// src/services/agents/agentPerformanceAggregator.ts
function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
function groupInteractionsByAgent(interactions) {
  const map = /* @__PURE__ */ new Map();
  for (const interaction of interactions) {
    if (!interaction.agentId) continue;
    const list = map.get(interaction.agentId);
    if (list) list.push(interaction);
    else map.set(interaction.agentId, [interaction]);
  }
  return map;
}
function groupChatSessionsByAgent(sessions) {
  const map = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    if (!session.agentId) continue;
    const list = map.get(session.agentId);
    if (list) list.push(session);
    else map.set(session.agentId, [session]);
  }
  return map;
}
function computeAgentCallMetrics(interactions) {
  const fcrKnown = interactions.filter((i) => i.fcr !== void 0 && i.fcr !== null);
  const knownDurations = interactions.map((i) => i.durationSeconds).filter((v) => v != null);
  const nonStaleDurations = knownDurations.filter((v) => !isStaleDuration(v));
  return {
    callsHandled: interactions.length,
    resolvedCount: interactions.filter((i) => i.outcome === "resolved").length,
    escalatedCount: interactions.filter((i) => i.outcome === "escalated" || Boolean(i.escalation?.trigger)).length,
    fcrRate: fcrKnown.length === 0 ? null : fcrKnown.filter((i) => i.fcr).length / fcrKnown.length,
    avgAhtSeconds: average(nonStaleDurations),
    staleAhtExcludedCount: knownDurations.length - nonStaleDurations.length,
    avgIntentAccuracy: average(interactions.map((i) => i.intentAccuracy).filter((v) => v != null)),
    avgSentimentScore: average(interactions.map((i) => i.sentimentScore).filter((v) => v != null)),
    authenticatedCount: interactions.filter((i) => i.wasAuthenticated === true).length
  };
}
function computeAgentCallTechnicalPerformance(interactions, metricsByInteractionId) {
  const matched = interactions.map((i) => metricsByInteractionId.get(i.interactionId)).filter((m) => m !== void 0);
  const field = (pick) => average(matched.map(pick).filter((v) => v !== null));
  return {
    matchedCallCount: matched.length,
    avgTurnMs: field((m) => m.turnMs),
    avgSttMs: field((m) => m.sttMs),
    avgLlmTtftMs: field((m) => m.llmTtftMs),
    avgLlmMs: field((m) => m.llmMs),
    avgTtsTtfbMs: field((m) => m.ttsTtfbMs),
    avgOrchestratorMs: field((m) => m.orchestratorMs),
    avgToolMs: field((m) => m.toolMs),
    avgRagMs: field((m) => m.ragMs)
  };
}
function computeAgentChatMetrics(sessions) {
  return {
    chatsHandled: sessions.length,
    avgConfidence: average(sessions.map((s) => s.latestConfidence).filter((v) => v != null)),
    avgLatencyMs: average(sessions.map((s) => s.latestLatencyMs).filter((v) => v != null)),
    authenticatedCount: sessions.filter((s) => s.authenticated).length
  };
}
function countCampaignsByAgent(campaigns) {
  const counts = /* @__PURE__ */ new Map();
  for (const campaign of campaigns) {
    counts.set(campaign.agentId, (counts.get(campaign.agentId) ?? 0) + 1);
  }
  return counts;
}
function computeAgentCampaignOutcomeSummary(campaigns) {
  const totals = campaigns.reduce(
    (acc, c) => ({
      targetCount: acc.targetCount + c.stats.targetCount,
      triggeredCount: acc.triggeredCount + c.stats.triggeredCount,
      classifiedCount: acc.classifiedCount + c.stats.classifiedCount,
      successCount: acc.successCount + c.stats.successCount
    }),
    { targetCount: 0, triggeredCount: 0, classifiedCount: 0, successCount: 0 }
  );
  return {
    campaignCount: campaigns.length,
    ...totals,
    // Target-level success rate, same effective_result_id-based
    // definition Campaigns itself uses (Session 5 final amendment) —
    // never re-derived from raw campaign_results rows here.
    successRate: totals.classifiedCount === 0 ? null : totals.successCount / totals.classifiedCount
  };
}
export {
  computeAgentCallMetrics,
  computeAgentCallTechnicalPerformance,
  computeAgentCampaignOutcomeSummary,
  computeAgentChatMetrics,
  countCampaignsByAgent,
  groupChatSessionsByAgent,
  groupInteractionsByAgent
};
