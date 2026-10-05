import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import type { AgentSummary } from '@/services/agents/agentsMapper';
import { useActionItems } from '@/hooks/actions/useActions';
import { actionItemReasonText, type ActionItem } from '@/services/actions/actionsService';
import { formatStaleDurationHuman } from '@/lib/format';
import { DASHBOARD_ORIGIN_STATE } from '@/lib/dashboardNavigation';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate';
import { typography } from '@/lib/typography';
import { ActionItemDetailDialog } from './ActionItemDetailDialog';

const DEFAULT_VISIBLE = 5;

function ageSeconds(createdAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000));
}

function statusBadge(status: ActionItem['status']) {
  if (status === 'in_progress') return <Badge variant="secondary" className="whitespace-nowrap text-xs">In Progress</Badge>;
  if (status === 'resolved') return <Badge variant="positive" className="whitespace-nowrap text-xs">Resolved</Badge>;
  return <Badge variant="escalated" className="whitespace-nowrap text-xs">Open</Badge>;
}

/**
 * Session 15 — replaces the previous client-side, unpersisted "Needs
 * Attention" computation (classifyAttention). Reads real, persisted,
 * server-scope-filtered rows from the Action Required work-item queue
 * instead of recomputing a classification from the raw interaction list
 * on every render. Only escalated-call items exist in v1 (see the
 * migration header / session doc) — stale-active calls remain the
 * Dashboard's own unrelated indicator, unchanged.
 */
export const ActionRequiredCard: React.FC<{ agentRoster: AgentSummary[] }> = ({ agentRoster }) => {
  const guardedNavigate = useGuardedNavigate();
  const { data, isLoading, isError, refetch } = useActionItems('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  const visible = items.slice(0, DEFAULT_VISIBLE);

  const agentLabel = (agentId: string | null) => {
    if (!agentId) return 'Unknown agent';
    return agentRoster.find((a) => a.agentId === agentId)?.displayName ?? agentId;
  };

  return (
    <>
      {/* VoiceForce design system (Phase 2C) — a plain div matching
          AgentActivityPanel/Dashboard's Recent Interactions box recipe
          (rounded-md border border-border bg-card p-3), not the shadcn
          Card's rounded-lg/shadow-sm — same single operational-card
          treatment used by the full Action Required queue page's own
          item list, so the two surfaces feel like one consistent
          containment convention instead of two different container
          styles for the same data. */}
      <div className="rounded-md border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className={typography.cardTitle}>
            Action Required{items.length > 0 ? ` (${items.length})` : ''}
          </div>
          {items.length > DEFAULT_VISIBLE && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
              onClick={() => guardedNavigate('/action-required', { state: DASHBOARD_ORIGIN_STATE }, 'actions.view', 'Action Required')}
            >
              View all &rarr; Action Required
            </button>
          )}
        </div>
        <div>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="py-2 text-sm text-muted-foreground">
              Could not load Action Required.{' '}
              <button type="button" className="text-cyan-600 dark:text-cyan-400 hover:underline" onClick={() => refetch()}>Retry</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">No open action items.</p>
          ) : (
            <>
              <div className="hidden sm:grid sm:[grid-template-columns:minmax(0,22rem)_minmax(7rem,12rem)_minmax(6rem,8rem)_minmax(3.5rem,4.5rem)] sm:gap-2 items-center px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                <span>Context / Reason</span>
                <span>Owner</span>
                <span>Status</span>
                <span className="text-right">Age</span>
              </div>
              <div className="divide-y divide-border/60">
                {visible.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(0,22rem)_minmax(7rem,12rem)_minmax(6rem,8rem)_minmax(3.5rem,4.5rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="font-medium text-foreground truncate text-sm">{agentLabel(item.agentId)}</span>
                      <span className="text-xs text-muted-foreground truncate">Reason: {actionItemReasonText(item)}</span>
                    </div>
                    <div className="hidden sm:block min-w-0 text-xs text-muted-foreground truncate">
                      {item.assignedDisplayName ?? item.assignedEmail ?? 'Unassigned'}
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:contents">
                      {statusBadge(item.status)}
                      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:text-right">
                        {formatStaleDurationHuman(ageSeconds(item.createdAt))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ActionItemDetailDialog
        id={selectedId}
        isOpen={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        agentRoster={agentRoster}
      />
    </>
  );
};
