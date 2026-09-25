import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import { useChatAnalytics } from '@/hooks/analytics/useChatAnalytics';
import { MetricSourceCaption } from './MetricSourceCaption';
import { AnalyticsExportButton } from './AnalyticsExportButton';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Session 7 §6/§9 — Chat has no aggregate-metrics or date-window API
 * (confirmed absent), so this tab is honestly page/filter-scoped for
 * every role, never a true time series. Never fabricates Chat FCR,
 * resolution rate, business outcome, or sentiment — none exist.
 */
export const ChatAnalyticsTab: React.FC = () => {
  const { isLoading, metrics } = useChatAnalytics();

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-8 mx-auto" />;
  if (!metrics) return <p className="text-sm text-muted-foreground py-8 text-center">No data available.</p>;

  const exportRows = [
    { metric: 'Sessions Analyzed (page-scoped)', value: `${metrics.sampleSize} of ${metrics.totalMatchingFilter}` },
    { metric: 'Active Sessions', value: metrics.activeCount },
    { metric: 'Completed Sessions', value: metrics.completedCount },
    { metric: 'Avg Confidence (0-1)', value: metrics.avgConfidence ?? '' },
    { metric: 'Avg Latency (ms)', value: metrics.avgLatencyMs ?? '' },
    { metric: 'Authenticated Share', value: metrics.authenticatedShare ?? '' },
    { metric: 'Avg Message Count', value: metrics.avgMessageCount ?? '' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground bg-slate-50 border border-slate-200 rounded px-3 py-2 flex-1">
          Analyzed {metrics.sampleSize} of {metrics.totalMatchingFilter} session(s) matching the current filter — Chat
          has no aggregate-metrics or date-window API, so this is a fetched sample, not a true time-windowed total.
        </p>
        <AnalyticsExportButton rows={exportRows} headers={['metric', 'value']} filename="chat-summary-page-scoped.csv" label="Export Chat Summary CSV" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Active Sessions" value={String(metrics.activeCount)} />
        <Tile label="Completed Sessions" value={String(metrics.completedCount)} />
        <Tile label="Avg Confidence (0–1)" value={metrics.avgConfidence === null ? '—' : metrics.avgConfidence.toFixed(2)} />
        <Tile label="Avg Latency" value={metrics.avgLatencyMs === null ? '—' : `${Math.round(metrics.avgLatencyMs)}ms`} />
        <Tile label="Authenticated Share" value={metrics.authenticatedShare === null ? '—' : `${(metrics.authenticatedShare * 100).toFixed(1)}%`} />
        <Tile label="Avg Message Count" value={metrics.avgMessageCount === null ? '—' : metrics.avgMessageCount.toFixed(1)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Note: voice intent accuracy (0–100 scale, from call-data) and chat confidence (0–1 scale, above) use different
        scales and meanings and are never blended into one figure.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Intent Distribution (sample)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={metrics.intentDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <MetricSourceCaption origin="page-scoped" source={`${metrics.sampleSize} fetched chat/sessions rows`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Sessions by Agent (sample)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {metrics.sessionsByAgent.map((row) => (
                <div key={row.agent} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{row.agent}</span>
                  <span className="text-muted-foreground">{row.count}</span>
                </div>
              ))}
              {metrics.sessionsByAgent.length === 0 && <p className="text-sm text-muted-foreground">No sessions in this sample.</p>}
            </div>
            <MetricSourceCaption origin="page-scoped" source={`${metrics.sampleSize} fetched chat/sessions rows`} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
