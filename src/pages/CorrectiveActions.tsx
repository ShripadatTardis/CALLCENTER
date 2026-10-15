import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { typography } from '@/lib/typography';
import { formatTimestamp } from '@/lib/format';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import {
  CorrectiveActionStatusBadge,
  CorrectiveActionPriorityBadge,
} from '@/components/correctiveActions/correctiveActionStatus';
import { CreateCorrectiveActionDialog } from '@/components/correctiveActions/CreateCorrectiveActionDialog';
import { CorrectiveActionDetailDialog } from '@/components/correctiveActions/CorrectiveActionDetailDialog';
import { CorrectiveActionGroupDialog } from '@/components/correctiveActions/CorrectiveActionGroupDialog';
import { CreateCorrectiveActionGroupDialog } from '@/components/correctiveActions/CreateCorrectiveActionGroupDialog';
import { useCorrectiveActions, useLinkCorrectiveActionsToGroup } from '@/hooks/correctiveActions/useCorrectiveActions';
import { formatCaNumber, type CorrectiveActionGroup, type CorrectiveActionListFilters, type CorrectiveActionStatus } from '@/services/correctiveActions/correctiveActionsService';

const STATUS_TABS: Array<{ value: CorrectiveActionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Session 16.5 — the Corrective Action register (brief §11). Operationally
 * dense: reuses the same table/row/badge/viewport-framing conventions as
 * Action Required / Call Logs (Pattern A — root fills Layout height,
 * header/filters stay flex-shrink-0, the row list is the single
 * flex-1 min-h-0 overflow-auto region) rather than introducing a new
 * table component.
 */
const CorrectiveActions: React.FC = () => {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'corrective_actions.create');
  const canLink = hasPermission(user, 'corrective_actions.link');

  const [tab, setTab] = useState<CorrectiveActionStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [groupDialogId, setGroupDialogId] = useState<string | null>(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);

  const filters: CorrectiveActionListFilters = useMemo(() => ({
    status: tab === 'all' ? undefined : tab,
    priority: priorityFilter === 'all' ? undefined : (priorityFilter as CorrectiveActionListFilters['priority']),
    category: categoryFilter === 'all' ? undefined : (categoryFilter as CorrectiveActionListFilters['category']),
    search: search.trim() || undefined,
  }), [tab, priorityFilter, categoryFilter, search]);

  const { data, isLoading, isError, refetch } = useCorrectiveActions(filters);
  const items = data ?? [];

  const linkMutation = useLinkCorrectiveActionsToGroup();

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateGroupFromSelection = () => {
    if (selectedIds.size < 2) return;
    setGroupCreateOpen(true);
  };

  const handleGroupCreated = (group: CorrectiveActionGroup) => {
    const count = selectedIds.size;
    linkMutation.mutate(
      { groupId: group.id, caIds: Array.from(selectedIds) },
      {
        onSuccess: () => {
          toast.success(`Linked ${count} corrective actions to a new group.`);
          setSelectedIds(new Set());
          setGroupDialogId(group.id);
        },
        onError: () => toast.error('Group created, but linking the selected corrective actions failed.'),
      },
    );
  };

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-shrink-0 gap-3">
          <div>
            <h1 className={typography.pageTitle}>Corrective Actions</h1>
            <p className={`${typography.pageDescription} mt-0.5`}>Source-independent corrective action register — raised manually or from a QA finding, within your Business Data Scope.</p>
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>New Corrective Action</Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${tab === t.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description, CA number…" className="h-8 w-56 text-xs" />
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any category</SelectItem>
                <SelectItem value="agent_behavior">Agent Behaviour</SelectItem>
                <SelectItem value="knowledge_base">Knowledge Base</SelectItem>
                <SelectItem value="campaign_configuration">Campaign Configuration</SelectItem>
                <SelectItem value="process">Process</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {canLink && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0 rounded-md border border-border bg-muted/30 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selectedIds.size < 2} onClick={handleCreateGroupFromSelection}>
              Create Group from Selection
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-4 text-sm text-muted-foreground">
              Could not load corrective actions.{' '}
              <button type="button" className="text-cyan-600 dark:text-cyan-400 hover:underline" onClick={() => refetch()}>Retry</button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No corrective actions match the current filters.</p>
          ) : (
            <div className="rounded-md border border-border bg-card divide-y divide-border/60">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/40"
                >
                  {canLink && (
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} className="h-3.5 w-3.5" aria-label={`Select ${formatCaNumber(item.caNumber)}`} />
                  )}
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setDetailId(item.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">{formatCaNumber(item.caNumber)}</span>
                      <span className="font-medium text-foreground truncate text-sm">{item.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{item.assignedToName ?? 'Unassigned'} · {item.category.replace(/_/g, ' ')}</div>
                  </button>
                  <CorrectiveActionPriorityBadge priority={item.priority} />
                  <CorrectiveActionStatusBadge status={item.status} />
                  <div className="text-xs text-muted-foreground tabular-nums w-24 text-right" title={formatTimestamp(item.createdAt)}>
                    {formatTimestamp(item.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateCorrectiveActionDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => setDetailId(id)} />
      <CorrectiveActionDetailDialog id={detailId} isOpen={Boolean(detailId)} onClose={() => setDetailId(null)} onOpenGroup={(groupId) => { setDetailId(null); setGroupDialogId(groupId); }} />
      <CorrectiveActionGroupDialog groupId={groupDialogId} isOpen={Boolean(groupDialogId)} onClose={() => setGroupDialogId(null)} onOpenCa={(id) => { setGroupDialogId(null); setDetailId(id); }} />
      <CreateCorrectiveActionGroupDialog isOpen={groupCreateOpen} onClose={() => setGroupCreateOpen(false)} onCreated={handleGroupCreated} />
    </Layout>
  );
};

export default CorrectiveActions;
