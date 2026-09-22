
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OutboundCampaign } from '@/types/auth';
import { Eye, Edit, Copy } from 'lucide-react';

interface CampaignGridProps {
  campaigns: OutboundCampaign[];
  onViewCampaign: (campaign: OutboundCampaign) => void;
  onEditCampaign: (campaign: OutboundCampaign) => void;
  onDuplicateCampaign: (campaign: OutboundCampaign) => void;
}

export const CampaignGrid: React.FC<CampaignGridProps> = ({
  campaigns,
  onViewCampaign,
  onEditCampaign,
  onDuplicateCampaign
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
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-4 font-medium text-slate-700">Campaign Name</th>
                <th className="text-left p-4 font-medium text-slate-700">Type</th>
                <th className="text-left p-4 font-medium text-slate-700">Status</th>
                <th className="text-left p-4 font-medium text-slate-700">Total Contacts</th>
                <th className="text-left p-4 font-medium text-slate-700">Calls Made</th>
                <th className="text-left p-4 font-medium text-slate-700">Success Rate</th>
                <th className="text-left p-4 font-medium text-slate-700">Launch Date</th>
                <th className="text-center p-4 font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4">
                    <div>
                      <div className="font-medium text-slate-900">{campaign.name}</div>
                      <div className="text-xs text-slate-500">by {campaign.createdBy}</div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">{getCampaignTypeLabel(campaign.campaignType)}</Badge>
                  </td>
                  <td className="p-4">
                    {getStatusBadge(campaign.status)}
                  </td>
                  <td className="p-4 text-slate-700">{campaign.totalContacts}</td>
                  <td className="p-4 text-slate-700">{campaign.callsMade}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-700">{campaign.successRate.toFixed(1)}%</span>
                      <div className="w-16 bg-slate-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(campaign.successRate, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">{formatDate(campaign.launchDate)}</td>
                  <td className="p-4">
                    <div className="flex justify-center space-x-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onViewCampaign(campaign)}
                            className="text-xs"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Campaign</TooltipContent>
                      </Tooltip>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onEditCampaign(campaign)}
                            className="text-xs"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit Campaign</TooltipContent>
                      </Tooltip>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onDuplicateCampaign(campaign)}
                            className="text-xs"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicate Campaign</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
