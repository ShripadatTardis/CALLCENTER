import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { rowsToCsv, downloadCsv } from '@/lib/csvExport';

interface Props<T extends Record<string, unknown>> {
  rows: T[];
  headers: (keyof T & string)[];
  filename: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Session 7 §15/§16 — one shared export control. `rows`/`headers` must
 * already reflect the exact filter/time-window/authorization scope
 * active on screen — this component performs no separate fetch and
 * makes no authorization decision of its own, so a scoped role can never
 * export more than what's already rendered.
 */
export function AnalyticsExportButton<T extends Record<string, unknown>>({ rows, headers, filename, label, disabled }: Props<T>) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(rowsToCsv(rows, headers), filename)}
    >
      <Download className="h-4 w-4 mr-1" />
      {label ?? 'Export CSV'}
    </Button>
  );
}
