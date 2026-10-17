import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { typography } from '@/lib/typography';
import { CMA_SYNC_STATUS_BADGE, CMA_SYNC_STATUS_LABEL, type CmaSyncDisplayStatus } from '@/lib/cmaSyncStatusBadge';
import { useCmaSyncStatus, useStartCmaSync } from '@/hooks/cma/useCmaSync';
import type { CmaSyncRun } from '@/services/cma/cmaSyncService';

/**
 * CMA Synchronization — Manual UI Control. Replaces the originally-
 * planned 5-minute Vercel Cron polling, abandoned because this team's
 * confirmed Hobby plan only supports daily cron. Reuses the existing
 * `cmaPoll` window-based synchronization logic server-side
 * (src/server/cma/cmaSyncRun.ts -> runCmaPollingTick) — this component
 * only triggers it and displays the persisted run log.
 */

function displayStatus(run: CmaSyncRun | null): CmaSyncDisplayStatus {
  if (!run) return 'neverRun';
  return run.status;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(run: CmaSyncRun): string {
  if (!run.finishedAt) return run.status === 'running' ? 'In progress…' : '—';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const CmaSyncPanel: React.FC = () => {
  const { data, isLoading } = useCmaSyncStatus();
  const startSync = useStartCmaSync();
  const [lookbackHours, setLookbackHours] = useState('');

  const latest = data?.latest ?? null;
  const status = displayStatus(latest);
  const isRunning = status === 'running';

  const handleSyncNow = () => {
    const parsed = lookbackHours.trim() === '' ? undefined : Number(lookbackHours);
    startSync.mutate(Number.isFinite(parsed as number) ? parsed : undefined);
  };

  const lastSuccessful = data?.history.find((r) => r.status === 'success') ?? null;

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Label className="text-xs text-foreground">CMA Synchronization</Label>
        </div>
        {isLoading ? (
          <Badge variant="outline" className={CMA_SYNC_STATUS_BADGE.neverRun}>
            Loading…
          </Badge>
        ) : (
          <Badge variant="outline" className={CMA_SYNC_STATUS_BADGE[status]}>
            {CMA_SYNC_STATUS_LABEL[status]}
          </Badge>
        )}
      </div>
      <p className={typography.bodySecondary}>
        Manually synchronize Call and Chat interactions into the CMA Base Facts table. Replaces scheduled polling,
        which this deployment's plan does not support at the required frequency.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={typography.metadata}>Last successful sync</p>
          <p className={typography.bodySecondary}>{formatDateTime(lastSuccessful?.finishedAt ?? null)}</p>
        </div>
        <div>
          <p className={typography.metadata}>Last attempted sync</p>
          <p className={typography.bodySecondary}>{formatDateTime(latest?.startedAt ?? null)}</p>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
          <div>
            <p className={typography.metadata}>Calls — processed / added / updated / failed</p>
            <p className={typography.bodySecondary}>
              {latest.calls.processed} / {latest.calls.inserted} / {latest.calls.updated} / {latest.calls.failed}
            </p>
          </div>
          <div>
            <p className={typography.metadata}>Chats — processed / added / updated / failed</p>
            <p className={typography.bodySecondary}>
              {latest.chats.processed} / {latest.chats.inserted} / {latest.chats.updated} / {latest.chats.failed}
            </p>
          </div>
          <div>
            <p className={typography.metadata}>Duration</p>
            <p className={typography.bodySecondary}>{formatDuration(latest)}</p>
          </div>
          <div>
            <p className={typography.metadata}>Window</p>
            <p className={typography.bodySecondary}>
              {formatDateTime(latest.windowStartedFrom)} → {formatDateTime(latest.windowStartedTo)}
            </p>
          </div>
          {latest.errorDetail && (
            <div className="col-span-2">
              <p className={typography.metadata}>Error details</p>
              <p className="text-xs text-[var(--status-negative-text)]">{latest.errorDetail}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cma-sync-lookback" className={typography.bodySecondary}>
            Lookback override (hours, optional)
          </Label>
          <Input
            id="cma-sync-lookback"
            uiSize="sm"
            type="number"
            min="0"
            placeholder="Default: since last success"
            value={lookbackHours}
            onChange={(e) => setLookbackHours(e.target.value)}
            className="w-56 border-border bg-card text-foreground"
            disabled={isRunning}
          />
        </div>
        <Button
          size="sm"
          className="h-8 bg-cyan-600 hover:bg-cyan-500"
          onClick={handleSyncNow}
          disabled={isRunning || startSync.isPending || isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Syncing…' : 'Sync Now'}
        </Button>
      </div>
      {startSync.data?.alreadyRunning && (
        <p className={typography.bodySecondary}>A synchronization is already running — showing its live progress above.</p>
      )}

      {data && data.history.length > 0 && (
        <div className="space-y-1.5">
          <p className={typography.metadata}>Last {data.history.length} runs</p>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Started</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Calls</TableHead>
                  <TableHead className="text-xs">Chats</TableHead>
                  <TableHead className="text-xs">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs">{formatDateTime(run.startedAt)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={CMA_SYNC_STATUS_BADGE[run.status]}>
                        {CMA_SYNC_STATUS_LABEL[run.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {run.calls.processed} ({run.calls.failed} failed)
                    </TableCell>
                    <TableCell className="text-xs">
                      {run.chats.processed} ({run.chats.failed} failed)
                    </TableCell>
                    <TableCell className="text-xs">{formatDuration(run)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};
