import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/analytics/useAnalyticsMetrics';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { countActiveCallsByAgent } from '@/components/agents/agentActivity';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { MetricStrip } from '@/components/common/MetricStrip';
import {
  formatDurationExact,
  formatDurationLong,
  formatPercent,
  formatPhoneNumber,
  formatStatusLabel,
} from '@/lib/format';

/**
 * Session 3: live data throughout. Metrics tiles are limited to what's
 * genuinely backed — Avg Sentiment and CSAT Score were removed (no
 * backend field exists anywhere for either, confirmed in the backend
 * capability reconciliation) rather than left hardcoded/random. The
 * "AI Agents" tile is a safely-derived count (agents with >=1 active
 * call / total roster size), not a fabricated Engaged/Idle status.
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const metrics = useAnalyticsMetrics();
  const recent = useCallData({ page_size: 5 });
  const agents = useAgents();

  const interactions = recent.data?.interactions ?? [];
  const activeInteractions = interactions.filter((i) => i.status === 'active');
  const activeCalls = recent.data?.summary.active_calls ?? 0;
  const agentRoster = agents.data?.agents ?? [];
  const activeAgentCount = countActiveCallsByAgent(activeInteractions).size;

  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
        {(recent.isError || agents.isError || metrics.isError) && (
          <QueryErrorBanner
            error={recent.error ?? agents.error ?? metrics.error}
            onRetry={() => {
              void recent.refetch();
              void agents.refetch();
              void metrics.refetch();
            }}
            hasStaleData={interactions.length > 0 || agentRoster.length > 0 || Boolean(metrics.data)}
            isFetching={recent.isFetching || agents.isFetching || metrics.isFetching}
          />
        )}

        <MetricStrip
          items={[
            { label: 'Active calls', value: recent.isLoading ? '…' : activeCalls, hint: 'Currently in progress' },
            { label: 'Active agents', value: agents.isLoading || recent.isLoading ? '…' : `${activeAgentCount}/${agentRoster.length}`, hint: 'On a call / total roster' },
            { label: 'FCR rate', value: metrics.isLoading ? '…' : formatPercent(metrics.data?.fcrRate) },
            {
              label: 'Escalation rate',
              value: metrics.isLoading ? '…' : formatPercent(metrics.data?.escalationRate),
              hint: metrics.data ? `${metrics.data.escalatedCount} calls escalated` : undefined,
              tone: metrics.data?.escalationRate && metrics.data.escalationRate > 20 ? 'warning' : 'default',
            },
            {
              label: 'Avg handle time',
              value: metrics.isLoading ? '…' : formatDurationLong(metrics.data?.avgAhtSeconds),
              hint: formatDurationExact(metrics.data?.avgAhtSeconds),
            },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-100">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : interactions.length === 0 ? (
                <p className="text-sm text-slate-500">No calls yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {interactions.map((call) => (
                    <div
                      key={call.interactionId}
                      className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-100 truncate text-sm">{call.callerName || formatPhoneNumber(call.phoneNumber)}</div>
                        <div className="text-xs text-slate-500 truncate">{call.intent || '—'} · {formatPhoneNumber(call.phoneNumber)}</div>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <Badge
                          variant={call.status === 'active' ? 'secondary' : call.outcome === 'escalated' ? 'destructive' : 'default'}
                          className="whitespace-nowrap text-xs"
                        >
                          {formatStatusLabel(call.outcome ?? call.status)}
                        </Badge>
                        <div className="text-xs text-slate-500 mt-1" title={formatDurationExact(call.durationSeconds)}>
                          {formatDurationLong(call.durationSeconds)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AgentActivityPanel
            agents={agentRoster}
            activeInteractions={activeInteractions}
            isLoading={agents.isLoading || recent.isLoading}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => navigate('/live-view')}
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-cyan-400" />
            Live Interactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => navigate('/qa-review')}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
            Review Escalations
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => navigate('/analytics')}
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-violet-400" />
            Analytics
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
