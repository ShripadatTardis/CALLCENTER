import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateCustomerActivity } from '@/hooks/customers/useCreateCustomerActivity';
import { formatStatusLabel, formatTimestamp } from '@/lib/format';
import { isApiError } from '@/services/transport/errors';
import type { ActivityType } from '@/types/customer';
import type { CustomerInteractionRow } from '@/types/customer';

/**
 * Session 13.1.1 — single, shared Activity creation UI, reused by both
 * Customer-level "Add activity" and Interaction History's row-level
 * "+ Activity" action (addendum §6: "use the same Activity form/
 * component", not two independent implementations).
 *
 * Horizontal entry layout (addendum §2): type selector, title,
 * description, due/scheduled (only when the selected type has one),
 * save — wrapping responsively rather than stacking by default.
 *
 * When opened with `interactionContext` (addendum §3/§5): the real,
 * stable `interactionId` is bound automatically — no second phone/time
 * heuristic lookup, no re-entry of customer/interaction identity. A
 * compact read-only context strip is shown built only from fields the
 * selected interaction genuinely has; Description remains pure
 * user-entered content and is never auto-populated from interaction
 * attributes (addendum §4).
 */

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'task', label: 'Task' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'appointment', label: 'Appointment' },
];

function interactionContextLabel(row: CustomerInteractionRow): string {
  return [
    row.channel ? formatStatusLabel(row.channel) : null,
    row.direction ? formatStatusLabel(row.direction) : null,
    formatTimestamp(row.startedAt),
    row.agentDisplayName ?? row.agentId,
    row.intent,
    row.outcome ? formatStatusLabel(row.outcome) : null,
  ]
    .filter((p): p is string => Boolean(p))
    .join(' • ');
}

interface ActivityComposerDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  /** Present only when opened from an Interaction History row (addendum §3). Null/absent for the Customer-level "Add activity" entry point (addendum §6). */
  interactionContext?: CustomerInteractionRow | null;
}

export const ActivityComposerDialog: React.FC<ActivityComposerDialogProps> = ({
  open,
  onClose,
  customerId,
  interactionContext,
}) => {
  const { user } = useAuth();
  const [activityType, setActivityType] = useState<ActivityType>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const createMutation = useCreateCustomerActivity(customerId);

  const needsDueAt = activityType === 'task' || activityType === 'reminder' || activityType === 'appointment';

  const reset = () => {
    setActivityType('note');
    setTitle('');
    setBody('');
    setDueAt('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!body.trim()) {
      toast.error('Activity content is required');
      return;
    }
    try {
      await createMutation.mutateAsync({
        activityType,
        title: title.trim() ? title.trim() : null,
        body: body.trim(),
        dueAt: needsDueAt && dueAt ? new Date(dueAt).toISOString() : null,
        createdBy: user?.name ?? null,
        // `customer_activities.interaction_id` has a foreign key onto
        // `customer_interactions.id` (the internal row, confirmed live
        // via a 500 error during Session 13.1.1 verification) — NOT the
        // external call_sid/session_id `interactionContext.interactionId`
        // that Call/Chat Detail lookups use. Use the internal row id.
        interactionId: interactionContext?.id ?? null,
      });
      toast.success('Activity added');
      reset();
      onClose();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not add activity');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Add Activity</DialogTitle>
        </DialogHeader>

        {interactionContext && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Linked interaction:</span> {interactionContextLabel(interactionContext)}
          </div>
        )}

        <div className="space-y-3">
          <ToggleGroup
            type="single"
            value={activityType}
            onValueChange={(v) => v && setActivityType(v as ActivityType)}
            className="flex flex-wrap justify-start gap-1.5"
            aria-label="Activity type"
          >
            {ACTIVITY_TYPES.map((t) => (
              <ToggleGroupItem
                key={t.value}
                value={t.value}
                aria-label={t.label}
                className="h-8 px-3 text-xs border border-border bg-card text-foreground data-[state=on]:bg-cyan-600 data-[state=on]:text-white data-[state=on]:border-cyan-600"
              >
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex flex-wrap gap-2 items-start">
            <Input
              placeholder="Title (optional)"
              aria-label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-xs flex-1 min-w-[10rem]"
            />
            {needsDueAt && (
              <Input
                type="datetime-local"
                aria-label="Due date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-8 text-xs w-56"
              />
            )}
          </div>

          <Textarea
            placeholder={activityType === 'instruction' ? 'Instruction for agents handling this customer…' : 'Details…'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="text-xs min-h-16"
          />

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleSubmit()}
              disabled={createMutation.isPending || !body.trim()}
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
