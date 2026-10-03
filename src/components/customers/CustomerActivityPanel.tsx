import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerActivities } from '@/hooks/customers/useCustomerActivities';
import { useCreateCustomerActivity } from '@/hooks/customers/useCreateCustomerActivity';
import { useUpdateCustomerActivityStatus } from '@/hooks/customers/useUpdateCustomerActivityStatus';
import { formatStatusLabel, formatTimestamp } from '@/lib/format';
import { isApiError } from '@/services/transport/errors';
import type { ActivityStatus, ActivityType, CustomerActivityRow } from '@/types/customer';

/**
 * Session 13.1 (DEC-CUST-02) — Customer Activity/Diary. Closes the
 * audited gap where the backend (customer_activities table, the
 * `GET/POST ?action=activities` API, and the repository layer) was
 * fully built with zero frontend consumer. A lightweight operational
 * diary only — not a CRM/ticketing/workflow engine (plan §4): no
 * assignment UI, no workflow states beyond what the schema's own check
 * constraint already defines, no deletion (the audit confirmed no
 * delete capability exists at any layer — see the session doc).
 */

const ACTIVITY_TYPES: ActivityType[] = ['note', 'instruction', 'task', 'reminder', 'appointment'];

/** Mirrors api/customers/[id]/index.ts's ACTIVITY_STATUSES_BY_TYPE exactly — the frontend never offers a transition the backend would reject. */
const STATUS_OPTIONS_BY_TYPE: Record<ActivityType, ActivityStatus[]> = {
  note: [],
  instruction: ['active', 'inactive'],
  task: ['open', 'completed', 'cancelled'],
  reminder: ['open', 'completed', 'cancelled'],
  appointment: ['open', 'completed', 'cancelled'],
};

function statusBadgeVariant(status: ActivityStatus): 'positive' | 'secondary' | 'outline' | 'escalated' {
  if (status === 'completed' || status === 'active') return 'positive';
  if (status === 'cancelled' || status === 'inactive') return 'secondary';
  return 'outline';
}

const NewActivityForm: React.FC<{ customerId: string; onCreated: () => void }> = ({ customerId, onCreated }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
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
      });
      toast.success('Activity added');
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not add activity');
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-7 text-xs border-border bg-transparent text-foreground hover:bg-muted" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add activity
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
      <div className="flex gap-2">
        <Select value={activityType} onValueChange={(v) => setActivityType(v as ActivityType)}>
          <SelectTrigger className="h-8 text-xs w-36" aria-label="Activity type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {formatStatusLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 text-xs flex-1"
        />
      </div>
      <Textarea
        placeholder={activityType === 'instruction' ? 'Instruction for agents handling this customer…' : 'Details…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs min-h-16"
      />
      {needsDueAt && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Due</span>
          <Input
            type="datetime-local"
            aria-label="Due date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-8 text-xs w-56"
          />
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
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
  );
};

const ActivityRow: React.FC<{ activity: CustomerActivityRow; customerId: string }> = ({ activity, customerId }) => {
  const updateMutation = useUpdateCustomerActivityStatus(customerId);
  const statusOptions = STATUS_OPTIONS_BY_TYPE[activity.activityType];

  const handleStatusChange = async (status: ActivityStatus) => {
    try {
      await updateMutation.mutateAsync({ activityId: activity.id, activityType: activity.activityType, status });
      toast.success('Activity updated');
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not update activity status');
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">
            {formatStatusLabel(activity.activityType)}
          </Badge>
          <Badge variant={statusBadgeVariant(activity.status)} className="text-[10px] py-0 px-1">
            {formatStatusLabel(activity.status)}
          </Badge>
          {activity.title && <span className="text-sm font-medium text-foreground">{activity.title}</span>}
        </div>
        <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{activity.body}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span>{formatTimestamp(activity.createdAt)}</span>
          {activity.createdBy && <span>by {activity.createdBy}</span>}
          {activity.dueAt && <span>Due {formatTimestamp(activity.dueAt)}</span>}
          {activity.completedAt && <span>Completed {formatTimestamp(activity.completedAt)}</span>}
        </div>
      </div>
      {statusOptions.length > 0 && (
        <Select
          value={activity.status}
          onValueChange={(v) => void handleStatusChange(v as ActivityStatus)}
          disabled={updateMutation.isPending}
        >
          <SelectTrigger
            className="h-7 text-xs w-32 flex-shrink-0"
            aria-label={`Change status for ${activity.title ?? formatStatusLabel(activity.activityType)}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {formatStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

export const CustomerActivityPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
  // Session 13.1 follow-up — collapsed by default so this section doesn't
  // compete for space with Interaction History right below it; the header
  // itself (always visible) still surfaces the count so its presence and
  // contents are discoverable without expanding.
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError, refetch } = useCustomerActivities(customerId);
  const activities = data?.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 h-7 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="customer-activity-panel-body"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Activity / Diary
          {!isLoading && !isError && (
            <span className="normal-case font-normal text-muted-foreground">
              ({activities.length})
            </span>
          )}
        </button>
        <NewActivityForm customerId={customerId} onCreated={() => { setExpanded(true); void refetch(); }} />
      </div>
      <div id="customer-activity-panel-body">
      {!expanded ? null : isLoading ? (
        <div className="flex justify-center py-6" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading activities…</span>
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground px-1 py-2">Activity history is unavailable right now.</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1 py-2">No activities recorded for this customer yet.</p>
      ) : (
        <div className="rounded-md border border-border px-3">
          {activities.map((a) => (
            <ActivityRow key={a.id} activity={a} customerId={customerId} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
};
