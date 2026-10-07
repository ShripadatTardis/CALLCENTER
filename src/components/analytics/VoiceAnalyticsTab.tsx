import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { useVoiceAnalytics } from '@/hooks/analytics/useVoiceAnalytics';
import { MetricSourceCaption, type MetricOrigin } from './MetricSourceCaption';
import { CategoryAgentComparisonTable } from './CategoryAgentComparisonTable';
import { AnalyticsExportButton } from './AnalyticsExportButton';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';
import { Loader2 } from 'lucide-react';

const OUTCOME_COLORS: Record<string, string> = { Resolved: '#10B981', Escalated: '#EF4444', Other: '#94A3B8' };

function Tile({ label, value, source, origin = 'server-aggregate' }: { label: string; value: string; source: string; origin?: MetricOrigin }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <MetricSourceCaption origin={origin} source={source} />
      </CardContent>
    </Card>
  );
}

export const VoiceAnalyticsTab: React.FC<{ query: AnalyticsMetricsQueryDto }> = ({ query }) => {
  const { isAllAccess, isLoading, global, scoped, classification, agentsById } = useVoiceAnalytics(query);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-8 mx-auto" />;

  if (isAllAccess && global) {
    const nameToId = new Map(Array.from(agentsById.values()).map((a) => [a.displayName, a.agentId]));
    const countByAgentId = new Map(
      global.callsByAgent.map((row) => [nameToId.get(row.agent) ?? row.agent, row.count] as [string, number]),
    );

    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <AnalyticsExportButton
            rows={global.callsByAgent}
            headers={['agent', 'count']}
            filename="voice-calls-by-agent.csv"
            label="Export Calls by Agent CSV"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="FCR" value={`${global.metrics.fcrRate.toFixed(1)}%`} source="metrics.fcr_rate" />
          <Tile label="Avg AHT" value={`${Math.round(global.metrics.avgAhtSeconds)}s`} source="metrics.avg_aht_seconds" />
          <Tile label="Escalation Rate" value={`${global.metrics.escalationRate.toFixed(1)}%`} source="metrics.escalation_rate" />
          <Tile label="Avg Intent Accuracy" value={`${global.metrics.avgIntentAccuracy.toFixed(1)}%`} source="metrics.avg_intent_accuracy" />
          <Tile label="Avg Turn Latency" value={`${Math.round(global.metrics.avgTurnLatencyMs)}ms`} source="metrics.avg_turn_latency_ms" />
          <Tile label="P95 Turn Latency" value={`${Math.round(global.metrics.p95TurnLatencyMs)}ms`} source="metrics.p95_turn_latency_ms" />
          <Tile label="Live Concurrency" value={String(global.metrics.liveConcurrentCalls)} source="metrics.live_concurrent_calls" />
          <Tile label="Peak Concurrency" value={String(global.metrics.peakConcurrency)} source="metrics.peak_concurrency" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Call Volume Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={global.charts?.call_volume ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="t" tick={false} />
                  <YAxis />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Bar dataKey="started" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <MetricSourceCaption origin="server-aggregate" source="charts.call_volume" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Outcome Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={global.outcomes} dataKey="value" nameKey="name" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {global.outcomes.map((o) => (
                      <Cell key={o.name} fill={OUTCOME_COLORS[o.name] ?? '#8884d8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <MetricSourceCaption origin="server-aggregate" source="outcomes" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">AHT Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={global.ahtDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <MetricSourceCaption origin="server-aggregate" source="aht_distribution" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Latency Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={global.charts?.latency_over_time ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="t" tick={false} />
                  <YAxis />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="avg_ms" stroke="#10B981" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <MetricSourceCaption origin="server-aggregate" source="charts.latency_over_time" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Concurrency Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={global.charts?.concurrency ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="t" tick={false} />
                  <YAxis />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="concurrent" stroke="#F59E0B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <MetricSourceCaption origin="server-aggregate" source="charts.concurrency" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Calls by Agent</CardTitle></CardHeader>
            <CardContent>
              <CategoryAgentComparisonTable
                classification={classification}
                countByAgentId={countByAgentId}
                agentsById={agentsById}
                countLabel="calls"
              />
              <MetricSourceCaption origin="server-aggregate" source="calls_by_agent, grouped via Session 6.2 classification" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!scoped) return <p className="text-sm text-muted-foreground py-8 text-center">No data available.</p>;

  const countByAgentId = new Map(scoped.callsByAgent.map((row) => {
    const entry = Array.from(agentsById.values()).find((a) => a.displayName === row.agent);
    return [entry?.agentId ?? row.agent, row.count] as [string, number];
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2 flex-1">
          Your role is scoped to specific categories. The global backend aggregate is not shown here (it would include
          interactions outside your authorized categories). These figures are derived only from your authorized sample
          of {scoped.sampleSize} recent call(s) — not a true global window total.
        </p>
        <AnalyticsExportButton
          rows={scoped.callsByAgent}
          headers={['agent', 'count']}
          filename="voice-calls-by-agent-scoped.csv"
          label="Export (scoped) CSV"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="FCR" value={scoped.fcrRate === null ? '—' : `${(scoped.fcrRate * 100).toFixed(1)}%`} source="derived from authorized call-data sample" origin="page-scoped" />
        <Tile label="Avg AHT" value={scoped.avgAhtSeconds === null ? '—' : `${Math.round(scoped.avgAhtSeconds)}s`} source="derived from authorized call-data sample" origin="page-scoped" />
        <Tile label="Avg Intent Accuracy" value={scoped.avgIntentAccuracy === null ? '—' : `${scoped.avgIntentAccuracy.toFixed(1)}%`} source="derived from authorized call-data sample" origin="page-scoped" />
        <Tile
          label="Avg Turn Latency"
          value={scoped.avgTurnLatencyMs === null ? '—' : `${Math.round(scoped.avgTurnLatencyMs)}ms`}
          source="derived from authorized call-data sample, correlated with Call Metrics"
          origin="page-scoped"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Outcome Distribution (sample)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={scoped.outcomes} dataKey="value" nameKey="name" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                  {scoped.outcomes.map((o) => (
                    <Cell key={o.name} fill={OUTCOME_COLORS[o.name] ?? '#8884d8'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <MetricSourceCaption origin="page-scoped" source={`${scoped.sampleSize} authorized call-data rows`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">AHT Distribution (sample)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoped.ahtDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <MetricSourceCaption origin="page-scoped" source={`${scoped.sampleSize} authorized call-data rows`} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Calls by Agent (sample)</CardTitle></CardHeader>
          <CardContent>
            <CategoryAgentComparisonTable
              classification={classification}
              countByAgentId={countByAgentId}
              agentsById={agentsById}
              countLabel="calls"
            />
            <MetricSourceCaption origin="page-scoped" source={`${scoped.sampleSize} authorized call-data rows, grouped via Session 6.2 classification`} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
