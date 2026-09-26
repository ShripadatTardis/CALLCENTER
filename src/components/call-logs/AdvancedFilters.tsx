import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { CallDataQueryDto } from '@/types/api/calls';

export type CallLogFilters = Pick<
  CallDataQueryDto,
  'date_from' | 'date_to' | 'outcome' | 'direction' | 'search' | 'min_duration' | 'max_duration'
>;

interface AdvancedFiltersProps {
  filters: CallLogFilters;
  onFiltersChange: (filters: CallLogFilters) => void;
}

const MAX_DURATION_SECONDS = 1800;

/**
 * Session 10.2 — rendered as the CONTENT of a FilterPopover (§3's
 * temporary floating filter surface), not a self-expanding page Card.
 * Field set/semantics unchanged from Session 2 (matches the live
 * GET /api/calls/data query params exactly — no fabricated filters).
 */
export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({ filters, onFiltersChange }) => {
  const [durationRange, setDurationRange] = useState<[number, number]>([
    filters.min_duration ?? 0,
    filters.max_duration ?? MAX_DURATION_SECONDS,
  ]);

  const update = (patch: Partial<CallLogFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Date range</label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 justify-start text-left border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {filters.date_from ? filters.date_from : 'Start'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.date_from ? new Date(filters.date_from) : undefined}
                onSelect={(date) => update({ date_from: date ? format(date, 'yyyy-MM-dd') : undefined })}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 justify-start text-left border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {filters.date_to ? filters.date_to : 'End'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.date_to ? new Date(filters.date_to) : undefined}
                onSelect={(date) => update({ date_to: date ? format(date, 'yyyy-MM-dd') : undefined })}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Outcome</label>
          <Select
            value={filters.outcome ?? 'any'}
            onValueChange={(value) => update({ outcome: value === 'any' ? undefined : (value as 'resolved' | 'escalated') })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Direction</label>
          <Select
            value={filters.direction ?? 'any'}
            onValueChange={(value) => update({ direction: value === 'any' ? undefined : (value as 'inbound' | 'outbound') })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
          Duration ({Math.floor(durationRange[0] / 60)}m – {Math.floor(durationRange[1] / 60)}m)
        </label>
        <Slider
          value={durationRange}
          onValueChange={(value) => {
            const [min, max] = value as [number, number];
            setDurationRange([min, max]);
            update({
              min_duration: min > 0 ? min : undefined,
              max_duration: max < MAX_DURATION_SECONDS ? max : undefined,
            });
          }}
          max={MAX_DURATION_SECONDS}
          step={30}
        />
      </div>
    </div>
  );
};

export const CallLogsSearch: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <Input
    placeholder="Search caller name, phone, intent, summary…"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-8 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
  />
);
