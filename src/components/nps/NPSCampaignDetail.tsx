
import React, { useState } from 'react';
import { NPSCampaignHeader } from './NPSCampaignHeader';
import { NPSCampaignTabs } from './NPSCampaignTabs';
import { NPSOverviewTab } from './NPSOverviewTab';
import { NPSResponsesTab } from './NPSResponsesTab';
import { NPSSettingsTab } from './NPSSettingsTab';
import { NPSCampaign } from '@/types/auth';

interface NPSCampaignDetailProps {
  campaign: NPSCampaign;
  onBack: () => void;
  onTranscriptClick?: (response: any) => void;
  onRecordingClick?: (response: any) => void;
  responses: any[];
}

export const NPSCampaignDetail: React.FC<NPSCampaignDetailProps> = ({
  campaign,
  onBack,
  onTranscriptClick,
  onRecordingClick,
  responses
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  const handleTranscriptClick = (response: any) => {
    console.log('NPSCampaignDetail: handleTranscriptClick called with response:', response);
    if (onTranscriptClick) {
      onTranscriptClick(response);
    } else {
      console.error('NPSCampaignDetail: onTranscriptClick handler not provided');
    }
  };

  const handleRecordingClick = (response: any) => {
    console.log('NPSCampaignDetail: handleRecordingClick called with response:', response);
    if (onRecordingClick) {
      onRecordingClick(response);
    } else {
      console.error('NPSCampaignDetail: onRecordingClick handler not provided');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <NPSOverviewTab campaign={campaign} />;
      case 'responses':
        return (
          <NPSResponsesTab
            campaign={campaign}
            onTranscriptClick={handleTranscriptClick}
            onRecordingClick={handleRecordingClick}
            responses={responses}
          />
        );
      case 'settings':
        return <NPSSettingsTab campaign={campaign} />;
      default:
        return <NPSOverviewTab campaign={campaign} />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <NPSCampaignHeader campaign={campaign} onBack={onBack} />
      <NPSCampaignTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="mt-6">
        {renderTabContent()}
      </div>
    </div>
  );
};
