import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Users, TrendingUp, Clock, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/analytics/useAnalyticsMetrics';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { countActiveCallsByAgent } from '@/components/agents/agentActivity';

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

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined) return '—';
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <Layout>
      <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Calls</CardTitle>
              <Phone className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {recent.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : activeCalls}
              </div>
              <p className="text-xs text-gray-500">Currently in progress</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Agents</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {agents.isLoading || recent.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  `${activeAgentCount}/${agentRoster.length}`
                )}
              </div>
              <p className="text-xs text-gray-500">On a call / Total roster</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">FCR Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${metrics.data?.fcrRate.toFixed(1)}%`}
              </div>
              <p className="text-xs text-gray-500">First call resolution</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Escalation Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${metrics.data?.escalationRate.toFixed(1)}%`}
              </div>
              <p className="text-xs text-gray-500">
                {metrics.data ? `${metrics.data.escalatedCount} calls escalated` : ''}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatDuration(metrics.data?.avgAhtSeconds)}
              </div>
              <p className="text-xs text-gray-500">Per completed call</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Calls */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : interactions.length === 0 ? (
                <p className="text-sm text-gray-500">No calls yet.</p>
              ) : (
                <div className="space-y-4">
                  {interactions.map((call) => (
                    <div
                      key={call.interactionId}
                      className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{call.callerName || call.phoneNumber}</div>
                        <div className="text-sm text-gray-500">{call.intent || '—'}</div>
                        <div className="text-xs text-gray-400">{call.phoneNumber}</div>
                      </div>
                      <div className="text-right">
                        <Badge variant={call.status === 'active' ? 'secondary' : call.outcome === 'escalated' ? 'destructive' : 'default'}>
                          {call.outcome ?? call.status}
                        </Badge>
                        <div className="text-xs text-gray-500 mt-1">{formatDuration(call.durationSeconds)}</div>
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

        {/* Quick Actions */}
        <Card className="bg-white border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="justify-start h-auto p-4 flex-col items-start space-y-2"
                onClick={() => navigate('/live-view')}
              >
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-600">View Live Interactions</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Monitor ongoing interactions</p>
              </Button>

              <Button variant="outline" className="justify-start h-auto p-4 flex-col items-start space-y-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span className="font-medium text-orange-600">Review Escalations</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Handle escalated cases</p>
              </Button>

              <Button variant="outline" className="justify-start h-auto p-4 flex-col items-start space-y-2">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-purple-600">Analytics Report</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Generate performance report</p>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
