import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Industry, IndustryConfig, IndustryContext, INDUSTRY_CONFIGS } from '@/types/industry';

const IndustryContextProvider = createContext<IndustryContext | undefined>(undefined);

export const useIndustry = () => {
  const context = useContext(IndustryContextProvider);
  if (context === undefined) {
    throw new Error('useIndustry must be used within an IndustryProvider');
  }
  return context;
};

interface IndustryProviderProps {
  children: ReactNode;
}

export const IndustryProvider: React.FC<IndustryProviderProps> = ({ children }) => {
  const [selectedIndustry, setSelectedIndustry] = useState<Industry>('banking');

  useEffect(() => {
    // Load saved industry from localStorage
    const savedIndustry = localStorage.getItem('tardis_industry') as Industry;
    if (savedIndustry && INDUSTRY_CONFIGS[savedIndustry]) {
      setSelectedIndustry(savedIndustry);
    }
  }, []);

  const setIndustry = (industry: Industry) => {
    setSelectedIndustry(industry);
    localStorage.setItem('tardis_industry', industry);
  };

  const industryConfig = INDUSTRY_CONFIGS[selectedIndustry];

  const value: IndustryContext = {
    selectedIndustry,
    industryConfig,
    setIndustry,
  };

  return (
    <IndustryContextProvider.Provider value={value}>
      {children}
    </IndustryContextProvider.Provider>
  );
};