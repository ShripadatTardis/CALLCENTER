import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useVoiceAnalytics } from '@/hooks/analytics/useVoiceAnalytics';
import { MetricSourceCaption } from './MetricSourceCaption';
import { AnalyticsExportButton } from './AnalyticsExportButton';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

function Tile({ label, value, source, origin }: { label: string; value: string; source: string; origin: 'server-aggregate' | 'page-scoped' | 'unavailable' }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <MetricSourceCaption origin={origin} source={source} />
      </CardContent>
    </Card>
  );
}

/**
 * Session 7 §3/§4 — concise headline KPIs, not all 12 permanent tiles.
 * `calls_in_window` (all calls started in window, any outcome) and
 * `total_calls` (completed only) are kept exactly as documented — never
 * swapped or blurred. See VoiceAnalyticsTab for the full breakdown.
 */
export const AnalyticsOverviewTab: React.FC<{ query: AnalyticsMetricsQueryDto }> = ({ query }) => {
  const { isAllAccess, isLoading, global, scoped } = useVoiceAnalytics(query);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-8 mx-auto" />;

  if (isAllAccess && global) {
    const exportRows = [
      { metric: 'Calls in Window', value: global.metrics.callsInWindow },
      { metric: 'Completed Calls', value: global.metrics.totalCalls },
      { metric: 'FCR Rate (%)', value: global.metrics.fcrRate },
      { metric: 'Avg AHT (s)', value: global.metrics.avgAhtSeconds },
      { metric: 'Escalation Rate (%)', value: global.metrics.escalationRate },
      { metric: 'Resolved', value: global.metrics.resolvedCount },
      { metric: 'Escalated', value: global.metrics.escalatedCount },
      { metric: 'Avg Intent Accuracy (%)', value: global.metrics.avgIntentAccuracy },
      { metric: 'Avg Turn Latency (ms)', value: global.metrics.avgTurnLatencyMs },
      { metric: 'P95 Turn Latency (ms)', value: global.metrics.p95TurnLatencyMs },
      { metric: 'Live Concurrency', value: global.metrics.liveConcurrentCalls },
      { metric: 'Peak Concurrency', value: global.metrics.peakConcurrency },
    ];

    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <AnalyticsExportButton rows={exportRows} headers={['metric', 'value']} filename="analytics-overview.csv" label="Export Overview CSV" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Calls in Window" value={String(global.metrics.callsInWindow)} source="metrics.calls_in_window — all calls started in window" origin="server-aggregate" />
          <Tile label="Completed Calls" value={String(global.metrics.totalCalls)} source="metrics.total_calls — completed only" origin="server-aggregate" />
          <Tile label="FCR" value={`${global.metrics.fcrRate.toFixed(1)}%`} source="metrics.fcr_rate" origin="server-aggregate" />
          <Tile label="Avg AHT" value={`${Math.round(global.metrics.avgAhtSeconds)}s`} source="metrics.avg_aht_seconds" origin="server-aggregate" />
          <Tile label="Escalation Rate" value={`${global.metrics.escalationRate.toFixed(1)}%`} source="metrics.escalation_rate" origin="server-aggregate" />
          <Tile label="Avg Intent Accuracy" value={`${global.metrics.avgIntentAccuracy.toFixed(1)}%`} source="metrics.avg_intent_accuracy" origin="server-aggregate" />
          <Tile label="Live Concurrency" value={String(global.metrics.liveConcurrentCalls)} source="metrics.live_concurrent_calls — not window-scoped" origin="server-aggregate" />
          <Tile label="Peak Concurrency" value={String(global.metrics.peakConcurrency)} source="metrics.peak_concurrency" origin="server-aggregate" />
        </div>
        <p className="text-xs text-muted-foreground">See the Voice, Chat, Campaigns and Customers tabs for full breakdowns and charts.</p>
      </div>
    );
  }

  if (!scoped) return <p className="text-sm text-muted-foreground py-8 text-center">No data available.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Your role is scoped to specific categories, so the global backend overview is not shown (it would include
        interactions outside your authorized categories). Figures below are derived from your authorized sample of{' '}
        {scoped.sampleSize} recent call(s).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Resolved (sample)" value={String(scoped.resolvedCount)} source="authorized call-data sample" origin="page-scoped" />
        <Tile label="Escalated (sample)" value={String(scoped.escalatedCount)} source="authorized call-data sample" origin="page-scoped" />
        <Tile label="FCR (sample)" value={scoped.fcrRate === null ? '—' : `${(scoped.fcrRate * 100).toFixed(1)}%`} source="authorized call-data sample" origin="page-scoped" />
        <Tile label="Avg AHT (sample)" value={scoped.avgAhtSeconds === null ? '—' : `${Math.round(scoped.avgAhtSeconds)}s`} source="authorized call-data sample" origin="page-scoped" />
      </div>
      <p className="text-xs text-muted-foreground">See the Voice, Chat, Campaigns and Customers tabs for more.</p>
    </div>
  );
};
