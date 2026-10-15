import React from 'react';
import { Badge } from '@/components/ui/badge';
import { QA_PARAMETERS } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { typography } from '@/lib/typography';
import type { AutomatedQaObservation } from '@/services/qa/automatedQaService';

/**
 * Session 16.4.3.1 — extracted from `AutomatedQaInspector.tsx` (the
 * Inspector's own "Findings" table, unchanged visually) so Call Logs'
 * new inline Automated QA tab shows the same real findings without a
 * second, divergence-prone copy of this rendering/selection logic.
 */
export interface FindingsListProps {
  observations: AutomatedQaObservation[];
  /** Maps a turnId to its 1-based display index ("Turn N"); falls back to the raw turnId when absent (e.g. the caller hasn't loaded the transcript). */
  turnIndexById: Map<string, number>;
  selectedFindingId: string | null;
  onSelectFinding: (observation: AutomatedQaObservation) => void;
  maxHeightPx?: number;
  heading?: React.ReactNode | null;
}

export const FindingsList: React.FC<FindingsListProps> = ({
  observations,
  turnIndexById,
  selectedFindingId,
  onSelectFinding,
  maxHeightPx = 420,
  heading,
}) => {
  if (observations.length === 0) return null;
  return (
    <div>
      {heading !== null && <h2 className={`${typography.cardTitle} mb-1.5`}>{heading ?? 'Findings'}</h2>}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="overflow-y-auto" style={{ maxHeight: maxHeightPx }}>
          <table className={`w-full ${typography.tableBody}`}>
            <thead className="sticky top-0 z-10">
              <tr className="h-[30px] bg-card text-muted-foreground uppercase tracking-wide text-[11px] font-semibold">
                <th className="text-left px-2">Parameter</th>
                <th className="text-left px-2">Value</th>
                <th className="text-left px-2">Reason</th>
                <th className="text-left px-2">Turn</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((o) => {
                const def = QA_PARAMETERS[o.parameterCode];
                const isClean = o.value === def.cleanValue;
                const turnIdx = turnIndexById.get(o.primaryTurnId);
                const turnLabel = turnIdx ? `Turn ${turnIdx}` : o.primaryTurnId;
                const isSelected = o.id === selectedFindingId;
                return (
                  <tr
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Deselect' : 'Select'} finding for ${def.displayName}, turn ${turnLabel}`}
                    className={`h-8 border-t border-border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-muted/40'}`}
                    onClick={() => onSelectFinding(o)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectFinding(o);
                      }
                    }}
                  >
                    <td className="px-2 py-1">{def.displayName}</td>
                    <td className="px-2 py-1">
                      <Badge variant={isClean ? 'positive' : 'warning'} className="h-5">
                        {o.value}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">{o.reasonCode ? humanizeReasonCode(o.reasonCode) : '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap" title={o.primaryTurnId}>{turnLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
