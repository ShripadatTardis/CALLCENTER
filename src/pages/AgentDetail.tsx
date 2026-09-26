import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricStrip } from '@/components/common/MetricStrip';
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
        <div className="bg-slate-950 min-h-full flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-900" onClick={() => navigate('/ai-agents')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Agents
          </Button>
          <p className="text-sm text-slate-500 px-1">
            No agent found for id "{agentId}" in the live roster (GET /api/v1/agents).
          </p>
        </div>
      </Layout>
    );
  }

  const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );

  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
        <Button variant="ghost" size="sm" className="h-7 -ml-2 text-slate-400 hover:text-white hover:bg-slate-900" onClick={() => navigate('/ai-agents')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to AI Agents
        </Button>

        {/* Compact identity header */}
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-50 truncate">{agent.displayName}</h1>
              {agent.isDefault && <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">Default</Badge>}
            </div>
            <p className="text-xs text-slate-500">
              {agent.personaName || FALLBACK} · {formatStatusLabel(agent.direction)} · {agent.language || FALLBACK} ·{' '}
              <span className="font-mono">{agent.agentId}</span>
            </p>
          </div>
        </div>

        {/* Compact activity/metric strip */}
        <MetricStrip
          items={[
            { label: 'Calls handled', value: callMetrics.callsHandled, hint: 'Most recent 100 call-data rows' },
            { label: 'Chats handled', value: chatMetrics.chatsHandled, hint: 'Most recent 100 chat sessions' },
          ]}
        />

        {/* Quality — three visibly separate categories, never blended into one score */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
          <SectionCard title="Business Outcomes">
            <div className="flex justify-between"><span className="text-slate-500">Resolved</span><span className="text-slate-200">{callMetrics.resolvedCount}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Escalated</span><span className="text-slate-200">{callMetrics.escalatedCount}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">FCR rate</span><span className="text-slate-200">{callMetrics.fcrRate === null ? FALLBACK : formatFractionAsPercent(callMetrics.fcrRate)}</span></div>
            {agent.direction === 'outbound' && (
              <div className="flex justify-between"><span className="text-slate-500">Campaign success rate</span><span className="text-slate-200">{campaignOutcomes.successRate === null ? FALLBACK : formatFractionAsPercent(campaignOutcomes.successRate)}</span></div>
            )}
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
              Voice: call-data outcome/fcr, aggregated. Chat has no documented business-outcome field today — intentionally not shown.
            </p>
          </SectionCard>

          <SectionCard title="Conversational Quality">
            <div className="flex justify-between"><span className="text-slate-500">Intent accuracy (voice)</span><span className="text-slate-200">{callMetrics.avgIntentAccuracy === null ? FALLBACK : formatPercent(callMetrics.avgIntentAccuracy)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Intent confidence (chat)</span><span className="text-slate-200">{chatMetrics.avgConfidence === null ? FALLBACK : formatFractionAsPercent(chatMetrics.avgConfidence)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Sentiment (voice)</span><span className="text-slate-200">{callMetrics.avgSentimentScore === null ? FALLBACK : callMetrics.avgSentimentScore.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Authenticated (voice/chat)</span><span className="text-slate-200">{callMetrics.authenticatedCount} / {chatMetrics.authenticatedCount}</span></div>
          </SectionCard>

          <SectionCard title="Technical Performance">
            <div className="flex justify-between"><span className="text-slate-500">Avg handle time (voice)</span><span className="text-slate-200">{formatDurationLong(callMetrics.avgAhtSeconds ?? undefined)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Avg turn latency (chat)</span><span className="text-slate-200">{chatMetrics.avgLatencyMs === null ? FALLBACK : `${Math.round(chatMetrics.avgLatencyMs)} ms`}</span></div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
              Per-agent voice turn latency has no confirmed API source today (analytics/metrics is global/direction-scoped only) — intentionally not shown.
            </p>
          </SectionCard>
        </div>

        {/* Campaign outcomes — outbound agents only */}
        {agent.direction === 'outbound' && agentCampaigns.length > 0 && (
          <MetricStrip
            items={[
              { label: 'Campaigns', value: campaignOutcomes.campaignCount },
              { label: 'Targets', value: campaignOutcomes.targetCount },
              { label: 'Classified', value: campaignOutcomes.classifiedCount },
              { label: 'Success rate', value: campaignOutcomes.successRate === null ? FALLBACK : formatFractionAsPercent(campaignOutcomes.successRate) },
            ]}
          />
        )}

        {/* Recent interactions — drill-down into existing detail mechanisms only */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Recent Interactions</div>
          {recentInteractions.length === 0 ? (
            <p className="text-sm text-slate-500 px-1">No recent interactions for this agent.</p>
          ) : (
            <div className="rounded-md border border-slate-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    {['Channel', 'When', 'Outcome / Status', ''].map((h) => (
                      <TableHead key={h} className="text-slate-500 text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInteractions.map((row) =>
                    row.kind === 'call' ? (
                      <TableRow key={`call-${row.call.interactionId}`} className="border-slate-800/60 hover:bg-slate-900/60">
                        <TableCell><Badge variant="outline" className="text-xs border-slate-600 text-slate-300">Voice</Badge></TableCell>
                        <TableCell className="text-slate-300 text-xs whitespace-nowrap">{formatTimestamp(row.call.startTime)}</TableCell>
                        <TableCell className="text-slate-300">{formatStatusLabel(row.call.outcome || row.call.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800" onClick={() => setSelectedInteraction(row.call)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={`chat-${row.chat.sessionId}`} className="border-slate-800/60 hover:bg-slate-900/60">
                        <TableCell><Badge variant="outline" className="text-xs border-slate-600 text-slate-300">Chat</Badge></TableCell>
                        <TableCell className="text-slate-300 text-xs whitespace-nowrap">{formatTimestamp(row.chat.updatedAt)}</TableCell>
                        <TableCell className="text-slate-300">{formatStatusLabel(row.chat.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800" onClick={() => setSelectedChatSessionId(row.chat.sessionId)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

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
