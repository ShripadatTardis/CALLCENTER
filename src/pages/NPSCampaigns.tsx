import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIndustryData } from '@/hooks/useIndustryData';
import { NPSBadge } from '@/components/nps/NPSBadge';
import { CreateNPSCampaignDialog } from '@/components/nps/CreateNPSCampaignDialog';
import { NPSCampaignDetail } from '@/components/nps/NPSCampaignDetail';
import { ConfirmationDialog } from '@/components/nps/ConfirmationDialog';
import { NPSTranscriptDialog } from '@/components/nps/NPSTranscriptDialog';
import { NPSRecordingDialog } from '@/components/nps/NPSRecordingDialog';
import { NPSCampaign } from '@/types/auth';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { typography } from '@/lib/typography';
import { 
  Search, 
  Plus, 
  Play, 
  Pause, 
  Eye, 
  Edit, 
  Trash2,
  Phone,
  MessageSquare,
  Mail,
  MessageCircle,
  TrendingUp
} from 'lucide-react';

const NPSCampaigns: React.FC = () => {
  const { npsCampaigns, npsScripts, npsResponses } = useIndustryData();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<NPSCampaign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<NPSCampaign | null>(null);
  
  // Add dialog states for transcript and recording
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [recordingDialogOpen, setRecordingDialogOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<any>(null);

  const filteredCampaigns = npsCampaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         campaign.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || campaign.status === selectedStatus;
    const matchesChannel = selectedChannel === 'all' || campaign.targetChannel === selectedChannel;
    return matchesSearch && matchesStatus && matchesChannel;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
      case 'scheduled':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300';
      case 'draft':
        return 'bg-muted text-foreground';
      default:
        return 'bg-muted text-foreground';
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'voice':
        return <Phone className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4" />;
      case 'sms':
        return <MessageCircle className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const handleView = (campaign: NPSCampaign) => {
    setSelectedCampaign(campaign);
  };

  const handleEdit = (campaign: NPSCampaign) => {
    toast.info(`Edit functionality for "${campaign.name}" - Feature coming soon!`);
  };

  const handlePlayPause = (campaign: NPSCampaign) => {
    const action = campaign.status === 'running' ? 'paused' : 'resumed';
    toast.success(`Campaign "${campaign.name}" has been ${action}.`);
  };

  const handleDelete = (campaign: NPSCampaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      toast.success(`Campaign "${campaignToDelete.name}" has been deleted.`);
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    }
  };

  const handleTranscriptClick = (response: any) => {
    console.log('handleTranscriptClick called with response:', response);
    console.log('Current transcriptDialogOpen state:', transcriptDialogOpen);
    
    setSelectedResponse(response);
    setTranscriptDialogOpen(true);
    
    console.log('Setting transcriptDialogOpen to true and selectedResponse to:', response);
  };

  const handleRecordingClick = (response: any) => {
    console.log('handleRecordingClick called with response:', response);
    console.log('Current recordingDialogOpen state:', recordingDialogOpen);
    
    setSelectedResponse(response);
    setRecordingDialogOpen(true);
    
    console.log('Setting recordingDialogOpen to true and selectedResponse to:', response);
  };

  const handleTranscriptDialogClose = (open: boolean) => {
    console.log('Transcript dialog close handler called with open:', open);
    setTranscriptDialogOpen(open);
    if (!open) {
      setSelectedResponse(null);
      console.log('Cleared selectedResponse');
    }
  };

  const handleRecordingDialogClose = (open: boolean) => {
    console.log('Recording dialog close handler called with open:', open);
    setRecordingDialogOpen(open);
    if (!open) {
      setSelectedResponse(null);
      console.log('Cleared selectedResponse');
    }
  };

  // Calculate overall metrics
  const totalCampaigns = npsCampaigns.length;
  const activeCampaigns = npsCampaigns.filter(c => c.status === 'running').length;
  const totalResponses = npsCampaigns.reduce((sum, c) => sum + c.responseCount, 0);
  const avgNPS = Math.round(npsCampaigns.reduce((sum, c) => sum + c.npsScore, 0) / npsCampaigns.length);

  // If a campaign is selected, show the detail view
  if (selectedCampaign) {
    return (
      <Layout>
        <NPSCampaignDetail
          campaign={selectedCampaign}
          onBack={() => setSelectedCampaign(null)}
          onTranscriptClick={handleTranscriptClick}
          onRecordingClick={handleRecordingClick}
          responses={npsResponses}
        />
        
        {/* Add the dialog components here at the detail view level */}
        <NPSTranscriptDialog
          open={transcriptDialogOpen}
          onOpenChange={handleTranscriptDialogClose}
          response={selectedResponse}
        />

        <NPSRecordingDialog
          open={recordingDialogOpen}
          onOpenChange={handleRecordingDialogClose}
          response={selectedResponse}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <TooltipProvider>
        {/* App-wide viewport-framing correction (follow-up to Session 15) — Pattern B. */}
        <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
          <div className="rounded-md border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            Demo data — NPS Campaigns has no real backend/execution engine yet (Session 5/9 audits). Shown for illustration only; actions below do not persist or place real calls.
          </div>

          <div className="flex items-center justify-end">
            <CreateNPSCampaignDialog npsScripts={npsScripts}>
              <Button size="sm" className="h-8 bg-cyan-600 hover:bg-cyan-500">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create Campaign
              </Button>
            </CreateNPSCampaignDialog>
          </div>

          <MetricStrip
            items={[
              { label: 'Total campaigns', value: totalCampaigns },
              { label: 'Active campaigns', value: activeCampaigns },
              { label: 'Total responses', value: totalResponses },
              { label: 'Average NPS', value: avgNPS },
            ]}
          />

          <div className="flex flex-wrap gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
              <Input
                uiSize="sm"
                placeholder="Search campaigns…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 border border-border bg-card text-foreground rounded-md px-2 text-xs"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
            </select>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="h-8 border border-border bg-card text-foreground rounded-md px-2 text-xs"
            >
              <option value="all">All Channels</option>
              <option value="voice">Voice</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Campaign Name</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Status</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Channel</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>NPS Score</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Participants</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Responses</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Start Date</th>
                      <th className={`text-left py-2 px-3 ${typography.tableHeader}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="border-b border-border/60 last:border-0 hover:bg-card">
                        <td className="py-2 px-3">
                          <div>
                            <div className={`font-medium ${typography.tableBody}`}>{campaign.name}</div>
                            <div className={typography.metadata}>{campaign.description}</div>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={getStatusBadgeColor(campaign.status)}>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <div className={`flex items-center space-x-2 ${typography.tableBody}`}>
                            {getChannelIcon(campaign.targetChannel)}
                            <span className="capitalize">{campaign.targetChannel}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <NPSBadge score={campaign.npsScore} variant="compact" />
                        </td>
                        <td className={`py-2 px-3 ${typography.tableBody}`}>{campaign.totalContacts}</td>
                        <td className="py-2 px-3">
                          <div className={typography.tableBody}>{campaign.responseCount}</div>
                          <div className={typography.metadata}>
                            {Math.round((campaign.responseCount / campaign.totalContacts) * 100)}% response rate
                          </div>
                        </td>
                        <td className={`py-2 px-3 ${typography.metadata}`}>
                          {format(campaign.launchDate, 'MMM dd, yyyy')}
                        </td>
                        <td className="py-3">
                          <div className="flex space-x-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleView(campaign)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View campaign details and analytics</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleEdit(campaign)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit campaign settings</p>
                              </TooltipContent>
                            </Tooltip>

                            {campaign.status === 'running' || campaign.status === 'paused' ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => handlePlayPause(campaign)}
                                  >
                                    {campaign.status === 'running' ? (
                                      <Pause className="h-3 w-3" />
                                    ) : (
                                      <Play className="h-3 w-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {campaign.status === 'running' ? 'Pause campaign' : 'Resume campaign'}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  className="text-red-600 border-red-600 hover:bg-red-50"
                                  onClick={() => handleDelete(campaign)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete campaign</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        </div>

        <ConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Campaign"
          description={`Are you sure you want to delete "${campaignToDelete?.name}"? This action cannot be undone.`}
          onConfirm={confirmDelete}
          confirmText="Delete"
          confirmVariant="destructive"
        />
      </TooltipProvider>
    </Layout>
  );
};

export default NPSCampaigns;
