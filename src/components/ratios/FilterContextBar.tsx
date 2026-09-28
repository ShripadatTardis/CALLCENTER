import React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RatioFilterState } from '@/types/ratio';

const LABELS: Partial<Record<keyof RatioFilterState, string>> = {
  range: 'Range', direction: 'Direction', channel: 'Channel', domain: 'Domain',
  campaign: 'Campaign', agent: 'Agent', intent: 'Intent',
  breakdown: 'Break down by', breakdownValue: 'Value', driver: 'Driver',
};

/**
 * Spec §4.1 — persistent context bar. Selected context remains visible as
 * removable chips through the entire drill-down (level 1 filters AND
 * drill-layer selections both render here, since both are the same
 * RatioFilterState). Range selector is the one always-present control;
 * everything else appears only once set (via breakdown selection or a
 * future filter control), matching "do not necessarily implement every
 * control fully in R1" (spec §14).
 */
export const FilterContextBar: React.FC<{
  filters: RatioFilterState;
  onRangeChange: (range: RatioFilterState['range']) => void;
  onRemove: (key: keyof RatioFilterState) => void;
}> = ({ filters, onRangeChange, onRemove }) => {
  const chips = (Object.keys(LABELS) as (keyof RatioFilterState)[]).filter((k) => k !== 'range' && filters[k]);

  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      <select
        aria-label="Date range"
        value={filters.range ?? '24h'}
        onChange={(e) => onRangeChange(e.target.value as RatioFilterState['range'])}
        className="border border-border bg-card text-foreground rounded-md px-2 h-7 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <option value="1h">Last 1h</option>
        <option value="6h">Last 6h</option>
        <option value="12h">Last 12h</option>
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7d</option>
        <option value="30d">Last 30d</option>
      </select>

      {chips.map((key) => (
        <Badge key={key} variant="secondary" className="flex items-center gap-1 pr-1">
          <span className="text-[11px]">{LABELS[key]}: {filters[key]}</span>
          <button
            type="button"
            aria-label={`Remove ${LABELS[key]} filter`}
            onClick={() => onRemove(key)}
            className="rounded-full hover:bg-muted/60 p-1.5 -m-1 flex items-center justify-center"
          >
            <X size={10} aria-hidden="true" />
          </button>
        </Badge>
      ))}
    </div>
  );
};
