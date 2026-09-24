import type { AnalyticsMetricsResponseDto } from '@/types/api/analytics';

export interface AnalyticsMetrics {
  totalCalls: number;
  fcrRate: number;
  avgAhtSeconds: number;
  escalationRate: number;
  resolvedCount: number;
  escalatedCount: number;
}

export function mapAnalyticsMetrics(dto: AnalyticsMetricsResponseDto): AnalyticsMetrics {
  const fields = dto.metrics;
  return {
    totalCalls: fields.total_calls,
    fcrRate: fields.fcr_rate,
    avgAhtSeconds: fields.avg_aht_seconds,
    escalationRate: fields.escalation_rate,
    resolvedCount: fields.resolved_count,
    escalatedCount: fields.escalated_count,
  };
}
