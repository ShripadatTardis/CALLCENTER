import { useMemo } from 'react';
import { useIndustry } from '@/contexts/IndustryContext';
import {
  generateIndustrySpecificCampaigns,
  generateIndustrySpecificScripts,
  generateIndustrySpecificAgents,
  generateIndustrySpecificContacts,
  generateIndustrySpecificCallLogs,
  generateIndustrySpecificNPSCampaigns,
  generateIndustrySpecificNPSScripts,
  generateIndustrySpecificNPSResponses
} from '@/utils/industryDataGenerator';

export const useIndustryData = () => {
  const { selectedIndustry, industryConfig } = useIndustry();

  const data = useMemo(() => ({
    campaigns: generateIndustrySpecificCampaigns(selectedIndustry),
    scripts: generateIndustrySpecificScripts(selectedIndustry),
    agents: generateIndustrySpecificAgents(selectedIndustry),
    contacts: generateIndustrySpecificContacts(selectedIndustry),
    callLogs: generateIndustrySpecificCallLogs(selectedIndustry),
    npsCampaigns: generateIndustrySpecificNPSCampaigns(selectedIndustry),
    npsScripts: generateIndustrySpecificNPSScripts(selectedIndustry),
    npsResponses: generateIndustrySpecificNPSResponses(selectedIndustry),
    terminology: industryConfig.features.terminology,
    industryName: industryConfig.name
  }), [selectedIndustry, industryConfig]);

  return data;
};

// Helper hook for dynamic terminology
export const useIndustryTerminology = () => {
  const { industryConfig } = useIndustry();
  
  const getTerminology = (key: string) => {
    return industryConfig.features.terminology[key] || key;
  };

  return { getTerminology, terminology: industryConfig.features.terminology };
};