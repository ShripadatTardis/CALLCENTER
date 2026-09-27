import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricStrip } from '@/components/common/MetricStrip';
import { ArrowLeft, Bot, Loader2 } from 'lucide-react';
import { useAgentDetail } from '@/hooks/agents/useAgentDetail';
import { useClassification } from '@/hooks/classification/useClassification';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import type { Interaction } from '@/types/interaction';
import { resolveDetailOrigin, type DetailNavigationState } from '@/lib/detailOrigin';
import {
  formatDurationLong,
  formatFractionAsPercent,
  formatPercent,
  formatStatusLabel,
  formatTimestamp,
} from '@/lib/format';

const FALLBACK = '—';

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="rounded-md border border-border bg-card p-3 space-y-2">
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
    </div>
    {children}
  </div>
);

/**
 * One operational view per agent (docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md
 * §12) — every field traces to a real, already-confirmed source (see the
 * plan doc §7/§15) — no composite score, no Tools/Langfuse/Resources tab,
 * no agent-editing control. Drill-down reuses the existing Call Logs /
 * Chat Session detail dialogs unmodified (§13).
 *
 * Session 11.7 (docs/SCREEN_REVIEW_06_AI_AGENTS.md §9, addendum §8):
 * restructured into a five-section architecture rather than the earlier
 * 2-section "Contract/Usage" proposal, because the pre-existing
 * VoiceForce content here (Business Outcomes / Conversational Quality /
 * Technical Performance / Campaign outcomes) was individually audited
 * and is mostly defensible as-is (§8 of the review). Nothing here was
 * removed merely to simplify the page — every omission below is a
 * traced, documented provenance decision, not a redesign choice.
 *
 * 1. Agent Identity / Contract — Call Centre-owned, read-only. Reuses
 *    the canonical CallAgentContract shape (buildAgentContractFromRoster,
 *    already used by Campaigns — Session 9.1) rather than inventing a
 *    fourth field definition (review §6/§10).
 * 2. VoiceForce Usage — bounded-sample counts, labeled honestly.
 * 3. Operational Performance — only the metrics that survived the
 *    review's per-metric provenance audit; the corrected (stale-excluded)
 *    Avg handle time; future Contract expected_outcomes kept visibly
 *    separate from these historical observed aggregates.
 * 4. Campaign Usage — target/execution/result measures reconciled
 *    against Session 11.5A's confirmed Campaign Result policy ("the
 *    latest successfully reconciled attempt is the current effective
 *    result" — docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md §A); this
 *    session does not redefine that policy, only displays it honestly.
 * 5. Recent Interactions — unchanged.
 */
const AgentDetail: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = resolveDetailOrigin((location.state as DetailNavigationState | null)?.origin);
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

  const classification = useClassification();

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);

  const recentInteractions = [
    ...callInteractions.map((i) => ({ kind: 'call' as const, at: i.startTime, call: i })),
    ...chatSessions.map((s) => ({ kind: 'chat' as const, at: s.updatedAt, chat: s })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20);

  // Customer 360 category mapping — VoiceForce's own agent_id -> category
  // assignment (never inferred from intent/transcript/sentiment), reusing
  // the existing classification endpoint (review §9/§12) — no new
  // backend capability.
  const agentCategories = (classification.data?.categories ?? []).filter((c) => c.agentIds.includes(agentId ?? ''));

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-background min-h-full flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="bg-background min-h-full text-foreground p-4 space-y-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {returnTo.label}
          </Button>
          <p className="text-sm text-muted-foreground px-1">
            No agent found for id "{agentId}" in the live roster (GET /api/v1/agents).
          </p>
        </div>
      </Layout>
    );
  }

  // Canonical Agent Contract (Session 9.1, already consumed by
  // Campaigns' CreateCampaign.tsx) — honestly 'legacy'/'partial' today
  // since the live /agents roster has no expected-input/outcome/output
  // metadata. Never fabricated here.
  const contract = buildAgentContractFromRoster(agent);

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <Button variant="ghost" size="sm" className="h-7 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to {returnTo.label}
        </Button>

        {/* Compact identity header */}
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground truncate">{agent.displayName}</h1>
              {agent.isDefault && <Badge variant="outline" className="text-xs border-slate-600 text-foreground">Default</Badge>}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{agent.agentId}</p>
          </div>
        </div>

        {/* 1. Agent Identity / Contract — Call Centre-owned, read-only. */}
        <SectionCard title="Call Agent Contract — Call Centre">
          <div className="flex justify-between"><span className="text-muted-foreground">Direction</span><span className="text-foreground">{formatStatusLabel(agent.direction)}</span></div>
          {/* Persona/Language: demoted per review §8A — genuinely live
              fields, but undocumented in the revised Partner API spec and
              not decision-relevant, so kept as secondary metadata only. */}
          <div className="flex justify-between"><span className="text-muted-foreground">Persona</span><span className="text-foreground">{agent.personaName || FALLBACK}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Language</span><span className="text-foreground">{agent.language || FALLBACK}</span></div>
          <div className="pt-2 border-t border-border text-[11px] text-muted-foreground space-y-1">
            {contract.contractCompleteness === 'partial' ? (
              <p>
                Expected inputs, expected outcomes and structured outputs are not yet published by the live Partner
                API (contract source: legacy roster only). Nothing is fabricated here — this section will populate
                automatically once the revised /agents contract is live.
              </p>
            ) : (
              <p>Contract source: {contract.contractSource}.</p>
            )}
          </div>
        </SectionCard>

        {/* 2. VoiceForce Usage — bounded-sample counts, labeled honestly. */}
        <MetricStrip
          items={[
            { label: 'Calls handled', value: callMetrics.callsHandled, hint: 'Most recent 100 call-data rows' },
            { label: 'Chats handled', value: chatMetrics.chatsHandled, hint: 'Most recent 100 chat sessions' },
            { label: 'Campaigns', value: campaignOutcomes.campaignCount, hint: 'Most recent 100 campaigns' },
          ]}
        />
        {classification.data && (
          <SectionCard title="Customer 360 category mapping — VoiceForce">
            {agentCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not assigned to a Customer 360 category.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {agentCategories.map((c) => (
                  <Badge key={c.id} variant="outline" className="text-xs border-slate-600 text-foreground">{c.name}</Badge>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* 3. Operational Performance — only the metrics that survived the
            review's per-metric provenance audit (docs/SCREEN_REVIEW_06_AI_AGENTS.md
            §8). Kept visibly separate from section 1's future Contract
            "Expected Outcomes" — this section is historical observed
            performance, never the agent's designed-to-produce contract. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
          <SectionCard title="Business Outcomes" subtitle="Observed — historical aggregate, not the Agent Contract">
            <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span className="text-foreground">{callMetrics.resolvedCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Escalated</span><span className="text-foreground">{callMetrics.escalatedCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">FCR rate</span><span className="text-foreground">{callMetrics.fcrRate === null ? FALLBACK : formatFractionAsPercent(callMetrics.fcrRate)}</span></div>
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              Voice: call-data outcome/fcr, aggregated. Chat has no documented business-outcome field today — intentionally not shown.
            </p>
          </SectionCard>

          <SectionCard title="Conversational Quality">
            <div className="flex justify-between"><span className="text-muted-foreground">Intent accuracy (voice)</span><span className="text-foreground">{callMetrics.avgIntentAccuracy === null ? FALLBACK : formatPercent(callMetrics.avgIntentAccuracy)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Intent confidence (chat)</span><span className="text-foreground">{chatMetrics.avgConfidence === null ? FALLBACK : formatFractionAsPercent(chatMetrics.avgConfidence)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sentiment (voice)</span><span className="text-foreground">{callMetrics.avgSentimentScore === null ? FALLBACK : callMetrics.avgSentimentScore.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Authenticated (voice/chat)</span><span className="text-foreground">{callMetrics.authenticatedCount} / {chatMetrics.authenticatedCount}</span></div>
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              Intent accuracy: whether this means accuracy-against-ground-truth or classifier-confidence is an open
              Partner API question (Session 11.3), unresolved here.
            </p>
          </SectionCard>

          <SectionCard title="Technical Performance">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg handle time (voice)</span>
              <span className="text-foreground">{formatDurationLong(callMetrics.avgAhtSeconds ?? undefined)}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Avg turn latency (chat)</span><span className="text-foreground">{chatMetrics.avgLatencyMs === null ? FALLBACK : `${Math.round(chatMetrics.avgLatencyMs)} ms`}</span></div>
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              {callMetrics.staleAhtExcludedCount > 0
                ? `${callMetrics.staleAhtExcludedCount} call${callMetrics.staleAhtExcludedCount === 1 ? '' : 's'} excluded from Avg handle time (implausible/stale duration, same 4h guard used elsewhere). `
                : ''}
              Per-agent voice turn latency has no confirmed API source today (analytics/metrics is global/direction-scoped only) — intentionally not shown.
            </p>
          </SectionCard>
        </div>

        {/* 4. Campaign Usage — VoiceForce-owned. Target/execution/result
            measures reconciled against Session 11.5A's confirmed Campaign
            Result policy: classifiedCount/successCount are already
            target-level, effective_result_id/is_success-based (confirmed
            in supabase/migrations/20260926090000_campaigns_foundation.sql
            — classified = effective_result_id set + a matched rule;
            success = that rule's is_success = true), i.e. each count
            reflects every target's CURRENT effective result — the most
            recently reconciled attempt, per 11.5A's confirmed "latest
            attempt wins" policy. No new/alternative definition introduced
            here. */}
        {agent.direction === 'outbound' && agentCampaigns.length > 0 && (
          <SectionCard title="Campaign Usage — VoiceForce" subtitle="Reflects each target's current effective result (latest reconciled attempt) — see Session 11.5A">
            <MetricStrip
              items={[
                { label: 'Campaigns', value: campaignOutcomes.campaignCount },
                { label: 'Targets', value: campaignOutcomes.targetCount },
                { label: 'Classified', value: campaignOutcomes.classifiedCount },
                { label: 'Success rate', value: campaignOutcomes.successRate === null ? FALLBACK : formatFractionAsPercent(campaignOutcomes.successRate) },
              ]}
            />
          </SectionCard>
        )}

        {/* 5. Recent interactions — drill-down into existing detail mechanisms only */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Recent Interactions</div>
          {recentInteractions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No recent interactions for this agent.</p>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    {['Channel', 'When', 'Outcome / Status', ''].map((h) => (
                      <TableHead key={h} className="text-muted-foreground text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInteractions.map((row) =>
                    row.kind === 'call' ? (
                      <TableRow key={`call-${row.call.interactionId}`} className="border-border/60 hover:bg-card">
                        <TableCell><Badge variant="outline" className="text-xs border-slate-600 text-foreground">Voice</Badge></TableCell>
                        <TableCell className="text-foreground text-xs whitespace-nowrap">{formatTimestamp(row.call.startTime)}</TableCell>
                        <TableCell className="text-foreground">{formatStatusLabel(row.call.outcome || row.call.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-muted" onClick={() => setSelectedInteraction(row.call)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={`chat-${row.chat.sessionId}`} className="border-border/60 hover:bg-card">
                        <TableCell><Badge variant="outline" className="text-xs border-slate-600 text-foreground">Chat</Badge></TableCell>
                        <TableCell className="text-foreground text-xs whitespace-nowrap">{formatTimestamp(row.chat.updatedAt)}</TableCell>
                        <TableCell className="text-foreground">{formatStatusLabel(row.chat.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-muted" onClick={() => setSelectedChatSessionId(row.chat.sessionId)}>
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
