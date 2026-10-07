// src/lib/callMetricsCorrelation.ts
function buildCallMetricsByInteractionId(rows) {
  return new Map(rows.map((r) => [r.callSid, r]));
}
function filterCallMetricsRowsByAuthorizedAgents(rows, agentIdByCallId, authorizedAgentIds) {
  const authorized = new Set(authorizedAgentIds);
  return rows.filter((row) => {
    const agentId = agentIdByCallId.get(row.call_sid);
    return agentId !== null && agentId !== void 0 && authorized.has(agentId);
  });
}
export {
  buildCallMetricsByInteractionId,
  filterCallMetricsRowsByAuthorizedAgents
};
