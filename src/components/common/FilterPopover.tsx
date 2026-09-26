import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X } from 'lucide-react';

/**
 * Session 10.2 shared primitive — the "Filters N" trigger + temporary
 * floating panel required by the absolute filter rule (filters are
 * controls, not content): the panel overlays the workspace via Radix
 * Popover (which already provides Escape-to-close, outside-click-close
 * and focus management) and never permanently reflows the data area
 * below it, unlike the old per-page "expand this Card" pattern.
 */
export const FilterPopover: React.FC<{
  activeCount: number;
  onClear?: () => void;
  children: React.ReactNode;
  dark?: boolean;
  align?: 'start' | 'end';
}> = ({ activeCount, onClear, children, dark = true, align = 'start' }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={dark ? 'h-8 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground' : 'h-8'}
        >
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-semibold px-1.5 py-0.5">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={`w-[340px] max-h-[70vh] overflow-y-auto p-4 space-y-4 ${dark ? 'bg-card border-border text-foreground' : ''}`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${dark ? 'text-foreground' : ''}`}>Advanced filters</span>
          {onClear && activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
};
