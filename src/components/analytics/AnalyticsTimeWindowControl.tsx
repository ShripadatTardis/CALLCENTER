import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from 'lucide-react';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

const WINDOWS: Array<{ value: NonNullable<AnalyticsMetricsQueryDto['window']>; label: string }> = [
  { value: '1h', label: 'Last 1h' },
  { value: '6h', label: 'Last 6h' },
  { value: '12h', label: 'Last 12h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
];

interface Props {
  query: AnalyticsMetricsQueryDto;
  onChange: (query: AnalyticsMetricsQueryDto) => void;
}

/**
 * Session 7 §10/§14 — sends either `window` OR `date_from`/`date_to`,
 * never both. Empirically confirmed live (this session): `window=24h`
 * is a ROLLING 24 hours ending at request time (Asia/Kolkata display
 * timezone) — NOT calendar-day-aligned. A custom date range is the
 * calendar-day-based alternative (`date_from`/`date_to`, inclusive,
 * applied as `< date_to + 1 day`). The label always makes this explicit
 * so the two bases are never silently conflated.
 */
export const AnalyticsTimeWindowControl: React.FC<Props> = ({ query, onChange }) => {
  const [customFrom, setCustomFrom] = useState(query.date_from ?? '');
  const [customTo, setCustomTo] = useState(query.date_to ?? '');
  const isCustom = Boolean(query.date_from || query.date_to);

  const activeLabel = isCustom
    ? `${query.date_from ?? '…'} – ${query.date_to ?? '…'} (calendar days, Asia/Kolkata)`
    : `${WINDOWS.find((w) => w.value === (query.window ?? '24h'))?.label ?? 'Last 24h'} (rolling, ends now)`;

  const outlineClass = 'border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {WINDOWS.map((w) => (
        <Button
          key={w.value}
          size="sm"
          className={!isCustom && (query.window ?? '24h') === w.value ? 'h-7 text-xs' : `h-7 text-xs ${outlineClass}`}
          variant={!isCustom && (query.window ?? '24h') === w.value ? 'default' : 'outline'}
          onClick={() => onChange({ window: w.value, direction: query.direction })}
        >
          {w.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" className={isCustom ? 'h-7 text-xs' : `h-7 text-xs ${outlineClass}`} variant={isCustom ? 'default' : 'outline'}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Custom Range
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 bg-slate-900 border-slate-700 text-slate-200">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">From (YYYY-MM-DD)</label>
            <Input value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} placeholder="2026-09-01" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">To (YYYY-MM-DD)</label>
            <Input value={customTo} onChange={(e) => setCustomTo(e.target.value)} placeholder="2026-09-25" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
          </div>
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            disabled={!customFrom || !customTo}
            onClick={() => onChange({ date_from: customFrom, date_to: customTo, direction: query.direction })}
          >
            Apply calendar range
          </Button>
        </PopoverContent>
      </Popover>

      <span className="text-xs text-slate-500 ml-1">Active basis: {activeLabel}</span>
    </div>
  );
};
