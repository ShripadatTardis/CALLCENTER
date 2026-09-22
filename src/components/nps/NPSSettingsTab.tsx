
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NPSCampaign } from '@/types/auth';
import { sampleNPSScripts } from '@/data/sampleNPSScripts';
import {
  Phone,
  MessageSquare,
  Mail,
  MessageCircle
} from 'lucide-react';

interface NPSSettingsTabProps {
  campaign: NPSCampaign;
}

export const NPSSettingsTab: React.FC<NPSSettingsTabProps> = ({ campaign }) => {
  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'voice': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      case 'sms': return <MessageCircle className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const script = sampleNPSScripts.find(s => s.id === campaign.scriptId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-slate-600">Campaign Name:</span>
              <div>{campaign.name}</div>
            </div>
            <div>
              <span className="font-medium text-slate-600">Created By:</span>
              <div>{campaign.createdBy}</div>
            </div>
            <div>
              <span className="font-medium text-slate-600">Launch Date:</span>
              <div>{formatDate(campaign.launchDate)}</div>
            </div>
            <div>
              <span className="font-medium text-slate-600">Channel:</span>
              <div className="flex items-center space-x-1">
                {getChannelIcon(campaign.targetChannel)}
                <span className="capitalize">{campaign.targetChannel}</span>
              </div>
            </div>
            <div>
              <span className="font-medium text-slate-600">Language:</span>
              <div>{campaign.targetLanguage}</div>
            </div>
            <div>
              <span className="font-medium text-slate-600">Max Attempts:</span>
              <div>{campaign.retryLogic.maxAttempts}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {script && (
        <Card>
          <CardHeader>
            <CardTitle>Script Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-slate-600">Script Name:</span>
                <div>{script.name}</div>
              </div>
              <div>
                <span className="font-medium text-slate-600">Content:</span>
                <div className="mt-1 p-3 bg-slate-50 rounded text-sm">
                  {script.content}
                </div>
              </div>
              <div>
                <span className="font-medium text-slate-600">Placeholders:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {script.placeholders.map((placeholder) => (
                    <Badge key={placeholder} variant="outline" className="text-xs">
                      {`{{${placeholder}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
