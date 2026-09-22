
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NPSBadge } from './NPSBadge';
import { NPSResponseTable } from './NPSResponseTable';
import { NPSCampaign } from '@/types/auth';
import { NPSResponse } from '@/types/auth';
import { format } from 'date-fns';
import {
  Download,
  User
} from 'lucide-react';

interface NPSResponsesTabProps {
  campaign: NPSCampaign;
  onTranscriptClick: (response: any) => void;
  onRecordingClick: (response: any) => void;
  responses: NPSResponse[];
}

export const NPSResponsesTab: React.FC<NPSResponsesTabProps> = ({
  campaign,
  onTranscriptClick,
  onRecordingClick,
  responses
}) => {
  const campaignResponses = responses.filter(r => r.campaignId === campaign.id);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Individual Responses ({campaignResponses.length})</h3>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <NPSResponseTable
            responses={campaignResponses}
            campaignChannel={campaign.targetChannel}
            onTranscriptClick={onTranscriptClick}
            onRecordingClick={onRecordingClick}
          />
        </CardContent>
      </Card>

      {/* Individual Response Details */}
      <div className="space-y-2">
        {campaignResponses.slice(0, 5).map((response) => (
          response.feedback && (
            <Card key={`feedback-${response.id}`} className="hover:bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <User className="h-6 w-6 text-slate-400" />
                    <div>
                      <div className="font-medium">{response.name}</div>
                      <div className="text-sm text-slate-600">Feedback provided</div>
                    </div>
                  </div>
                  <NPSBadge score={response.npsScore} variant="compact" />
                </div>
                <div className="mt-3 p-3 bg-slate-50 rounded text-sm">
                  <span className="font-medium">Feedback: </span>
                  {response.feedback}
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>
    </div>
  );
};
