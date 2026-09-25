import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Bot, Loader2, Phone, MessageSquare } from 'lucide-react';
import { useAgentDetail } from '@/hooks/agents/useAgentDetail';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import type { Interaction } from '@/types/interaction';
import {
  formatDurationLong,
  formatFractionAsPercent,
  formatPercent,
  formatStatusLabel,
  formatTimestamp,
} from '@/lib/format';

const FALLBACK = '—';

/**
 * One operational view per agent (docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md
 * §12) — Identity / Activity / Quality (3 visibly separate categories) /
 * Campaign outcomes. Every field here traces to a real, already-confirmed
 * source (see the plan doc §7/§15) — no composite score, no Tools/
 * Langfuse/Resources tab, no agent-editing control. Drill-down reuses the
 * existing Call Logs / Chat Session detail dialogs unmodified (§13).
 */
const AgentDetail: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const {
    agent,
    callInteractions,
    chatSessions,
    agentCampaigns,
    callMetrics,
    chatMetrics,
    campaignOutcomes,
    isLoading,
  } = useAgentDetail(agentId);

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);

  const recentInteractions = [
    ...callInteractions.map((i) => ({ kind: 'call' as const, at: i.startTime, call: i })),
    ...chatSessions.map((s) => ({ kind: 'chat' as const, at: s.updatedAt, chat: s })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20);

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto p-6 flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="container mx-auto p-6 space-y-4">
          <Button variant="ghost" onClick={() => navigate('/ai-agents')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Agents
          </Button>
          <p className="text-muted-foreground">
            No agent found for id "{agentId}" in the live roster (GET /api/v1/agents).
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/ai-agents')} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Agents
          </Button>
          <div className="flex items-center gap-3">
            <Bot className="h-7 w-7" />
            <div>
              <h1 className="text-3xl font-bold">{agent.displayName}</h1>
              <p className="text-muted-foreground">{agent.personaName}</p>
            </div>
            {agent.isDefault && <Badge variant="outline">Default</Badge>}
          </div>
        </div>

        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Agent ID</div>
              <div className="font-mono text-xs mt-1">{agent.agentId}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Direction</div>
              <div className="mt-1">{formatStatusLabel(agent.direction)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Language</div>
              <div className="mt-1">{agent.language || FALLBACK}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Persona</div>
              <div className="mt-1">{agent.personaName || FALLBACK}</div>
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4 text-sm">
            <div className="border rounded-lg p-4">
              <div className="text-muted-foreground flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Calls handled
              </div>
              <div className="text-2xl font-semibold mt-1">{callMetrics.callsHandled}</div>
              <div className="text-xs text-muted-foreground mt-1">Most recent 100 call-data rows for this agent</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" /> Chats handled
              </div>
              <div className="text-2xl font-semibold mt-1">{chatMetrics.chatsHandled}</div>
              <div className="text-xs text-muted-foreground mt-1">Most recent 100 chat sessions for this agent</div>
            </div>
          </CardContent>
        </Card>

        {/* Quality — three visibly separate categories, never blended into one score */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business Outcomes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolved</span>
                <span>{callMetrics.resolvedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Escalated</span>
                <span>{callMetrics.escalatedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">FCR rate</span>
                <span>{callMetrics.fcrRate === null ? FALLBACK : formatFractionAsPercent(callMetrics.fcrRate)}</span>
              </div>
              {agent.direction === 'outbound' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaign success rate</span>
                  <span>
                    {campaignOutcomes.successRate === null
                      ? FALLBACK
                      : formatFractionAsPercent(campaignOutcomes.successRate)}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                Voice: call-data outcome/fcr, aggregated. Chat has no documented business-outcome field today —
                intentionally not shown here.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversational Quality</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg intent accuracy (voice)</span>
                <span>
                  {callMetrics.avgIntentAccuracy === null ? FALLBACK : formatPercent(callMetrics.avgIntentAccuracy)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg intent confidence (chat)</span>
                <span>
                  {chatMetrics.avgConfidence === null ? FALLBACK : formatFractionAsPercent(chatMetrics.avgConfidence)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg sentiment score (voice)</span>
                <span>{callMetrics.avgSentimentScore === null ? FALLBACK : callMetrics.avgSentimentScore.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authenticated (voice / chat)</span>
                <span>
                  {callMetrics.authenticatedCount} / {chatMetrics.authenticatedCount}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Technical Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg handle time (voice)</span>
                <span>{formatDurationLong(callMetrics.avgAhtSeconds ?? undefined)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg turn latency (chat)</span>
                <span>{chatMetrics.avgLatencyMs === null ? FALLBACK : `${Math.round(chatMetrics.avgLatencyMs)} ms`}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Per-agent voice turn latency has no confirmed API source today (GET /api/v1/analytics/metrics is
                global/direction-scoped only) — intentionally not shown.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Campaign outcomes — outbound agents only */}
        {agent.direction === 'outbound' && agentCampaigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Outcomes</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Campaigns</div>
                <div className="text-xl font-semibold mt-1">{campaignOutcomes.campaignCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Targets</div>
                <div className="text-xl font-semibold mt-1">{campaignOutcomes.targetCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Classified</div>
                <div className="text-xl font-semibold mt-1">{campaignOutcomes.classifiedCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Success rate</div>
                <div className="text-xl font-semibold mt-1">
                  {campaignOutcomes.successRate === null ? FALLBACK : formatFractionAsPercent(campaignOutcomes.successRate)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground col-span-full">
                Target-level success rate via each target's effective_result_id — same definition Campaigns itself
                uses (Session 5). Targets with no classified result are excluded from both sides of the ratio, not
                counted as failures.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Recent interactions — drill-down into existing detail mechanisms only */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentInteractions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent interactions for this agent.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Outcome / Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInteractions.map((row) =>
                    row.kind === 'call' ? (
                      <TableRow key={`call-${row.call.interactionId}`}>
                        <TableCell>
                          <Badge variant="outline">Voice</Badge>
                        </TableCell>
                        <TableCell>{formatTimestamp(row.call.startTime)}</TableCell>
                        <TableCell>{formatStatusLabel(row.call.outcome || row.call.status)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setSelectedInteraction(row.call)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={`chat-${row.chat.sessionId}`}>
                        <TableCell>
                          <Badge variant="outline">Chat</Badge>
                        </TableCell>
                        <TableCell>{formatTimestamp(row.chat.updatedAt)}</TableCell>
                        <TableCell>{formatStatusLabel(row.chat.status)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setSelectedChatSessionId(row.chat.sessionId)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <InteractionDetailDialog
          isOpen={Boolean(selectedInteraction)}
          onClose={() => setSelectedInteraction(null)}
          interaction={selectedInteraction}
        />
        <ChatSessionDetailDialog
          isOpen={Boolean(selectedChatSessionId)}
          onClose={() => setSelectedChatSessionId(null)}
          sessionId={selectedChatSessionId}
        />
      </div>
    </Layout>
  );
};

export default AgentDetail;
