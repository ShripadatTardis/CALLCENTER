import type {
  AnalyticsAhtDistributionDto,
  AnalyticsCallsByAgentDto,
  AnalyticsChartsDto,
  AnalyticsMetricsResponseDto,
  AnalyticsOutcomeDto,
} from '@/types/api/analytics';

export interface AnalyticsMetrics {
  totalCalls: number;
  callsInWindow: number;
  fcrRate: number;
  avgAhtSeconds: number;
  escalationRate: number;
  resolvedCount: number;
  escalatedCount: number;
  avgIntentAccuracy: number;
  liveConcurrentCalls: number;
  peakConcurrency: number;
  avgTurnLatencyMs: number;
  p95TurnLatencyMs: number;
}

export interface AnalyticsSnapshot {
  metrics: AnalyticsMetrics;
  charts: AnalyticsChartsDto | null;
  outcomes: AnalyticsOutcomeDto[];
  callsByAgent: AnalyticsCallsByAgentDto[];
  ahtDistribution: AnalyticsAhtDistributionDto[];
  filters: { window: string | null; direction: string | null; dateFrom: string | null; dateTo: string | null };
}

export function mapAnalyticsMetrics(dto: AnalyticsMetricsResponseDto): AnalyticsMetrics {
  const fields = dto.metrics;
  return {
    totalCalls: fields.total_calls,
    callsInWindow: fields.calls_in_window ?? 0,
    fcrRate: fields.fcr_rate,
    avgAhtSeconds: fields.avg_aht_seconds,
    escalationRate: fields.escalation_rate,
    resolvedCount: fields.resolved_count,
    escalatedCount: fields.escalated_count,
    avgIntentAccuracy: fields.avg_intent_accuracy ?? 0,
    liveConcurrentCalls: fields.live_concurrent_calls ?? 0,
    peakConcurrency: fields.peak_concurrency ?? 0,
    avgTurnLatencyMs: fields.avg_turn_latency_ms ?? 0,
    p95TurnLatencyMs: fields.p95_turn_latency_ms ?? 0,
  };
}

/** Session 7 — the full snapshot, additive alongside mapAnalyticsMetrics (Dashboard keeps using the narrower one). */
export function mapAnalyticsSnapshot(dto: AnalyticsMetricsResponseDto): AnalyticsSnapshot {
  return {
    metrics: mapAnalyticsMetrics(dto),
    charts: dto.charts ?? null,
    outcomes: dto.outcomes ?? [],
    callsByAgent: dto.calls_by_agent ?? [],
    ahtDistribution: dto.aht_distribution ?? [],
    filters: {
      window: dto.filters?.window ?? null,
      direction: dto.filters?.direction ?? null,
      dateFrom: dto.filters?.date_from ?? null,
      dateTo: dto.filters?.date_to ?? null,
    },
  };
}
