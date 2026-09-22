
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OutboundCampaign, CampaignContact, CallScript } from '@/types/auth';
import { Users, PhoneCall, TrendingUp } from 'lucide-react';

interface CampaignDetailProps {
  campaign: OutboundCampaign;
  contacts: CampaignContact[];
  script: CallScript | undefined;
  onBack: () => void;
  onTranscriptClick: (contact: CampaignContact) => void;
  onRecordingClick: (contact: CampaignContact) => void;
}

export const CampaignDetail: React.FC<CampaignDetailProps> = ({
  campaign,
  contacts,
  script,
  onBack,
  onTranscriptClick,
  onRecordingClick
}) => {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
      scheduled: { color: 'bg-blue-100 text-blue-800', label: 'Scheduled' },
      running: { color: 'bg-green-100 text-green-800', label: 'Running' },
      completed: { color: 'bg-purple-100 text-purple-800', label: 'Completed' },
      paused: { color: 'bg-yellow-100 text-yellow-800', label: 'Paused' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getCampaignTypeLabel = (campaignType: string) => {
    const labels = {
      loan_emi_reminder: 'EMI Reminder',
      overdue_loan_followup: 'Overdue Follow-up',
      document_reminder: 'Document Reminder',
      cross_sell: 'Cross-sell',
      welcome_call: 'Welcome Call'
    };
    return labels[campaignType as keyof typeof labels] || campaignType;
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={onBack}
            className="flex items-center space-x-2"
          >
            <span>← Back to Campaigns</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{campaign.name}</h1>
            <p className="text-slate-600">{campaign.description}</p>
          </div>
        </div>
        <div className="flex space-x-2">
          {getStatusBadge(campaign.status)}
        </div>
      </div>

      {/* Campaign Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.totalContacts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls Made</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.callsMade}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.successRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaign Type</CardTitle>
            <Badge className="text-xs">{getCampaignTypeLabel(campaign.campaignType)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Created by {campaign.createdBy}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(campaign.launchDate)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Script Preview */}
      {script && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Script: {script.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-sm text-slate-700">{script.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {script.placeholders.map((placeholder) => (
                  <Badge key={placeholder} variant="outline" className="text-xs">
                    {`{{${placeholder}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle>Customer List ({contacts.length} contacts)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-700">Name</th>
                  <th className="text-left py-2 font-medium text-slate-700">Mobile</th>
                  <th className="text-left py-2 font-medium text-slate-700">Status</th>
                  <th className="text-left py-2 font-medium text-slate-700">Action Taken</th>
                  <th className="text-left py-2 font-medium text-slate-700">Call Time</th>
                  <th className="text-left py-2 font-medium text-slate-700">Duration</th>
                  <th className="text-center py-2 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700">{contact.name}</td>
                    <td className="py-2 text-slate-600">{contact.mobileNumber}</td>
                    <td className="py-2">
                      <Badge variant="outline" className={
                        contact.status === 'completed' ? 'text-green-700 border-green-300' :
                        contact.status === 'not_answered' ? 'text-yellow-700 border-yellow-300' :
                        'text-gray-700 border-gray-300'
                      }>
                        {contact.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-600">
                      {contact.actionTaken ? contact.actionTaken.replace('_', ' ') : '-'}
                    </td>
                    <td className="py-2 text-slate-600">
                      {contact.callTimestamp ? formatDate(contact.callTimestamp) : '-'}
                    </td>
                    <td className="py-2 text-slate-600">
                      {contact.callDuration ? `${Math.floor(contact.callDuration / 60)}:${(contact.callDuration % 60).toString().padStart(2, '0')}` : '-'}
                    </td>
                    <td className="py-2 text-center">
                      <div className="flex justify-center space-x-1">
                        {contact.transcriptId && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-xs"
                            onClick={() => onTranscriptClick(contact)}
                          >
                            Transcript
                          </Button>
                        )}
                        {contact.recordingId && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-xs"
                            onClick={() => onRecordingClick(contact)}
                          >
                            Recording
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
