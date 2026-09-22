
import React from 'react';
import {
  BarChart3,
  MessageSquare,
  Settings
} from 'lucide-react';

interface NPSCampaignTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'responses', label: 'Responses', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export const NPSCampaignTabs: React.FC<NPSCampaignTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  return (
    <div className="flex border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center space-x-2 px-4 py-2 border-b-2 ${
            activeTab === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <tab.icon className="h-4 w-4" />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};
