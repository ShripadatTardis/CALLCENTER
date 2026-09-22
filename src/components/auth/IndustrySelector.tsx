import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Industry, INDUSTRY_CONFIGS } from '@/types/industry';

interface IndustrySelectorProps {
  selectedIndustry: Industry;
  onIndustryChange: (industry: Industry) => void;
}

export const IndustrySelector: React.FC<IndustrySelectorProps> = ({
  selectedIndustry,
  onIndustryChange,
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="industry" className="text-sm font-medium text-slate-700">
        Industry
      </Label>
      <Select value={selectedIndustry} onValueChange={onIndustryChange}>
        <SelectTrigger className="h-11">
          <SelectValue placeholder="Select industry" />
        </SelectTrigger>
        <SelectContent>
          {Object.values(INDUSTRY_CONFIGS).map((config) => (
            <SelectItem key={config.id} value={config.id}>
              <div className="flex flex-col">
                <span className="font-medium">{config.name}</span>
                <span className="text-xs text-muted-foreground">{config.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};