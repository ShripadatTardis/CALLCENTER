import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RatioUnavailableState } from './RatioUnavailableState';
import { InteractionInspector } from './InteractionInspector';
import type { RatioInteractionsResponseDto } from '@/types/ratio';

/** Spec §4.6 — the filtered interaction list is the final aggregate level; selecting a row opens the right-side inspector without leaving the analytical page. Session R2: genuinely paginated over the real qualifying population (see src/server/analytics/ratioService.ts getRatioInteractions). */
export const InteractionTable: React.FC<{
  interactions: RatioInteractionsResponseDto | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
}> = ({ interactions, isLoading, page, onPageChange, onRetry }) => {
  const [openRow, setOpenRow] = useState<RatioInteractionsResponseDto['rows'][number] | null>(null);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!interactions) return null;

  const totalPages = interactions.pageSize > 0 ? Math.max(1, Math.ceil(interactions.totalCount / interactions.pageSize)) : 1;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-[13px] font-semibold text-foreground">Interactions</h2>
        {interactions.totalCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {interactions.totalCount.toLocaleString()} matching · page {interactions.page} of {totalPages}
          </span>
        )}
      </div>
      {interactions.populationCapped && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 px-0.5">
          The underlying population was capped before reaching all {interactions.trueTotalRecords?.toLocaleString()} matching records — this list reflects the first {interactions.totalCount.toLocaleString()} found, not the true total.
        </p>
      )}
      {!interactions.rows || interactions.rows.length === 0 ? (
        <RatioUnavailableState
          reason={interactions.unavailableReason ?? 'Interaction drill-down not yet instrumented.'}
          runtimeState={interactions.runtimeState}
          httpStatus={interactions.httpStatus}
          onRetry={onRetry}
          compact
        />
      ) : (
        <>
          <div className="overflow-x-auto border border-border rounded-md bg-card/40">
            <table className="w-full text-[13px] text-foreground">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                  <th className="text-left py-2 px-3 font-medium">Channel</th>
                  <th className="text-left py-2 px-3 font-medium">Agent</th>
                  <th className="text-left py-2 px-3 font-medium">Intent</th>
                  <th className="text-left py-2 px-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {interactions.rows.map((row) => (
                  <tr
                    key={row.interactionId}
                    onClick={() => setOpenRow(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenRow(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open interaction from ${new Date(row.timestamp).toLocaleString()}`}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <td className="py-2 px-3">{new Date(row.timestamp).toLocaleString()}</td>
                    <td className="py-2 px-3 capitalize">{row.channel}</td>
                    <td className="py-2 px-3">{row.agentLabel ?? '—'}</td>
                    <td className="py-2 px-3">{row.intent ?? '—'}</td>
                    <td className="py-2 px-3">{row.outcome ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
      {openRow && <InteractionInspector interaction={openRow} onClose={() => setOpenRow(null)} />}
    </section>
  );
};
