import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { Eye } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';
import { formatTimestamp } from '@/lib/format';

interface CampaignGridProps {
  campaigns: CampaignWithStats[];
  onViewCampaign: (campaign: CampaignWithStats) => void;
}

export const CampaignGrid: React.FC<CampaignGridProps> = ({ campaigns, onViewCampaign }) => {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-4 font-medium text-slate-700">Campaign Name</th>
                <th className="text-left p-4 font-medium text-slate-700">Status</th>
                <th className="text-left p-4 font-medium text-slate-700">Targets</th>
                <th className="text-left p-4 font-medium text-slate-700">Calls Triggered</th>
                <th className="text-left p-4 font-medium text-slate-700">Success Rate</th>
                <th className="text-left p-4 font-medium text-slate-700">Created</th>
                <th className="text-center p-4 font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No campaigns yet. Create one to get started.
                  </td>
                </tr>
              )}
              {campaigns.map((campaign) => {
                const rate = campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
                return (
                  <tr key={campaign.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium text-slate-900">{campaign.name}</div>
                        <div className="text-xs text-slate-500">by {campaign.createdBy ?? 'unknown'}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="p-4 text-slate-700">{campaign.stats.targetCount}</td>
                    <td className="p-4 text-slate-700">{campaign.stats.triggeredCount}</td>
                    <td className="p-4 text-slate-700">{rate === null ? '—' : `${rate.toFixed(1)}%`}</td>
                    <td className="p-4 text-slate-600">{formatTimestamp(campaign.createdAt)}</td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => onViewCampaign(campaign)} className="text-xs">
                              <Eye className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Campaign</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
