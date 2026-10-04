import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAgents } from '@/hooks/agents/useAgents';
import { useActionItems, useGenerateActionItems } from '@/hooks/actions/useActions';
import { actionItemReasonText, type ActionItem, type ActionItemStatus } from '@/services/actions/actionsService';
import { formatStaleDurationHuman, formatTimestamp } from '@/lib/format';
import { resolveDetailOrigin, type DetailNavigationState } from '@/lib/detailOrigin';
import { useNavigate } from 'react-router-dom';
import { ActionItemDetailDialog } from '@/components/actions/ActionItemDetailDialog';

function statusBadge(status: ActionItem['status']) {
  if (status === 'in_progress') return <Badge variant="secondary" className="text-xs">In Progress</Badge>;
  if (status === 'resolved') return <Badge variant="positive" className="text-xs">Resolved</Badge>;
  return <Badge variant="escalated" className="text-xs">Open</Badge>;
}

function ageSeconds(createdAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000));
}

/**
 * Session 15 — the full Action Required queue ("View all" destination
 * from the Dashboard card). Resolved items disappear from the default
 * Open tab but are retained in the Resolved (history) tab — never
 * deleted, per the brief's history requirement.
 */
const ActionRequired: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<ActionItemStatus>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const agents = useAgents();
  const agentRoster = useMemo(() => agents.data?.agents ?? [], [agents.data]);

  const { data, isLoading, isError, refetch } = useActionItems(tab);
  const items = data ?? [];
  const generateMutation = useGenerateActionItems();

  const origin = resolveDetailOrigin((location.state as DetailNavigationState | null)?.origin, 'action-required');

  const agentLabel = (agentId: string | null) => {
    if (!agentId) return 'Unknown agent';
    return agentRoster.find((a) => a.agentId === agentId)?.displayName ?? agentId;
  };

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern A: root fills Layout's main height as a flex column;
          header/tab-list stay flex-shrink-0; the item list is the single
          flex-1 min-h-0 overflow-auto region. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-foreground">Action Required</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Human follow-up work items generated from escalated calls, within your Business Data Scope.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={generateMutation.isPending}
              onClick={() =>
                generateMutation.mutate(undefined, {
                  onSuccess: (result) => toast.success(`Checked for new escalations — ${result.created} new, ${result.skipped} already tracked.`),
                  onError: () => toast.error('Could not check for new escalations.'),
                })
              }
            >
              {generateMutation.isPending ? 'Checking…' : 'Check for new escalations'}
            </Button>
            {origin.path !== '/action-required' && (
              <button
                type="button"
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                onClick={() => navigate(origin.path)}
              >
                &larr; Back to {origin.label}
              </button>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ActionItemStatus)} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-2 flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="py-4 text-sm text-muted-foreground">
                Could not load Action Required items.{' '}
                <button type="button" className="text-cyan-600 dark:text-cyan-400 hover:underline" onClick={() => refetch()}>Retry</button>
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No {tab.replace('_', ' ')} items.</p>
            ) : (
              <div className="rounded-md border border-border bg-card divide-y divide-border/60">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(0,24rem)_minmax(8rem,14rem)_minmax(6rem,8rem)_minmax(4rem,5rem)] sm:items-center sm:gap-3 p-3 text-left hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="font-medium text-foreground truncate text-sm">{agentLabel(item.agentId)}</span>
                      <span className="text-xs text-muted-foreground truncate">Reason: {actionItemReasonText(item)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{item.assignedDisplayName ?? item.assignedEmail ?? 'Unassigned'}</div>
                    <div>{statusBadge(item.status)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums sm:text-right" title={formatTimestamp(item.createdAt)}>
                      {formatStaleDurationHuman(ageSeconds(item.createdAt))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ActionItemDetailDialog id={selectedId} isOpen={Boolean(selectedId)} onClose={() => setSelectedId(null)} agentRoster={agentRoster} />
    </Layout>
  );
};

export default ActionRequired;
