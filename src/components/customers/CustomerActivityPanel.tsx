import React, { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Link2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomerActivities } from '@/hooks/customers/useCustomerActivities';
import { useUpdateCustomerActivityStatus } from '@/hooks/customers/useUpdateCustomerActivityStatus';
import { ActivityComposerDialog } from '@/components/customers/ActivityComposerDialog';
import { formatStatusLabel, formatTimestamp } from '@/lib/format';
import { isApiError } from '@/services/transport/errors';
import type { ActivityStatus, ActivityType, CustomerActivityRow, CustomerInteractionRow } from '@/types/customer';

/**
 * Session 13.1 (DEC-CUST-02) / 13.1.1 — Customer Activity/Diary. Closes
 * the audited gap where the backend (customer_activities table, the
 * `GET/POST/PATCH ?action=activities` API, and the repository layer)
 * was fully built with zero frontend consumer. A lightweight operational
 * diary only — not a CRM/ticketing/workflow engine: no assignment UI, no
 * workflow states beyond what the schema's own check constraint already
 * defines, no deletion (the audit confirmed no delete capability exists
 * at any layer — see the session doc).
 *
 * Session 13.1.1 — converted from large activity cards to a compact
 * grid (Type / Activity / Created / Due / Status), bounded to ~5 visible
 * rows with its own internal scroll, so this section no longer grows
 * unbounded with activity count or competes for vertical space with
 * Interaction History right below it.
 */

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

/** Max body height ≈ 5 compact rows (h-9 each) before the grid scrolls internally rather than growing the page. */
const GRID_MAX_HEIGHT = '14.5rem';

const ActivityGridRow: React.FC<{
  activity: CustomerActivityRow;
  customerId: string;
  linkedInteraction?: CustomerInteractionRow;
  onOpenInteraction?: (interactionId: string, channel: string) => void;
}> = ({ activity, customerId, linkedInteraction, onOpenInteraction }) => {
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

  // Session 13.1.1 (addendum §5/§7) — provenance is a compact, optional
  // indicator only: resolved client-side from the same Interaction
  // History data already loaded on this page (no new network call, no
  // raw UUID shown). When the linked interaction isn't in the currently
  // loaded set, the activity's own real interactionId is still retained
  // (it reached the backend at creation time) but no unverified
  // channel/time is guessed for display.
  const provenanceTitle = linkedInteraction
    ? [
        linkedInteraction.channel ? formatStatusLabel(linkedInteraction.channel) : null,
        formatTimestamp(linkedInteraction.startedAt),
        linkedInteraction.agentDisplayName ?? linkedInteraction.agentId,
      ]
        .filter(Boolean)
        .join(' • ')
    : 'Linked interaction';

  return (
    <tr className="border-b border-border/60 last:border-0 h-9 align-middle">
      <td className="py-1 px-2 whitespace-nowrap">
        <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">
          {formatStatusLabel(activity.activityType)}
        </Badge>
      </td>
      <td className="py-1 px-2 min-w-0 max-w-[18rem]">
        <span className="inline-flex items-center gap-1 min-w-0">
          {activity.interactionId && (
            <button
              type="button"
              title={linkedInteraction ? provenanceTitle : 'Linked interaction not currently loaded'}
              aria-label={linkedInteraction ? `Linked interaction: ${provenanceTitle}` : 'Linked interaction not currently loaded'}
              className="flex-shrink-0 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
              disabled={!linkedInteraction}
              // Drill-through needs the EXTERNAL call_sid/session_id
              // (linkedInteraction.interactionId) that Call/Chat Detail
              // lookups use — activity.interactionId is the internal
              // customer_interactions.id the FK requires, a different
              // value (see ActivityComposerDialog.tsx's submit comment).
              onClick={() => linkedInteraction && onOpenInteraction?.(linkedInteraction.interactionId, linkedInteraction.channel)}
            >
              <Link2 className="h-3 w-3" />
            </button>
          )}
          <span className="truncate text-foreground" title={activity.title ? `${activity.title} — ${activity.body}` : activity.body}>
            {activity.title ?? activity.body}
          </span>
        </span>
      </td>
      <td className="py-1 px-2 whitespace-nowrap text-muted-foreground text-xs">{formatTimestamp(activity.createdAt)}</td>
      <td className="py-1 px-2 whitespace-nowrap text-muted-foreground text-xs">
        {activity.dueAt ? formatTimestamp(activity.dueAt) : '—'}
      </td>
      <td className="py-1 px-2 whitespace-nowrap">
        {statusOptions.length > 0 ? (
          <Select
            value={activity.status}
            onValueChange={(v) => void handleStatusChange(v as ActivityStatus)}
            disabled={updateMutation.isPending}
          >
            <SelectTrigger
              className="h-6 text-[11px] w-28"
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
        ) : (
          <Badge variant={statusBadgeVariant(activity.status)} className="text-[10px] py-0 px-1">
            {formatStatusLabel(activity.status)}
          </Badge>
        )}
      </td>
    </tr>
  );
};

export const CustomerActivityPanel: React.FC<{
  customerId: string;
  /** Session 13.1.1 — the already-loaded Interaction History rows, keyed by interactionId, used only to resolve a compact provenance label (channel/time/agent) for activities created from an interaction. No new fetch. */
  interactionsById?: Map<string, CustomerInteractionRow>;
  onOpenInteraction?: (interactionId: string, channel: string) => void;
}> = ({ customerId, interactionsById, onOpenInteraction }) => {
  // Session 13.1 follow-up — collapsed by default so this section doesn't
  // compete for space with Interaction History right below it; the header
  // itself (always visible) still surfaces the count so its presence and
  // contents are discoverable without expanding.
  const [expanded, setExpanded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const { data, isLoading, isError } = useCustomerActivities(customerId);
  const activities = data?.data ?? [];

  // Auto-expand whenever a new activity appears (created either from
  // this panel's own "Add activity" or from an Interaction History row's
  // "+ Activity" — both invalidate the same query, so this covers both
  // origins uniformly without lifting expand/collapse state out of this
  // component).
  const prevCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isLoading && !isError) {
      if (prevCountRef.current !== null && activities.length > prevCountRef.current) {
        setExpanded(true);
      }
      prevCountRef.current = activities.length;
    }
  }, [activities.length, isLoading, isError]);

  return (
    <div className="space-y-1.5">
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
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-border bg-transparent text-foreground hover:bg-muted"
          onClick={() => setComposerOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add activity
        </Button>
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
          <div className="rounded-md border border-border overflow-auto" style={{ maxHeight: GRID_MAX_HEIGHT }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                  <th className="h-7 px-2 font-medium rounded-tl-md">Type</th>
                  <th className="h-7 px-2 font-medium">Activity</th>
                  <th className="h-7 px-2 font-medium whitespace-nowrap">Created</th>
                  <th className="h-7 px-2 font-medium whitespace-nowrap">Due / Scheduled</th>
                  <th className="h-7 px-2 font-medium rounded-tr-md">Status</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <ActivityGridRow
                    key={a.id}
                    activity={a}
                    customerId={customerId}
                    linkedInteraction={a.interactionId ? interactionsById?.get(a.interactionId) : undefined}
                    onOpenInteraction={onOpenInteraction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ActivityComposerDialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        customerId={customerId}
      />
    </div>
  );
};
