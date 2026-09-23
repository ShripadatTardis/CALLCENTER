
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, Calendar as CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import type { CallDataQueryDto } from '@/types/api/calls';

export type CallLogFilters = Pick<
  CallDataQueryDto,
  'date_from' | 'date_to' | 'outcome' | 'direction' | 'search' | 'min_duration' | 'max_duration'
>;

interface AdvancedFiltersProps {
  filters: CallLogFilters;
  onFiltersChange: (filters: CallLogFilters) => void;
  onExport: () => void;
}

const MAX_DURATION_SECONDS = 1800;

/**
 * Session 2: reworked to match the live GET /api/calls/data query
 * params exactly (see the Session 2 plan §7). Sentiment range, intent,
 * tag, and agent filters from the previous mock version had no live
 * server-side equivalent and were removed rather than faked as
 * client-side-only filters (which would have silently only applied to
 * whatever page happened to be loaded).
 */
export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  filters,
  onFiltersChange,
  onExport,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [durationRange, setDurationRange] = useState<[number, number]>([
    filters.min_duration ?? 0,
    filters.max_duration ?? MAX_DURATION_SECONDS,
  ]);

  const update = (patch: Partial<CallLogFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  const clearFilters = () => {
    setDurationRange([0, MAX_DURATION_SECONDS]);
    onFiltersChange({});
  };

  const activeFilterCount =
    (filters.date_from ? 1 : 0) +
    (filters.outcome ? 1 : 0) +
    (filters.direction ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.min_duration !== undefined || filters.max_duration !== undefined ? 1 : 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="text-xs bg-secondary text-secondary-foreground rounded px-2 py-0.5">
                {activeFilterCount} active
              </span>
            )}
          </CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Export downloads the currently loaded/filtered page only, not the complete call
          history — narrow the filters if you need a specific set.
        </p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Search</label>
            <Input
              placeholder="Search caller name, phone, intent, summary…"
              value={filters.search ?? ''}
              onChange={(e) => update({ search: e.target.value || undefined })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Date Range</label>
            <div className="flex space-x-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.date_from ? filters.date_from : 'Start date'}
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
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.date_to ? filters.date_to : 'End date'}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Outcome</label>
              <Select
                value={filters.outcome ?? 'any'}
                onValueChange={(value) => update({ outcome: value === 'any' ? undefined : (value as 'resolved' | 'escalated') })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Direction</label>
              <Select
                value={filters.direction ?? 'any'}
                onValueChange={(value) => update({ direction: value === 'any' ? undefined : (value as 'inbound' | 'outbound') })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Call Duration ({Math.floor(durationRange[0] / 60)}m - {Math.floor(durationRange[1] / 60)}m)
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
              className="w-full"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
};
