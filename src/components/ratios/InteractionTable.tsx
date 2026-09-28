import React, { useState } from 'react';
import { RatioUnavailableState } from './RatioUnavailableState';
import { InteractionInspector } from './InteractionInspector';
import type { RatioInteractionsResponseDto } from '@/types/ratio';

/** Spec §4.6 — the filtered interaction list is the final aggregate level; selecting a row opens the right-side inspector without leaving the analytical page. R1: real table shell, honest unavailable until the service resolves real interaction IDs (R2). */
export const InteractionTable: React.FC<{ interactions: RatioInteractionsResponseDto | undefined; isLoading: boolean }> = ({
  interactions,
  isLoading,
}) => {
  const [openRow, setOpenRow] = useState<RatioInteractionsResponseDto['rows'][number] | null>(null);

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!interactions) return null;

  return (
    <section>
      <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">Interactions</h2>
      {!interactions.rows || interactions.rows.length === 0 ? (
        <RatioUnavailableState reason={interactions.unavailableReason ?? 'Interaction drill-down not yet instrumented.'} compact />
      ) : (
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
                <tr key={row.interactionId} onClick={() => setOpenRow(row)} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer">
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
      )}
      {openRow && <InteractionInspector interaction={openRow} onClose={() => setOpenRow(null)} />}
    </section>
  );
};
