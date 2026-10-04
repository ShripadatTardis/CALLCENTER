import React, { useMemo, useState } from 'react';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { AgentSummary } from '@/services/agents/agentsMapper';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { ConversationTranscript, type ConversationEntry } from '@/components/interaction-detail/ConversationTranscript';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import {
  useActionItem,
  useEligibleAssignees,
  useTakeOwnership,
  useAssignActionItem,
  useSetActionItemStatus,
  useResolveActionItem,
} from '@/hooks/actions/useActions';
import { actionItemReasonText, type ActionItem } from '@/services/actions/actionsService';
import { formatTimestamp } from '@/lib/format';

const RESOLUTION_CODES: Array<{ value: NonNullable<ActionItem['resolutionCode']>; label: string }> = [
  { value: 'escalation_handled', label: 'Escalation handled' },
  { value: 'customer_called_back', label: 'Customer called back' },
  { value: 'no_action_needed', label: 'No action needed' },
  { value: 'other', label: 'Other' },
];

function statusBadge(status: ActionItem['status']) {
  if (status === 'in_progress') return <Badge variant="secondary" className="text-xs">In Progress</Badge>;
  if (status === 'resolved') return <Badge variant="positive" className="text-xs">Resolved</Badge>;
  return <Badge variant="escalated" className="text-xs">Open</Badge>;
}

interface ActionItemDetailDialogProps {
  id: string | null;
  isOpen: boolean;
  onClose: () => void;
  agentRoster: AgentSummary[];
}

/**
 * Session 15 — the Action Required item's own inspection + lifecycle
 * surface. Deliberately does NOT reconstruct a full `Interaction` object
 * to reuse InteractionDetailDialog wholesale (customer_id/duration/
 * phoneNumber aren't resolvable for a call from this action item in v1 —
 * see the migration header — and fabricating placeholder values for
 * them would violate the "no fake data" rule). Instead reuses the
 * SAME transcript-fetch/render primitives that dialog uses internally
 * (`useInteractionTranscript` + `ConversationTranscript`), which is a
 * genuine, live, scope-enforced fetch of the underlying call — just
 * without a fabricated summary-metrics header.
 *
 * Ownership-aware (plan §7): controls shown here are a UX convenience
 * only — the server RPCs re-enforce the real rule regardless of what
 * this component decides to render.
 */
export const ActionItemDetailDialog: React.FC<ActionItemDetailDialogProps> = ({ id, isOpen, onClose, agentRoster }) => {
  const guardedNavigate = useGuardedNavigate();
  const { user } = useAuth();
  const { data: item, isLoading } = useActionItem(id);
  const [showTranscript, setShowTranscript] = useState(false);
  const [resolutionCode, setResolutionCode] = useState<NonNullable<ActionItem['resolutionCode']> | ''>('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [assigneeChoice, setAssigneeChoice] = useState('');

  const canManageAny = hasPermission(user, 'actions.assign');
  const isOwnItem = Boolean(item?.assignedUserId && user?.id === item.assignedUserId);
  const canProgressOrResolve = canManageAny || isOwnItem;
  const canTakeOwnership = !canManageAny && !item?.assignedUserId && hasPermission(user, 'actions.resolve');

  const { data: eligibleAssignees } = useEligibleAssignees(id, isOpen && canManageAny);

  const takeOwnershipMutation = useTakeOwnership();
  const assignMutation = useAssignActionItem();
  const setStatusMutation = useSetActionItemStatus();
  const resolveMutation = useResolveActionItem();

  const transcript = useInteractionTranscript(item?.sourceInteractionId, { enabled: isOpen && showTranscript });
  const conversationEntries: ConversationEntry[] = useMemo(
    () =>
      (transcript.data?.transcript ?? []).map((entry, index) => ({
        key: index,
        speakerLabel: entry.speaker === 'ai' ? 'AI Agent' : entry.speaker === 'user' ? 'Customer' : entry.speaker,
        speakerClassName: entry.speaker === 'ai' ? 'text-cyan-600 dark:text-cyan-400' : 'text-foreground',
        timestamp: entry.timestamp,
        text: entry.text,
      })),
    [transcript.data],
  );

  const agentLabel = (agentId: string | null) => {
    if (!agentId) return 'Unknown agent';
    return agentRoster.find((a) => a.agentId === agentId)?.displayName ?? agentId;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Action Required
            {item && statusBadge(item.status)}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !item ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <SectionCard title="Context">
              <div className="text-sm text-foreground">{agentLabel(item.agentId)}</div>
              <div className="text-xs text-muted-foreground">Reason: {actionItemReasonText(item)}</div>
              <div className="text-xs text-muted-foreground">Opened {formatTimestamp(item.createdAt)}</div>
            </SectionCard>

            <SectionCard
              title="Underlying Call"
              action={
                <button
                  type="button"
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                  onClick={() => setShowTranscript((v) => !v)}
                >
                  {showTranscript ? 'Hide transcript' : 'View transcript'}
                </button>
              }
            >
              {showTranscript && (
                <ConversationTranscript
                  entries={conversationEntries}
                  searchTerm=""
                  onSearchTermChange={() => {}}
                  isLoading={transcript.isLoading}
                  isError={transcript.isError}
                  onRetry={() => void transcript.refetch()}
                  emptyLabel="No transcript available for this call."
                />
              )}
            </SectionCard>

            <SectionCard title="Ownership">
              <div className="text-sm text-foreground">{item.assignedDisplayName ?? item.assignedEmail ?? 'Unassigned'}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                {canTakeOwnership && (
                  <Button size="sm" variant="outline" disabled={takeOwnershipMutation.isPending} onClick={() => takeOwnershipMutation.mutate(item.id)}>
                    Take ownership
                  </Button>
                )}
                {canManageAny && (
                  <div className="flex items-center gap-2">
                    <Select value={assigneeChoice} onValueChange={setAssigneeChoice}>
                      <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                      <SelectContent>
                        {(eligibleAssignees ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.displayName ?? a.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!assigneeChoice || assignMutation.isPending}
                      onClick={() => assignMutation.mutate({ id: item.id, assigneeUserId: assigneeChoice })}
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>

            {item.status !== 'resolved' && (
              <SectionCard title="Status">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canProgressOrResolve || item.status === 'in_progress' || setStatusMutation.isPending}
                    onClick={() => setStatusMutation.mutate({ id: item.id, status: 'in_progress' })}
                  >
                    Move to In Progress
                  </Button>
                </div>

                {canProgressOrResolve && (
                  <div className="space-y-2 pt-2">
                    <Select value={resolutionCode} onValueChange={(v) => setResolutionCode(v as NonNullable<ActionItem['resolutionCode']>)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Resolution code…" /></SelectTrigger>
                      <SelectContent>
                        {RESOLUTION_CODES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Resolution note…"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <Button
                      size="sm"
                      disabled={!resolutionCode || !resolutionNote.trim() || resolveMutation.isPending}
                      onClick={() =>
                        resolutionCode &&
                        resolveMutation.mutate({ id: item.id, resolutionCode, resolutionNote: resolutionNote.trim() }, { onSuccess: onClose })
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                )}
              </SectionCard>
            )}

            {item.status === 'resolved' && (
              <SectionCard title="Resolution">
                <div className="text-sm text-foreground">{RESOLUTION_CODES.find((c) => c.value === item.resolutionCode)?.label ?? item.resolutionCode}</div>
                <div className="text-xs text-muted-foreground">{item.resolutionNote}</div>
                <div className="text-xs text-muted-foreground">Resolved {formatTimestamp(item.resolvedAt ?? undefined)}</div>
              </SectionCard>
            )}

            <div className="pt-1">
              <Button size="sm" variant="ghost" onClick={() => guardedNavigate('/call-logs', undefined, 'calls.view', 'Call Logs')}>
                Open Call Logs
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
