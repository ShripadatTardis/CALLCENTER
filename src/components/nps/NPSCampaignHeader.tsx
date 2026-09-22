
import React from 'react';
import { Button } from '@/components/ui/button';
import { NPSCampaign } from '@/types/auth';
import {
  Play,
  Pause,
  Edit,
  Phone
} from 'lucide-react';

interface NPSCampaignHeaderProps {
  campaign: NPSCampaign;
  onBack: () => void;
}

export const NPSCampaignHeader: React.FC<NPSCampaignHeaderProps> = ({
  campaign,
  onBack
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button 
          variant="outline" 
          onClick={onBack}
          className="flex items-center space-x-2"
        >
          <span>← Back to NPS Campaigns</span>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{campaign.name}</h1>
          <p className="text-slate-600">{campaign.description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {campaign.status === 'running' ? (
          <Button variant="outline" size="sm">
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Play className="h-4 w-4 mr-2" />
            Resume
          </Button>
        )}
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>
    </div>
  );
};
