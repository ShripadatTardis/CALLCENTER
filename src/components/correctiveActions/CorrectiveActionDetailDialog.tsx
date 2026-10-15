import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import {
  CorrectiveActionStatusBadge,
  CorrectiveActionPriorityBadge,
} from './correctiveActionStatus';
import {
  useCorrectiveAction,
  useCorrectiveActionActivity,
  useEligiblePeople,
  useCandidateCorrectiveActions,
  useTakeCorrectiveActionOwnership,
  useAssignCorrectiveAction,
  useAssignCorrectiveActionVerifier,
  useSetCorrectiveActionStatus,
  useRecordCorrectiveActionCorrection,
  useRecordCorrectiveActionVerification,
  useCreateCorrectiveActionGroup,
  useLinkCorrectiveActionsToGroup,
} from '@/hooks/correctiveActions/useCorrectiveActions';
import { formatCaNumber } from '@/services/correctiveActions/correctiveActionsService';

interface CorrectiveActionDetailDialogProps {
  id: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenGroup?: (groupId: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manually created',
  automated_qa_observation: 'Automated QA finding',
  human_qa_finding: 'Human QA finding',
};

/**
 * Session 16.5 — the CA detail workspace (brief §12). Shows identity +
 * source, description, evidence references (by reference, never a
 * copied transcript), assignment, current state, linked group,
 * investigation/correction, verification, activity history, and only
 * the actions the actor is actually permitted to take. Server RPCs
 * re-enforce every rule regardless of what this component renders —
 * identical ownership-aware pattern to Session 15's
 * ActionItemDetailDialog.
 */
export const CorrectiveActionDetailDialog: React.FC<CorrectiveActionDetailDialogProps> = ({ id, isOpen, onClose, onOpenGroup }) => {
  const { user } = useAuth();
  const { data: ca, isLoading } = useCorrectiveAction(id);
  const { data: activity } = useCorrectiveActionActivity(id);

  const [resolutionSummary, setResolutionSummary] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [verificationResult, setVerificationResult] = useState<'passed' | 'failed' | ''>('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [assigneeChoice, setAssigneeChoice] = useState('');
  const [verifierChoice, setVerifierChoice] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  const canManageAny = hasPermission(user, 'corrective_actions.assign');
  const canEdit = hasPermission(user, 'corrective_actions.edit');
  const canResolve = hasPermission(user, 'corrective_actions.resolve');
  const canVerify = hasPermission(user, 'corrective_actions.verify');
  const canLink = hasPermission(user, 'corrective_actions.link');
  const canReopenCancel = hasPermission(user, 'corrective_actions.reopen_cancel');

  const isOwnItem = Boolean(ca?.assignedTo && user?.id === ca.assignedTo);
  const isOwnVerification = Boolean(ca?.verifierId && user?.id === ca.verifierId) || !ca?.verifierId;
  const canProgressOrResolve = canResolve && (canManageAny || isOwnItem);
  const canTakeOwnership = canResolve && !canManageAny && !ca?.assignedTo;
  const canRecordVerification = canVerify && (canManageAny || isOwnVerification) && (ca?.status === 'pending_verification' || ca?.status === 'in_progress');

  const { data: eligiblePeople } = useEligiblePeople(id, isOpen && (canManageAny || canVerify));
  const { data: candidates } = useCandidateCorrectiveActions(
    id,
    { agentId: ca?.agentId ?? null, category: ca?.category ?? null, parameterCode: (ca?.sourceContext?.parameterCode as string | undefined) ?? null },
    isOpen && canLink && Boolean(ca),
  );

  const takeOwnershipMutation = useTakeCorrectiveActionOwnership();
  const assignMutation = useAssignCorrectiveAction();
  const assignVerifierMutation = useAssignCorrectiveActionVerifier();
  const setStatusMutation = useSetCorrectiveActionStatus();
  const recordCorrectionMutation = useRecordCorrectiveActionCorrection();
  const recordVerificationMutation = useRecordCorrectiveActionVerification();
  const createGroupMutation = useCreateCorrectiveActionGroup();
  const linkMutation = useLinkCorrectiveActionsToGroup();

  const handleLinkSelected = async () => {
    if (!ca || selectedCandidateIds.size === 0) return;
    const ids = Array.from(selectedCandidateIds);
    if (ca.groupId) {
      await linkMutation.mutateAsync({ groupId: ca.groupId, caIds: ids });
      setSelectedCandidateIds(new Set());
      return;
    }
    const title = window.prompt('Title for the new corrective action group:', ca.title);
    if (!title || !title.trim()) return;
    const group = await createGroupMutation.mutateAsync({ title: title.trim() });
    await linkMutation.mutateAsync({ groupId: group.id, caIds: [ca.id, ...ids] });
    setSelectedCandidateIds(new Set());
    onOpenGroup?.(group.id);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {ca ? formatCaNumber(ca.caNumber) : 'Corrective Action'}
            {ca && <CorrectiveActionStatusBadge status={ca.status} />}
            {ca && <CorrectiveActionPriorityBadge priority={ca.priority} />}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !ca ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <SectionCard title={ca.title}>
              <p className="text-sm text-foreground whitespace-pre-wrap">{ca.description}</p>
              <div className="flex flex-wrap gap-3 pt-1.5 text-xs text-muted-foreground">
                <span>Source: {SOURCE_LABEL[ca.sourceType] ?? ca.sourceType}</span>
                {ca.sourceReferenceId && <span>Ref: {ca.sourceReferenceId}</span>}
                <span>Opened {formatTimestamp(ca.createdAt)}</span>
                {ca.dueAt && <span>Due {formatTimestamp(ca.dueAt)}</span>}
              </div>
              {ca.sourceContext && Object.keys(ca.sourceContext).length > 0 && (
                <div className="pt-1 text-xs text-muted-foreground">
                  {Object.entries(ca.sourceContext).map(([k, v]) => (
                    <div key={k} className="truncate"><span className="text-muted-foreground/70">{k}: </span>{Array.isArray(v) ? v.join(', ') : String(v)}</div>
                  ))}
                </div>
              )}
            </SectionCard>

            {ca.groupId && (
              <SectionCard title="Linked Group" action={
                <button type="button" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline" onClick={() => onOpenGroup?.(ca.groupId as string)}>
                  Open group
                </button>
              }>
                <p className={typography.bodyMuted}>This corrective action is part of a shared-correction group.</p>
              </SectionCard>
            )}

            {canLink && (
              <SectionCard title="Find Related Corrective Actions">
                <p className={typography.bodyMuted}>
                  Candidates sharing the same agent, category, or QA parameter — a discovery aid only.
                  Nothing is linked automatically; confirm each selection, then link explicitly.
                </p>
                {(candidates ?? []).length === 0 ? (
                  <p className="pt-1.5 text-xs text-muted-foreground">No candidate matches found.</p>
                ) : (
                  <ul className="space-y-1 pt-1.5">
                    {(candidates ?? []).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={selectedCandidateIds.has(c.id)}
                          onChange={(e) => {
                            setSelectedCandidateIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.id); else next.delete(c.id);
                              return next;
                            });
                          }}
                        />
                        <span className="font-medium text-foreground">{formatCaNumber(c.caNumber)}</span>
                        <span className="truncate text-muted-foreground">{c.title}</span>
                        <CorrectiveActionStatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedCandidateIds.size === 0 || createGroupMutation.isPending || linkMutation.isPending}
                    onClick={() => void handleLinkSelected()}
                  >
                    {ca.groupId ? `Add Selected to Group (${selectedCandidateIds.size})` : `Link Selected into New Group (${selectedCandidateIds.size})`}
                  </Button>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Assignment">
              <div className="text-sm text-foreground">{ca.assignedToName ?? 'Unassigned'}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                {canTakeOwnership && (
                  <Button size="sm" variant="outline" disabled={takeOwnershipMutation.isPending} onClick={() => takeOwnershipMutation.mutate(ca.id)}>
                    Take ownership
                  </Button>
                )}
                {canManageAny && (
                  <div className="flex items-center gap-2">
                    <Select value={assigneeChoice} onValueChange={setAssigneeChoice}>
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                      <SelectContent>
                        {(eligiblePeople ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName ?? p.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={!assigneeChoice || assignMutation.isPending} onClick={() => assignMutation.mutate({ id: ca.id, assigneeUserId: assigneeChoice })}>
                      Assign
                    </Button>
                  </div>
                )}
              </div>
              <div className="pt-2 text-sm text-foreground">Verifier: {ca.verifierName ?? 'Unassigned'}</div>
              {canVerify && (
                <div className="flex items-center gap-2 pt-1">
                  <Select value={verifierChoice} onValueChange={setVerifierChoice}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Assign verifier…" /></SelectTrigger>
                    <SelectContent>
                      {(eligiblePeople ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName ?? p.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!verifierChoice || assignVerifierMutation.isPending} onClick={() => assignVerifierMutation.mutate({ id: ca.id, verifierUserId: verifierChoice })}>
                    Assign
                  </Button>
                </div>
              )}
            </SectionCard>

            {(ca.status === 'open' || ca.status === 'in_progress' || ca.status === 'reopened') && (
              <SectionCard title="Investigation / Correction">
                <div className="flex flex-wrap gap-2">
                  {ca.status !== 'in_progress' && (
                    <Button size="sm" variant="outline" disabled={!canProgressOrResolve || setStatusMutation.isPending} onClick={() => setStatusMutation.mutate({ id: ca.id, status: 'in_progress' })}>
                      Move to In Progress
                    </Button>
                  )}
                  {ca.status === 'in_progress' && (
                    <Button size="sm" variant="outline" disabled={!canProgressOrResolve || setStatusMutation.isPending} onClick={() => setStatusMutation.mutate({ id: ca.id, status: 'pending_verification' })}>
                      Submit for Verification
                    </Button>
                  )}
                </div>
                {canProgressOrResolve && (
                  <div className="space-y-2 pt-2">
                    <Textarea
                      placeholder="What corrective work was performed…"
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!resolutionSummary.trim() || recordCorrectionMutation.isPending}
                      onClick={() => recordCorrectionMutation.mutate({ id: ca.id, resolutionSummary: resolutionSummary.trim() }, { onSuccess: () => setResolutionSummary('') })}
                    >
                      Record Correction
                    </Button>
                  </div>
                )}
                {ca.resolutionSummary && (
                  <div className="pt-2 text-xs text-muted-foreground"><span className="text-foreground">Latest correction: </span>{ca.resolutionSummary}</div>
                )}
              </SectionCard>
            )}

            {canRecordVerification && (
              <SectionCard title="Verification">
                <div className="space-y-2">
                  <Select value={verificationResult} onValueChange={(v) => setVerificationResult(v as 'passed' | 'failed')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Test result…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passed">Passed — issue resolved</SelectItem>
                      <SelectItem value="failed">Failed — issue persists</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Test description / notes…"
                    value={verificationNotes}
                    onChange={(e) => setVerificationNotes(e.target.value)}
                    className="text-xs min-h-[60px]"
                  />
                  <Button
                    size="sm"
                    disabled={!verificationResult || recordVerificationMutation.isPending}
                    onClick={() =>
                      verificationResult &&
                      recordVerificationMutation.mutate(
                        { id: ca.id, result: verificationResult, details: { notes: verificationNotes.trim() || undefined } },
                        { onSuccess: () => { setVerificationResult(''); setVerificationNotes(''); } },
                      )
                    }
                  >
                    Record Verification
                  </Button>
                </div>
              </SectionCard>
            )}

            {ca.verificationResult && (
              <SectionCard title="Last Verification Result">
                <div className="text-sm text-foreground capitalize">{ca.verificationResult}</div>
                <div className="text-xs text-muted-foreground">Verified {ca.verifiedAt ? formatTimestamp(ca.verifiedAt) : '—'}</div>
              </SectionCard>
            )}

            {(ca.status === 'closed' || ca.status === 'open' || ca.status === 'in_progress') && canReopenCancel && (
              <SectionCard title="Reopen / Cancel">
                <div className="space-y-2">
                  {ca.status === 'closed' && (
                    <Button size="sm" variant="outline" disabled={setStatusMutation.isPending} onClick={() => setStatusMutation.mutate({ id: ca.id, status: 'reopened' })}>
                      Reopen
                    </Button>
                  )}
                  {ca.status !== 'closed' && (
                    <div className="flex items-center gap-2">
                      <Textarea placeholder="Cancellation reason (required)…" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="text-xs min-h-[40px]" />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!cancelReason.trim() || setStatusMutation.isPending}
                        onClick={() => setStatusMutation.mutate({ id: ca.id, status: 'cancelled', reason: cancelReason.trim() }, { onSuccess: () => setCancelReason('') })}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {ca.status === 'cancelled' && (
              <SectionCard title="Cancellation">
                <div className="text-xs text-muted-foreground">{ca.cancelReason}</div>
                <div className="text-xs text-muted-foreground">Cancelled {ca.cancelledAt ? formatTimestamp(ca.cancelledAt) : '—'}</div>
              </SectionCard>
            )}

            <SectionCard title="Activity History">
              {(activity ?? []).length === 0 ? (
                <p className={typography.bodyMuted}>No activity recorded yet.</p>
              ) : (
                <ol className="space-y-1.5 text-xs">
                  {(activity ?? []).map((event) => (
                    <li key={event.id} className="border-l-2 border-border pl-2">
                      <div className="text-foreground">
                        <span className="font-medium">{event.actorName ?? 'System'}</span>{' '}
                        {event.eventType === 'status_changed' ? `changed status: ${String(event.beforeValue?.status ?? '—')} → ${String(event.afterValue?.status ?? '—')}` : event.eventType.replace(/_/g, ' ')}
                      </div>
                      {event.comment && <div className="text-muted-foreground">{event.comment}</div>}
                      <div className="text-muted-foreground">{formatTimestamp(event.createdAt)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            {!canEdit && !canResolve && !canVerify && !canReopenCancel && (
              <p className={typography.bodyMuted}>You have view-only access to this corrective action.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
