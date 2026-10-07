import React from 'react';
import { CollapsibleSectionCard } from './CollapsibleSectionCard';
import { formatCallMetricMs, formatTurns, type CallTechnicalPerformance } from '@/lib/callMetricsFormat';

/**
 * Session 15.4 — Call Detail's "Technical Performance" section (brief
 * §5), shared by Call Logs (InteractionDetailDialog) and QA Review
 * (which reuses the same dialog component, so this one addition covers
 * both consuming screens — see QAReview.tsx's own InteractionDetailDialog
 * usage). Collapsed by default, same established pattern as Agent
 * Contract/Input Values Sent. Voice-only — renders nothing for a chat
 * interaction or one with no matching Call Metrics row (honest absence,
 * never a fabricated placeholder).
 */
export const CallTechnicalPerformanceSection: React.FC<{
  metrics: CallTechnicalPerformance | null;
  isLoading: boolean;
}> = ({ metrics, isLoading }) => {
  if (isLoading || !metrics) return null;

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-2 text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );

  return (
    <CollapsibleSectionCard title="Technical Performance">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <div>
          {row('Turn latency (caller-perceived)', formatCallMetricMs(metrics.turnMs, { recordedAt: metrics.recordedAt }))}
          {row('Speech-to-text (STT)', formatCallMetricMs(metrics.sttMs, { recordedAt: metrics.recordedAt }))}
          {row('LLM first token (TTFT)', formatCallMetricMs(metrics.llmTtftMs, { recordedAt: metrics.recordedAt }))}
          {row('LLM generation', formatCallMetricMs(metrics.llmMs, { recordedAt: metrics.recordedAt }))}
          {row('Text-to-speech (TTS TTFB)', formatCallMetricMs(metrics.ttsTtfbMs, { recordedAt: metrics.recordedAt }))}
        </div>
        <div>
          {row('Orchestrator', formatCallMetricMs(metrics.orchestratorMs, { recordedAt: metrics.recordedAt }))}
          {row('Tool execution', formatCallMetricMs(metrics.toolMs, { recordedAt: metrics.recordedAt, notUsedWhenNull: true, decimals: 2 }))}
          {row('Knowledge retrieval (RAG)', formatCallMetricMs(metrics.ragMs, { recordedAt: metrics.recordedAt, notUsedWhenNull: true, decimals: 2 }))}
          {row('Turns measured', formatTurns(metrics.turns))}
          {row('Concurrent calls', String(metrics.concurrentUsers))}
        </div>
      </div>
    </CollapsibleSectionCard>
  );
};
