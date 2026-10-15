import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import { CorrectiveActionStatusBadge } from './correctiveActionStatus';
import {
  useCorrectiveActionGroup,
  useCorrectiveActionGroupMembers,
  useCorrectiveActionGroupActivity,
  useUpdateCorrectiveActionGroup,
  useUnlinkCorrectiveActionFromGroup,
  useBulkVerifyCorrectiveActions,
} from '@/hooks/correctiveActions/useCorrectiveActions';
import { formatCaNumber } from '@/services/correctiveActions/correctiveActionsService';

interface CorrectiveActionGroupDialogProps {
  groupId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCa?: (id: string) => void;
}

/**
 * Session 16.5 — the group workspace (brief §13). Review linked CAs,
 * record the shared investigation/root cause/correction, and run a
 * common verification test against a bulk-selected subset of members —
 * every selected CA still gets its OWN verification + closure event
 * (enforced server-side in call_center_corrective_actions_bulk_verify;
 * this dialog cannot bypass that, it can only call the same API).
 */
export const CorrectiveActionGroupDialog: React.FC<CorrectiveActionGroupDialogProps> = ({ groupId, isOpen, onClose, onOpenCa }) => {
  const { user } = useAuth();
  const canLink = hasPermission(user, 'corrective_actions.link');
  const canVerify = hasPermission(user, 'corrective_actions.verify');

  const { data: group, isLoading } = useCorrectiveActionGroup(groupId);
  const { data: members } = useCorrectiveActionGroupMembers(groupId);
  const { data: activity } = useCorrectiveActionGroupActivity(groupId);

  const [rootCause, setRootCause] = useState('');
  const [proposedCorrection, setProposedCorrection] = useState('');
  const [implementedCorrection, setImplementedCorrection] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTestDescription, setBulkTestDescription] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');

  const updateGroupMutation = useUpdateCorrectiveActionGroup();
  const unlinkMutation = useUnlinkCorrectiveActionFromGroup();
  const bulkVerifyMutation = useBulkVerifyCorrectiveActions();

  React.useEffect(() => {
    if (group) {
      setRootCause(group.rootCause ?? '');
      setProposedCorrection(group.proposedCorrection ?? '');
      setImplementedCorrection(group.implementedCorrection ?? '');
    }
  }, [group]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const eligibleForVerification = (members ?? []).filter((m) => m.status === 'pending_verification' || m.status === 'in_progress');
  const selectedEligible = eligibleForVerification.filter((m) => selectedIds.has(m.id));

  const runBulkVerify = (result: 'passed' | 'failed') => {
    if (selectedEligible.length === 0 || !groupId) return;
    bulkVerifyMutation.mutate(
      {
        ids: selectedEligible.map((m) => m.id),
        result,
        details: { testDescription: bulkTestDescription.trim() || undefined, notes: bulkNotes.trim() || undefined, groupId },
      },
      {
        onSuccess: (res) => {
          toast.success(`Verification recorded — ${res.succeeded} succeeded, ${res.failed} failed.`);
          setSelectedIds(new Set());
        },
        onError: () => toast.error('Bulk verification failed.'),
      },
    );
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{group ? `Group CA-G-${String(group.groupNumber).padStart(5, '0')}: ${group.title}` : 'Corrective Action Group'}</DialogTitle>
        </DialogHeader>

        {isLoading || !group ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <SectionCard title="Shared Correction">
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Root cause</label>
                  <Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} disabled={!canLink} className="text-xs min-h-[50px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Proposed correction</label>
                  <Textarea value={proposedCorrection} onChange={(e) => setProposedCorrection(e.target.value)} disabled={!canLink} className="text-xs min-h-[50px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Implemented correction</label>
                  <Textarea value={implementedCorrection} onChange={(e) => setImplementedCorrection(e.target.value)} disabled={!canLink} className="text-xs min-h-[50px]" />
                </div>
                {canLink && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateGroupMutation.isPending}
                    onClick={() =>
                      updateGroupMutation.mutate(
                        { id: group.id, patch: { rootCause, proposedCorrection, implementedCorrection } },
                        { onSuccess: () => toast.success('Group updated.'), onError: () => toast.error('Could not update group.') },
                      )
                    }
                  >
                    Save
                  </Button>
                )}
              </div>
            </SectionCard>

            <SectionCard title={`Linked Corrective Actions (${(members ?? []).length})`}>
              {(members ?? []).length === 0 ? (
                <p className={typography.bodyMuted}>No corrective actions linked to this group yet.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {(members ?? []).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 py-1.5">
                      {canVerify && (m.status === 'pending_verification' || m.status === 'in_progress') && (
                        <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelected(m.id)} className="h-3.5 w-3.5" aria-label={`Select ${formatCaNumber(m.caNumber)}`} />
                      )}
                      <button type="button" className="flex-1 min-w-0 text-left hover:underline" onClick={() => onOpenCa?.(m.id)}>
                        <span className="text-xs font-medium text-foreground">{formatCaNumber(m.caNumber)}</span>{' '}
                        <span className="text-xs text-muted-foreground truncate">{m.title}</span>
                      </button>
                      <CorrectiveActionStatusBadge status={m.status} />
                      {canLink && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-xs"
                          disabled={unlinkMutation.isPending}
                          onClick={() => unlinkMutation.mutate({ groupId: group.id, caId: m.id })}
                        >
                          Unlink
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {canVerify && eligibleForVerification.length > 0 && (
              <SectionCard title="Common Test / Bulk Verification">
                <p className={`${typography.bodyMuted} pb-1`}>Select linked CAs above that are ready for verification, then record one shared test result — each selected CA still receives its own verification and closure event.</p>
                <div className="space-y-2">
                  <Input placeholder="Test description…" value={bulkTestDescription} onChange={(e) => setBulkTestDescription(e.target.value)} className="h-8 text-xs" />
                  <Textarea placeholder="Notes…" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} className="text-xs min-h-[50px]" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={selectedEligible.length === 0 || bulkVerifyMutation.isPending} onClick={() => runBulkVerify('passed')}>
                      Record Passed &amp; Close Selected ({selectedEligible.length})
                    </Button>
                    <Button size="sm" variant="outline" disabled={selectedEligible.length === 0 || bulkVerifyMutation.isPending} onClick={() => runBulkVerify('failed')}>
                      Record Failed
                    </Button>
                  </div>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Group Activity">
              {(activity ?? []).length === 0 ? (
                <p className={typography.bodyMuted}>No group-level activity yet.</p>
              ) : (
                <ol className="space-y-1.5 text-xs">
                  {(activity ?? []).map((event) => (
                    <li key={event.id} className="border-l-2 border-border pl-2">
                      <div className="text-foreground"><span className="font-medium">{event.actorName ?? 'System'}</span> {event.eventType.replace(/_/g, ' ')}</div>
                      <div className="text-muted-foreground">{formatTimestamp(event.createdAt)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
