import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useQaReview, useQaReviewsForInteraction } from '@/hooks/qa/useQa';
import { QA_PARAMETERS } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import type { QaChannel } from '@/services/qa/qaService';
import { QaReviewDialog } from '@/components/qa/QaReviewDialog';

interface ManualQaInlinePanelProps {
  interactionId: string;
  channel: QaChannel;
  agentId: string | null | undefined;
}

/**
 * Session 16.5.1 — the Manual QA tab's real content, shared by both the
 * Call and Chat interaction detail dialogs. Read-only summary built on
 * the SAME `useQaReviewsForInteraction` hook and `QaReview`/`QaFinding`
 * shapes QAReview.tsx's own "Human QA" column already uses — no new QA
 * engine, no second review-status source of truth. "Start/Continue/View
 * Review" always opens the existing `QaReviewDialog`, the real editing
 * workspace (already channel-generic), completely unchanged — blind-
 * review independence is therefore automatically preserved: this panel
 * never shows or influences the review while it's still `in_progress`
 * from someone else, it only summarizes a review once it exists.
 */
export const ManualQaInlinePanel: React.FC<ManualQaInlinePanelProps> = ({ interactionId, channel, agentId }) => {
  const { user } = useAuth();
  const canReview = hasPermission(user, 'qa.review');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewReviewId, setViewReviewId] = useState<string | undefined>(undefined);

  // Session 16.5.1 bug fix — `useQaReviewsForInteraction` (the list RPC,
  // `call_center_qa_review_list_for_interaction`) only ever returns the
  // bare `qa_reviews` row — no `findings`/`turnReviews` key at all (that
  // join only happens in the single-record `call_center_qa_review_get`
  // RPC). Reading `.findings` off a list-sourced row is therefore always
  // `undefined`, not an empty array — the exact same list-vs-get gap
  // `AutomatedQaInlinePanel` already handles via its own two-step fetch
  // (history -> latest id -> full record). Mirrored here: the list is
  // only used to find the latest review's id/status; the full record
  // (with findings) comes from `useQaReview(latestId)`.
  const { data: reviewSummaries, isLoading: summariesLoading } = useQaReviewsForInteraction(canReview ? interactionId : null, channel);

  const latestSummary = useMemo(() => {
    if (!reviewSummaries || reviewSummaries.length === 0) return null;
    return [...reviewSummaries].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }, [reviewSummaries]);

  const { data: latest, isLoading: latestLoading } = useQaReview(canReview ? (latestSummary?.id ?? null) : null);
  const isLoading = summariesLoading || (Boolean(latestSummary) && latestLoading && !latest);

  if (!canReview) {
    return <p className={typography.bodyMuted}>You don't have permission to view Manual QA reviews (requires qa.review).</p>;
  }

  const handleOpen = (reviewId?: string) => {
    setViewReviewId(reviewId);
    setDialogOpen(true);
  };

  const conclusions: Array<[string, string]> = latest
    ? [
        ['Request completion', latest.requestCompletion ?? '—'],
        ['FCR', latest.fcr ?? '—'],
        ['Human assistance required', latest.humanAssistanceRequired ?? '—'],
        ['Business outcome', latest.businessOutcome ?? '—'],
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {isLoading ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">Checking for prior reviews…</p>
          ) : latest ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={latest.status === 'submitted' ? 'positive' : 'outline'}>
                {latest.status === 'submitted' ? 'Reviewed' : 'In Progress'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {latest.submittedAt ? formatTimestamp(latest.submittedAt) : `Started ${formatTimestamp(latest.startedAt)}`}
                {reviewSummaries && reviewSummaries.length > 1 ? ` · ${reviewSummaries.length} reviews` : ''}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No manual QA review yet — a separate, independent measurement source from Automated QA.
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          {agentId && (
            <Button
              variant={latest?.status === 'submitted' ? 'outlinePositive' : 'outline'}
              size="xs"
              className={latest?.status === 'submitted' ? undefined : 'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'}
              onClick={() => handleOpen(latest?.status === 'submitted' ? latest.id : undefined)}
            >
              {latest?.status === 'submitted' ? (
                <>
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  View Review
                </>
              ) : latest ? (
                <>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                  Continue Review
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                  Start Review
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {conclusions.map(([label, value]) => (
            <div key={label} className="text-xs">
              <span className="text-muted-foreground">{label}:</span> <span className="text-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}

      {latest && latest.findings.length > 0 && (
        <div>
          <h2 className={`${typography.cardTitle} mb-1.5`}>Findings</h2>
          <div className="rounded-md border border-border overflow-hidden">
            <table className={`w-full ${typography.tableBody}`}>
              <thead>
                <tr className="h-[30px] bg-card text-muted-foreground uppercase tracking-wide text-[11px] font-semibold">
                  <th className="text-left px-2">Parameter</th>
                  <th className="text-left px-2">Value</th>
                  <th className="text-left px-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {latest.findings.map((f) => {
                  const def = QA_PARAMETERS[f.parameterCode];
                  const isClean = f.value === def.cleanValue;
                  return (
                    <tr key={f.id} className="h-8 border-t border-border">
                      <td className="px-2 py-1">{def.displayName}</td>
                      <td className="px-2 py-1">
                        <Badge variant={isClean ? 'positive' : 'warning'} className="h-5">{f.value}</Badge>
                      </td>
                      <td className="px-2 py-1">{f.reasonCode ? humanizeReasonCode(f.reasonCode) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <QaReviewDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        channel={channel}
        interactionId={interactionId}
        agentId={agentId ?? null}
        viewReviewId={viewReviewId}
      />
    </div>
  );
};
