
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { useIndustry } from '@/contexts/IndustryContext';
import { Building2, Radio, Plane, Hotel, Activity, Car, Shield } from 'lucide-react';

const industryIcons = {
  banking: Building2,
  telecom: Radio,
  airlines: Plane,
  hotels: Hotel,
  hospitals: Activity,
  automotive: Car,
  insurance: Shield
};

export const IndustryIndicator: React.FC = () => {
  const { selectedIndustry, industryConfig } = useIndustry();
  const IconComponent = industryIcons[selectedIndustry];

  return (
    <Badge 
      variant="outline" 
      className="flex items-center gap-2 px-4 py-2 bg-white border-2 shadow-sm"
      style={{ 
        borderColor: industryConfig.primaryColor,
        color: industryConfig.primaryColor 
      }}
    >
      <IconComponent className="h-4 w-4" />
      <span className="font-semibold text-sm">{industryConfig.name}</span>
    </Badge>
  );
};
