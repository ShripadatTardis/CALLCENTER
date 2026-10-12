import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaEvaluationsForInteraction, useStartAutomatedQaEvaluation } from '@/hooks/qa/useAutomatedQa';
import { formatTimestamp } from '@/lib/format';
import type { QaChannel } from '@/services/qa/qaService';
import { AUTOMATED_QA_STATUS_BADGE } from '@/lib/automatedQaStatusBadge';

interface AutomatedQaPanelProps {
  interactionId: string;
  channel: QaChannel;
  agentId: string | null | undefined;
}

/**
 * Session 16.3 — the "Run Automated QA" / evaluation-history entry point
 * (brief §18). Placed in Interaction Detail (Call Logs' InteractionDetailDialog
 * and ChatSessionDetailDialog) rather than the QA Review page's table,
 * since that page's Human QA column was being revised concurrently by a
 * different task when this was built — Interaction Detail is one of the
 * brief's own three sanctioned placements. Deliberately its own small,
 * self-contained panel: never reads or writes Human QA data, never
 * renders inside QaReviewDialog, so the blind-review requirement (brief
 * §18) holds structurally, not just by omission.
 *
 * Fully permission-gated: renders nothing for a user with neither
 * qa.automated.run nor qa.automated.view (brief §19 — automated-result
 * access is not implied by any other QA permission).
 */
export const AutomatedQaPanel: React.FC<AutomatedQaPanelProps> = ({ interactionId, channel, agentId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRun = hasPermission(user, 'qa.automated.run');
  const canView = hasPermission(user, 'qa.automated.view');

  const { data: evaluations, isLoading } = useAutomatedQaEvaluationsForInteraction(
    canView ? interactionId : null,
    channel,
  );
  const startMutation = useStartAutomatedQaEvaluation();

  if (!canRun && !canView) return null;

  const latest = evaluations?.[0] ?? null;
  const inFlight = latest?.status === 'queued' || latest?.status === 'running' || startMutation.isPending;

  return (
    <SectionCard title="Automated QA">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {isLoading && canView ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">Checking for prior evaluations…</p>
          ) : latest ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={AUTOMATED_QA_STATUS_BADGE[latest.status]}>{latest.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {latest.completedAt ? formatTimestamp(latest.completedAt) : latest.startedAt ? `Started ${formatTimestamp(latest.startedAt)}` : 'Queued'}
                {evaluations && evaluations.length > 1 ? ` · ${evaluations.length} evaluations` : ''}
              </span>
              {canView && latest.status !== 'queued' && latest.status !== 'running' && (
                <button
                  type="button"
                  className="text-xs min-h-6 py-1 text-cyan-700 dark:text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                  onClick={() => navigate(`/qa-review/automated/${latest.id}`)}
                >
                  View
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No automated evaluation yet — a separate, independent measurement source from Human QA.
            </p>
          )}
        </div>
        {canRun && (
          <Button
            variant="outline"
            size="xs"
            disabled={!agentId || inFlight}
            className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
            onClick={() => {
              if (!agentId) return;
              startMutation.mutate({ interactionId, channel, agentId });
            }}
          >
            {inFlight ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Evaluating…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {latest ? 'Run Again' : 'Run Automated QA'}
              </>
            )}
          </Button>
        )}
      </div>
      {startMutation.isError && (
        <p className="text-xs text-red-700 dark:text-red-400">
          {startMutation.error instanceof Error ? startMutation.error.message : 'Automated QA evaluation failed to start.'}
        </p>
      )}
    </SectionCard>
  );
};
