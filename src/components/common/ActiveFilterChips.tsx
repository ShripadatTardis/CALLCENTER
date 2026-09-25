import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Session 7.1 §12 — removable active-filter chips + "Clear all". "Clear
 * all" only resets operator-chosen filters (passed in via onClearAll);
 * it must never be wired to anything that changes authorization scope.
 */
export const ActiveFilterChips: React.FC<{ chips: ActiveChip[]; onClearAll: () => void }> = ({ chips, onClearAll }) => {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs px-2.5 py-1"
        >
          {chip.label}
          <button type="button" onClick={chip.onRemove} aria-label={`Remove filter: ${chip.label}`} className="hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
};
