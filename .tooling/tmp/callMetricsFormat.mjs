// src/lib/callMetricsFormat.ts
function mapCallMetricsRow(dto) {
  return {
    callSid: dto.call_sid,
    startTime: dto.start_time,
    recordedAt: dto.recorded_at,
    agentDisplayName: dto.agent,
    direction: dto.direction,
    durationSeconds: dto.duration_seconds,
    concurrentUsers: dto.concurrent_users,
    sttMs: dto.stt_ms,
    llmTtftMs: dto.llm_ttft_ms,
    llmMs: dto.llm_ms,
    ttsTtfbMs: dto.tts_ttfb_ms,
    turnMs: dto.turn_ms,
    toolMs: dto.tool_ms,
    ragMs: dto.rag_ms,
    orchestratorMs: dto.orchestrator_ms,
    turns: dto.turns
  };
}
function formatCallMetricMs(value, opts = { recordedAt: null }) {
  if (value !== null) {
    return opts.decimals ? `${value.toFixed(opts.decimals)} ms` : `${Math.round(value)} ms`;
  }
  if (opts.notUsedWhenNull) return "Not used";
  if (opts.recordedAt === null) return "Not available yet";
  return "Not available";
}
function formatConcurrentUsers(value) {
  return String(value);
}
function formatTurns(value) {
  return value === null ? "\u2014" : String(value);
}
export {
  formatCallMetricMs,
  formatConcurrentUsers,
  formatTurns,
  mapCallMetricsRow
};
