import React from 'react';
import type { RatioDimension } from '@/types/ratio';

const DIMENSION_LABELS: Record<RatioDimension, string> = {
  time: 'Time', intent: 'Intent', agent: 'Agent', campaign: 'Campaign', domain: 'Domain',
  outcome: 'Outcome', segment: 'Segment', escalation_reason: 'Escalation reason', tool: 'Tool',
  direction: 'Direction',
};

/** Spec §4.4 — dimensions come from the registry (passed in), never hard-coded per screen. */
export const BreakdownSelector: React.FC<{
  dimensions: RatioDimension[];
  selected: string | undefined;
  onChange: (dimension: string | undefined) => void;
}> = ({ dimensions, selected, onChange }) => {
  if (dimensions.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Break down by</span>
      <select
        aria-label="Break down by"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="border border-border bg-card text-foreground rounded-md px-2 h-7 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <option value="">None</option>
        {dimensions.map((d) => (
          <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>
        ))}
      </select>
    </div>
  );
};
