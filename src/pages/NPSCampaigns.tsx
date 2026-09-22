import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-orange-100 text-orange-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">NPS Campaigns</h1>
              <p className="text-slate-600">Launch and monitor Net Promoter Score surveys using AI agents</p>
            </div>
            <CreateNPSCampaignDialog npsScripts={npsScripts}>
              <Button className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600">
                <Plus className="h-4 w-4" />
                <span>Create Campaign</span>
              </Button>
            </CreateNPSCampaignDialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCampaigns}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                <Play className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeCampaigns}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalResponses}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average NPS</CardTitle>
                <div className="text-2xl">⭐</div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgNPS}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <Input
                    placeholder="Search campaigns..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm"
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
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="all">All Channels</option>
                  <option value="voice">Voice</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 font-medium text-slate-700">Campaign Name</th>
                      <th className="text-left py-3 font-medium text-slate-700">Status</th>
                      <th className="text-left py-3 font-medium text-slate-700">Channel</th>
                      <th className="text-left py-3 font-medium text-slate-700">NPS Score</th>
                      <th className="text-left py-3 font-medium text-slate-700">Participants</th>
                      <th className="text-left py-3 font-medium text-slate-700">Responses</th>
                      <th className="text-left py-3 font-medium text-slate-700">Start Date</th>
                      <th className="text-left py-3 font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3">
                          <div>
                            <div className="font-medium text-slate-900">{campaign.name}</div>
                            <div className="text-xs text-slate-500">{campaign.description}</div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge className={getStatusBadgeColor(campaign.status)}>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center space-x-2">
                            {getChannelIcon(campaign.targetChannel)}
                            <span className="capitalize">{campaign.targetChannel}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <NPSBadge score={campaign.npsScore} variant="compact" />
                        </td>
                        <td className="py-3 text-slate-900">{campaign.totalContacts}</td>
                        <td className="py-3">
                          <div className="text-slate-900">{campaign.responseCount}</div>
                          <div className="text-xs text-slate-500">
                            {Math.round((campaign.responseCount / campaign.totalContacts) * 100)}% response rate
                          </div>
                        </td>
                        <td className="py-3 text-slate-600">
                          {format(campaign.launchDate, 'MMM dd, yyyy')}
                        </td>
                        <td className="py-3">
                          <div className="flex space-x-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
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
                                  size="sm"
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
                                    size="sm"
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
                                  size="sm" 
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
            </CardContent>
          </Card>
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
