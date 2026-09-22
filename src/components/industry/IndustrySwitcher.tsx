import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIndustry } from '@/contexts/IndustryContext';
import { INDUSTRY_CONFIGS, Industry } from '@/types/industry';
import { Building2, Radio, Plane, Hotel, Activity, Car, Shield, ChevronDown } from 'lucide-react';

const industryIcons = {
  banking: Building2,
  telecom: Radio,
  airlines: Plane,
  hotels: Hotel,
  hospitals: Activity,
  automotive: Car,
  insurance: Shield
};

export const IndustrySwitcher: React.FC = () => {
  const { selectedIndustry, setIndustry, industryConfig } = useIndustry();

  const handleIndustryChange = (industry: Industry) => {
    setIndustry(industry);
  };

  const CurrentIcon = industryIcons[selectedIndustry];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <CurrentIcon className="h-4 w-4" />
          <span>{industryConfig.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {Object.entries(INDUSTRY_CONFIGS).map(([key, config]) => {
          const IconComponent = industryIcons[key as Industry];
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => handleIndustryChange(key as Industry)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <IconComponent className="h-4 w-4" />
              <span>{config.name}</span>
              {selectedIndustry === key && (
                <div className="ml-auto h-2 w-2 bg-primary rounded-full" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};