import React from 'react';

export type MetricOrigin = 'server-aggregate' | 'client-derived' | 'page-scoped' | 'unavailable';

const LABEL: Record<MetricOrigin, string> = {
  'server-aggregate': 'Server aggregate',
  'client-derived': 'Client-derived',
  'page-scoped': 'Page-scoped sample',
  unavailable: 'Unavailable',
};

/**
 * Session 7 §16 — makes metric origin auditable without cluttering the
 * UI: a one-line caption naming the exact source, shown under every
 * chart/tile. Never decorative — `source` must be a real field/formula
 * name, not a description.
 */
export const MetricSourceCaption: React.FC<{ origin: MetricOrigin; source: string }> = ({ origin, source }) => (
  <p className="text-[11px] text-muted-foreground mt-1">
    {LABEL[origin]} — {source}
  </p>
);
