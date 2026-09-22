
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Filter, X, Calendar as CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';

interface FilterState {
  dateRange: { start?: Date; end?: Date };
  outcomes: string[];
  sentimentRange: [number, number];
  durationRange: [number, number];
  intents: string[];
  tags: string[];
  agents: string[];
}

interface AdvancedFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  onExport: () => void;
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  onFiltersChange,
  onExport
}) => {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: {},
    outcomes: [],
    sentimentRange: [0, 100],
    durationRange: [0, 1800],
    intents: [],
    tags: [],
    agents: []
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const outcomeOptions = ['resolved', 'escalated', 'dropped', 'callback_scheduled'];
  const intentOptions = ['billing', 'loan_status', 'technical', 'general', 'complaint'];
  const tagOptions = ['urgent', 'vip', 'follow_up', 'training', 'escalation'];
  const agentOptions = ['AI-Agent-01', 'AI-Agent-02', 'AI-Agent-03', 'AI-Agent-04'];

  const updateFilters = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const toggleArrayFilter = (key: keyof FilterState, value: string) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilters(key, newArray);
  };

  const clearFilters = () => {
    const clearedFilters: FilterState = {
      dateRange: {},
      outcomes: [],
      sentimentRange: [0, 100],
      durationRange: [0, 1800],
      intents: [],
      tags: [],
      agents: []
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const activeFilterCount = 
    (filters.outcomes.length > 0 ? 1 : 0) +
    (filters.intents.length > 0 ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.agents.length > 0 ? 1 : 0) +
    (filters.dateRange.start ? 1 : 0) +
    (filters.sentimentRange[0] > 0 || filters.sentimentRange[1] < 100 ? 1 : 0) +
    (filters.durationRange[0] > 0 || filters.durationRange[1] < 1800 ? 1 : 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Advanced Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary">{activeFilterCount} active</Badge>
            )}
          </CardTitle>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
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
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Date Range */}
          <div>
            <label className="text-sm font-medium mb-2 block">Date Range</label>
            <div className="flex space-x-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange.start ? format(filters.dateRange.start, 'MMM dd, yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.start}
                    onSelect={(date) => updateFilters('dateRange', { ...filters.dateRange, start: date })}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange.end ? format(filters.dateRange.end, 'MMM dd, yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.end}
                    onSelect={(date) => updateFilters('dateRange', { ...filters.dateRange, end: date })}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Outcomes */}
          <div>
            <label className="text-sm font-medium mb-2 block">Outcomes</label>
            <div className="flex flex-wrap gap-2">
              {outcomeOptions.map(outcome => (
                <label key={outcome} className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    checked={filters.outcomes.includes(outcome)}
                    onCheckedChange={() => toggleArrayFilter('outcomes', outcome)}
                  />
                  <span className="text-sm capitalize">{outcome.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sentiment Range */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Sentiment Score ({filters.sentimentRange[0]}% - {filters.sentimentRange[1]}%)
            </label>
            <Slider
              value={filters.sentimentRange}
              onValueChange={(value) => updateFilters('sentimentRange', value)}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Duration Range */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Call Duration ({Math.floor(filters.durationRange[0] / 60)}m - {Math.floor(filters.durationRange[1] / 60)}m)
            </label>
            <Slider
              value={filters.durationRange}
              onValueChange={(value) => updateFilters('durationRange', value)}
              max={1800}
              step={30}
              className="w-full"
            />
          </div>

          {/* Intents */}
          <div>
            <label className="text-sm font-medium mb-2 block">Intents</label>
            <div className="flex flex-wrap gap-2">
              {intentOptions.map(intent => (
                <label key={intent} className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    checked={filters.intents.includes(intent)}
                    onCheckedChange={() => toggleArrayFilter('intents', intent)}
                  />
                  <span className="text-sm capitalize">{intent.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium mb-2 block">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map(tag => (
                <Badge
                  key={tag}
                  variant={filters.tags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleArrayFilter('tags', tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* AI Agents */}
          <div>
            <label className="text-sm font-medium mb-2 block">AI Agents</label>
            <div className="flex flex-wrap gap-2">
              {agentOptions.map(agent => (
                <label key={agent} className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    checked={filters.agents.includes(agent)}
                    onCheckedChange={() => toggleArrayFilter('agents', agent)}
                  />
                  <span className="text-sm">{agent}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
