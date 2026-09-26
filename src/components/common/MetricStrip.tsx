import React from 'react';

export interface MetricStripItem {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

const TONE_CLASS: Record<NonNullable<MetricStripItem['tone']>, string> = {
  default: 'text-slate-100',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

/**
 * Session 10.2 shared primitive — replaces per-page grids of large KPI
 * `Card`s with one compact, dense row (alignment + dividers, not boxes).
 * Used across every operational screen's summary metrics.
 */
export const MetricStrip: React.FC<{ items: MetricStripItem[]; dark?: boolean; className?: string }> = ({
  items,
  dark = true,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-wrap items-stretch gap-x-6 gap-y-2 rounded-md border px-4 py-2.5 text-sm ${
        dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white'
      } ${className}`}
    >
      {items.map((item, i) => (
        <div key={item.label} className={`flex items-baseline gap-2 ${i > 0 ? 'pl-6 border-l' : ''} ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <span className={`text-base font-semibold tabular-nums ${dark ? TONE_CLASS[item.tone ?? 'default'] : 'text-slate-900'}`}>
            {item.value}
          </span>
          <span className={`text-xs whitespace-nowrap ${dark ? 'text-slate-400' : 'text-slate-500'}`} title={item.hint}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};
