
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { NPSCampaign } from '@/types/auth';
import {
  TrendingUp,
  Users,
  MessageSquare,
  Settings,
  Phone,
  Mail,
  MessageCircle
} from 'lucide-react';

interface NPSOverviewTabProps {
  campaign: NPSCampaign;
}

export const NPSOverviewTab: React.FC<NPSOverviewTabProps> = ({ campaign }) => {
  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'voice': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      case 'sms': return <MessageCircle className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'scheduled': return 'bg-orange-100 text-orange-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const responseRate = Math.round((campaign.responseCount / campaign.totalContacts) * 100);
  const promoterRate = Math.round((campaign.promoters / campaign.responseCount) * 100);
  const detractorRate = Math.round((campaign.detractors / campaign.responseCount) * 100);
  const passiveRate = Math.round((campaign.passives / campaign.responseCount) * 100);

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NPS Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.npsScore}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{responseRate}%</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Responses</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.responseCount}</div>
            <p className="text-xs text-muted-foreground">of {campaign.totalContacts}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <div className="flex items-center space-x-1">
              {getChannelIcon(campaign.targetChannel)}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(campaign.status)}`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Created by {campaign.createdBy}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Overall Progress</span>
                <span>{responseRate}% Complete</span>
              </div>
              <Progress value={responseRate} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NPS Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>NPS Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{campaign.promoters}</div>
              <div className="text-sm text-slate-600">Promoters (9-10)</div>
              <div className="text-xs text-slate-500">{promoterRate}%</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{campaign.passives}</div>
              <div className="text-sm text-slate-600">Passives (7-8)</div>
              <div className="text-xs text-slate-500">{passiveRate}%</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{campaign.detractors}</div>
              <div className="text-sm text-slate-600">Detractors (0-6)</div>
              <div className="text-xs text-slate-500">{detractorRate}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>AI Agent Performance</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span>Conversation Success Rate</span>
              <span className="font-medium">94%</span>
            </div>
            <div className="flex justify-between">
              <span>Average Call Duration</span>
              <span className="font-medium">2:34</span>
            </div>
            <div className="flex justify-between">
              <span>Score Collection Rate</span>
              <span className="font-medium">98%</span>
            </div>
            <div className="flex justify-between">
              <span>Follow-up Responses</span>
              <span className="font-medium">76%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
