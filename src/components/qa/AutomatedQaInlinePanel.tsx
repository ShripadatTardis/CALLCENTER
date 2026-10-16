import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, ExternalLink, AlertCircle } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import {
  useAutomatedQaEvaluation,
  useAutomatedQaEvaluationsForInteraction,
  useStartAutomatedQaEvaluation,
} from '@/hooks/qa/useAutomatedQa';
import { computeAutomatedQaRatios } from '@/lib/automatedQaRatios';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import type { QaChannel } from '@/services/qa/qaService';
import { AUTOMATED_QA_STATUS_BADGE } from '@/lib/automatedQaStatusBadge';
import { QualityMeasurementsGrid } from '@/components/qa/QualityMeasurementsGrid';
import { FindingsList } from '@/components/qa/FindingsList';
import { AutomatedQaFailedBanner } from '@/components/qa/AutomatedQaFailedBanner';
import type { AutomatedQaInspectorReturnState } from '@/lib/automatedQaInspectorReturn';

interface AutomatedQaInlinePanelProps {
  interactionId: string;
  channel: QaChannel;
  agentId: string | null | undefined;
}

/**
 * Session 16.4.3.1 — the Automated QA tab's real content (brief §6/§7,
 * explicitly high-priority): actual measurements/findings/evidence
 * INLINE, not just a status chip + "View" link. Deliberately a NEW,
 * separate component from `AutomatedQaPanel.tsx` (which stays
 * untouched and keeps serving `ChatSessionDetailDialog.tsx` — Chat's
 * own dialog is explicitly out of scope for this session) rather than
 * modifying that shared component, which would have changed Chat's
 * behavior too.
 *
 * Fetches in two steps, both via the SAME existing hooks/endpoints
 * `AutomatedQaPanel.tsx`/`AutomatedQaInspector.tsx` already use — no
 * new API route, no change to evaluation logic, prompts, scoring, or
 * persistence: `useAutomatedQaEvaluationsForInteraction` to find the
 * latest evaluation's id, then `useAutomatedQaEvaluation(latestId)`
 * for the FULL record (transcriptSnapshot + observations — the list
 * endpoint's own RPC, `call_center_automated_qa_list_for_interaction`,
 * confirmed via its SQL to omit `observations`, which only the single-
 * record `call_center_automated_qa_get` RPC joins in). Both queries
 * are plain TanStack Query hooks keyed by id/interactionId, so
 * switching tabs away and back reuses the cache rather than re-
 * fetching (brief's explicit clarification) — this component does
 * nothing special for that; it falls out of using the hooks correctly.
 *
 * A FAILED evaluation renders `AutomatedQaFailedBanner` and nothing
 * else — explicit and honest, the same component
 * `AutomatedQaInspector.tsx` now also uses, so this tab cannot
 * reproduce the blank-panel bug `docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md`
 * documented in the Inspector itself.
 */
export const AutomatedQaInlinePanel: React.FC<AutomatedQaInlinePanelProps> = ({ interactionId, channel, agentId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRun = hasPermission(user, 'qa.automated.run');
  const canView = hasPermission(user, 'qa.automated.view');
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const { data: history, isLoading: historyLoading } = useAutomatedQaEvaluationsForInteraction(
    canView ? interactionId : null,
    channel,
  );
  const latestSummary = history?.[0] ?? null;
  const { data: evaluation, isLoading: evaluationLoading } = useAutomatedQaEvaluation(
    canView ? (latestSummary?.id ?? null) : null,
  );
  const startMutation = useStartAutomatedQaEvaluation();

  const turnIndexById = useMemo(() => {
    const turns = evaluation?.transcriptSnapshot ?? [];
    return new Map(turns.map((t, i) => [t.turnId, i + 1]));
  }, [evaluation]);
  const observations = evaluation?.observations ?? [];
  const ratios = useMemo(
    () => computeAutomatedQaRatios(observations.map((o) => ({ evaluationId: o.evaluationId, parameterCode: o.parameterCode, value: o.value }))),
    [observations],
  );

  if (!canRun && !canView) return null;

  const inFlight = latestSummary?.status === 'queued' || latestSummary?.status === 'running' || startMutation.isPending;

  const handleRun = () => {
    if (!agentId) return;
    startMutation.mutate({ interactionId, channel, agentId });
  };

  const openFullInspector = () => {
    if (!evaluation) return;
    // Session 16.5.1 — origin is derived from this panel's own
    // `channel` prop rather than a new prop: the two are already a
    // strict 1:1 mapping (voice -> Call Logs, chat -> Chat Logs), so a
    // separate "where did I come from" input would just be able to
    // disagree with the one that's already known to be true.
    const returnState: AutomatedQaInspectorReturnState = {
      qaInspectorReturnOrigin: channel === 'voice' ? 'call-logs' : 'chat-logs',
      reopenInteraction: { interactionId, tab: 'qa' },
    };
    navigate(`/qa-review/automated/${evaluation.id}`, { state: returnState });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {!canView ? (
            <p className={typography.bodyMuted}>You don't have permission to view Automated QA results (requires qa.automated.view).</p>
          ) : historyLoading ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">Checking for prior evaluations…</p>
          ) : latestSummary ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={AUTOMATED_QA_STATUS_BADGE[latestSummary.status]}>{latestSummary.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {latestSummary.completedAt ? formatTimestamp(latestSummary.completedAt) : latestSummary.startedAt ? `Started ${formatTimestamp(latestSummary.startedAt)}` : 'Queued'}
                {history && history.length > 1 ? ` · ${history.length} evaluations` : ''}
              </span>
              {evaluation?.modelId && <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={evaluation.modelId}>{evaluation.modelId}</span>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No automated evaluation yet — a separate, independent measurement source from Human QA.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canView && evaluation && latestSummary?.status !== 'queued' && latestSummary?.status !== 'running' && (
            <Button
              variant="outline"
              size="xs"
              className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
              onClick={openFullInspector}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open Full Inspector
            </Button>
          )}
          {canRun && (
            <Button
              variant="outline"
              size="xs"
              disabled={!agentId || inFlight}
              className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
              onClick={handleRun}
            >
              {inFlight ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Evaluating…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {latestSummary ? 'Run Again' : 'Run Automated QA'}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {startMutation.isError && (
        <p className="text-xs text-[var(--status-negative-text)] flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          {startMutation.error instanceof Error ? startMutation.error.message : 'Automated QA evaluation failed to start.'}
        </p>
      )}

      {canView && latestSummary && evaluationLoading && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">Loading evaluation detail…</p>
      )}

      {canView && evaluation && evaluation.status === 'failed' && (
        <AutomatedQaFailedBanner errorCode={evaluation.errorCode} errorMessage={evaluation.errorMessage} />
      )}

      {canView && evaluation && evaluation.status !== 'failed' && (
        <QualityMeasurementsGrid
          ratios={ratios}
          unassessableParameters={evaluation.unassessableParameters}
        />
      )}

      {canView && evaluation && (
        <FindingsList
          observations={observations}
          turnIndexById={turnIndexById}
          selectedFindingId={selectedFindingId}
          onSelectFinding={(o) => setSelectedFindingId((cur) => (cur === o.id ? null : o.id))}
          maxHeightPx={280}
        />
      )}
    </div>
  );
};
