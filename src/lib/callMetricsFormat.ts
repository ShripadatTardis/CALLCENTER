import type { CallMetricsRowDto } from '@/types/api/callMetrics';

/**
 * Shared Call Metrics domain model + formatting — Session 15.4. One
 * place every consumer (Call Detail, Agent Detail, QA Review, Analytics,
 * Ratio Explorer) reads the per-call technical-performance fields from,
 * so the null/"not applicable" semantics documented in Call_Metrics_API.docx
 * are interpreted identically everywhere rather than re-derived per
 * screen.
 */
export interface CallTechnicalPerformance {
  callSid: string;
  startTime: string;
  recordedAt: string | null;
  /** Display string only — never a stable agent id. Never used for authorization or identity; join through call-data's agent_id instead (see callMetricsCorrelation.ts). */
  agentDisplayName: string;
  direction: 'inbound' | 'outbound';
  durationSeconds: number | null;
  concurrentUsers: number;
  sttMs: number | null;
  llmTtftMs: number | null;
  llmMs: number | null;
  ttsTtfbMs: number | null;
  /** The primary caller-perceived latency measure — customer stops speaking to first bot audio. */
  turnMs: number | null;
  /** Null means no tool call occurred on this call, never 0ms. */
  toolMs: number | null;
  /** Null means no knowledge-base lookup occurred on this call, never 0ms. */
  ragMs: number | null;
  orchestratorMs: number | null;
  turns: number | null;
}

export function mapCallMetricsRow(dto: CallMetricsRowDto): CallTechnicalPerformance {
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
    turns: dto.turns,
  };
}

/**
 * A stage latency field is null either because the call hasn't finished
 * (recordedAt === null — "not available yet", per the doc's "written
 * when the call ends" note) or, for a completed call, because it was
 * never answered / had no turns to average (an honest "not available",
 * not a fabricated 0). tool_ms/rag_ms get their OWN distinct "not used"
 * reason regardless of completion state — the doc is explicit these are
 * null specifically because no tool call / no KB lookup occurred, a
 * genuinely different fact from "we don't have the number yet".
 */
export function formatCallMetricMs(
  value: number | null,
  opts: { recordedAt: string | null; notUsedWhenNull?: boolean; decimals?: number } = { recordedAt: null },
): string {
  if (value !== null) {
    return opts.decimals ? `${value.toFixed(opts.decimals)} ms` : `${Math.round(value)} ms`;
  }
  if (opts.notUsedWhenNull) return 'Not used';
  if (opts.recordedAt === null) return 'Not available yet';
  return 'Not available';
}

export function formatConcurrentUsers(value: number): string {
  return String(value);
}

export function formatTurns(value: number | null): string {
  return value === null ? '—' : String(value);
}
