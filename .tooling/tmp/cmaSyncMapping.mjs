// src/server/cma/cmaSyncMapping.ts
function buildCmaSyncPayload(row) {
  return {
    source: row.source,
    interactionId: row.interactionId,
    startedAt: row.startedAt,
    channel: row.channel,
    direction: row.direction,
    agentId: row.agentId,
    agentDisplayName: row.agentDisplayName,
    durationSeconds: row.durationSeconds,
    intent: row.intent,
    outcome: row.outcome,
    sentimentScore: row.sentimentScore,
    wasAuthenticated: row.wasAuthenticated,
    escalationTrigger: row.escalationTrigger,
    campaignName: row.campaignName,
    recordingAvailable: row.recordingAvailable
  };
}
export {
  buildCmaSyncPayload
};
