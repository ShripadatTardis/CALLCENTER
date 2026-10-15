import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Info } from 'lucide-react';
import { QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';
import { formatFractionAsPercent } from '@/lib/format';
import { typography } from '@/lib/typography';
import type { AutomatedQaUnassessableParameter } from '@/services/qa/automatedQaService';
import type { QaRatioResult } from '@/lib/qaRatios';

/**
 * Session 16.4.3.1 — extracted from `AutomatedQaInspector.tsx` (the
 * Inspector's own "Quality Measurements" block, unchanged visually)
 * so Call Logs' new inline Automated QA tab can show the SAME real
 * measurements without duplicating the grouping/formatting logic.
 * Pure presentational: computing `ratios` (via `computeAutomatedQaRatios`)
 * stays the caller's responsibility — this component never fetches or
 * calculates anything itself, so there is exactly one place ratio math
 * can diverge between the two surfaces: nowhere, since both call the
 * same `computeAutomatedQaRatios`.
 */
const MEASUREMENT_ROW_GROUPS: QaParameterCode[][] = [
  ['context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate'],
  ['conversation_recovery_rate', 'response_grounding_rate'],
  ['unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate'],
];

export interface QualityMeasurementsGridProps {
  ratios: Record<QaParameterCode, QaRatioResult>;
  unassessableParameters: AutomatedQaUnassessableParameter[];
  /** Shows the "Understanding Quality Measurements" help icon when provided. */
  onHelpClick?: () => void;
  /** Overrides the default `typography.cardTitle` "Quality Measurements" heading; pass null to omit the heading entirely (caller supplies its own). */
  heading?: React.ReactNode | null;
}

export const QualityMeasurementsGrid: React.FC<QualityMeasurementsGridProps> = ({
  ratios,
  unassessableParameters,
  onHelpClick,
  heading,
}) => (
  <div>
    {heading !== null && (
      <div className="flex items-center gap-1 mb-1.5">
        {heading ?? <h2 className={typography.cardTitle}>Quality Measurements</h2>}
        {onHelpClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onHelpClick}
                className="inline-flex items-center justify-center h-7 w-7 -my-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                aria-label="Understanding Quality Measurements"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Understanding Quality Measurements</TooltipContent>
          </Tooltip>
        )}
      </div>
    )}
    <div className="space-y-1.5">
      {MEASUREMENT_ROW_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
          {group.map((code) => {
            const def = QA_PARAMETERS[code];
            const r = ratios[code];
            const unassessable = unassessableParameters.find((u) => u.parameterCode === code);
            const directionLabel = def.directionality === 'higher_better' ? 'Higher is better' : 'Lower is better';
            return (
              <div
                key={code}
                className="rounded-md border border-border bg-card px-1.5 py-1 min-h-[38px] flex flex-col justify-center"
                title={directionLabel}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="text-[10px] font-semibold leading-[1.15] line-clamp-2" title={def.displayName}>{def.displayName}</div>
                  {r.denominator === 0 && unassessable && (
                    <Info className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                </div>
                {r.denominator === 0 ? (
                  <div className="flex items-baseline gap-1" title={unassessable?.reason}>
                    <span className="text-[14px] font-semibold leading-tight text-muted-foreground">—</span>
                    <span className={`${typography.microCaption} truncate`}>No eligible population</span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[14px] font-semibold leading-tight">{formatFractionAsPercent(r.rate ?? undefined)}</span>
                    <span className={`${typography.microCaption} truncate`}>{r.numerator}/{r.denominator} eligible</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </div>
);
