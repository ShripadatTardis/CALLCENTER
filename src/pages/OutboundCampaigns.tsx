
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { sampleCallScripts } from '@/data/sampleCallScripts';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';
import { useIndustry } from '@/contexts/IndustryContext';
import { OutboundCampaign } from '@/types/auth';
import { CreateCampaignDialog } from '@/components/campaigns/CreateCampaignDialog';
import { TranscriptDialog } from '@/components/campaigns/TranscriptDialog';
import { RecordingDialog } from '@/components/campaigns/RecordingDialog';
import { CampaignOverviewStats } from '@/components/campaigns/CampaignOverviewStats';
import { CampaignFilters } from '@/components/campaigns/CampaignFilters';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import { getIndustrySpecificCampaigns } from '@/utils/industryCampaignGenerator';
import { getIndustrySpecificCampaignContacts } from '@/utils/industryCampaignContactGenerator';
import { Plus } from 'lucide-react';

const OutboundCampaigns: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaignType, setSelectedCampaignType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [transcriptDialog, setTranscriptDialog] = useState({ open: false, contact: null });
  const [recordingDialog, setRecordingDialog] = useState({ open: false, contact: null });
  
  const industryData = useIndustryData();
  const { getTerminology } = useIndustryTerminology();
  const { selectedIndustry } = useIndustry();

  // Get industry-specific campaigns
  const industryCampaigns = getIndustrySpecificCampaigns(selectedIndustry);

  const filteredCampaigns = industryCampaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         campaign.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedCampaignType === 'all' || campaign.campaignType === selectedCampaignType;
    const matchesStatus = selectedStatus === 'all' || campaign.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getCampaignContacts = (campaignId: string) => {
    return getIndustrySpecificCampaignContacts(selectedIndustry, campaignId);
  };

  const getOverallStats = () => {
    const totalCampaigns = industryCampaigns.length;
    const activeCampaigns = industryCampaigns.filter(c => c.status === 'running').length;
    const totalContacts = industryCampaigns.reduce((sum, c) => sum + c.totalContacts, 0);
    const totalCalls = industryCampaigns.reduce((sum, c) => sum + c.callsMade, 0);
    const avgSuccessRate = industryCampaigns.reduce((sum, c) => sum + c.successRate, 0) / totalCampaigns;

    return { totalCampaigns, activeCampaigns, totalContacts, totalCalls, avgSuccessRate };
  };

  const handleEdit = (campaign: OutboundCampaign) => {
    console.log('Editing campaign:', campaign.name);
    // Mock edit functionality
  };

  const handleDuplicate = (campaign: OutboundCampaign) => {
    console.log('Duplicating campaign:', campaign.name);
    // Mock duplicate functionality
  };

  const handleTranscriptClick = (contact: any) => {
    setTranscriptDialog({ open: true, contact });
  };

  const handleRecordingClick = (contact: any) => {
    setRecordingDialog({ open: true, contact });
  };

  const stats = getOverallStats();

  if (selectedCampaign) {
    const campaignContacts = getCampaignContacts(selectedCampaign.id);
    const script = sampleCallScripts.find(s => s.id === selectedCampaign.scriptId);

    return (
      <Layout>
        <CampaignDetail
          campaign={selectedCampaign}
          contacts={campaignContacts}
          script={script}
          onBack={() => setSelectedCampaign(null)}
          onTranscriptClick={handleTranscriptClick}
          onRecordingClick={handleRecordingClick}
        />

        <TranscriptDialog
          open={transcriptDialog.open}
          onOpenChange={(open) => setTranscriptDialog({ ...transcriptDialog, open })}
          contact={transcriptDialog.contact}
        />

        <RecordingDialog
          open={recordingDialog.open}
          onOpenChange={(open) => setRecordingDialog({ ...recordingDialog, open })}
          contact={recordingDialog.contact}
        />
      </Layout>
    );
  }

  return (
    <TooltipProvider>
      <Layout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Outbound Campaigns</h1>
              <p className="text-slate-600">Manage AI-powered proactive voice campaigns</p>
            </div>
            <Button 
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600"
              onClick={() => navigate('/outbound-campaigns/create')}
            >
              <Plus className="h-4 w-4" />
              <span>Create Campaign</span>
            </Button>
          </div>

          <CampaignOverviewStats stats={stats} />

          <CampaignFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedCampaignType={selectedCampaignType}
            setSelectedCampaignType={setSelectedCampaignType}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
          />

          <CampaignGrid
            campaigns={filteredCampaigns}
            onViewCampaign={setSelectedCampaign}
            onEditCampaign={handleEdit}
            onDuplicateCampaign={handleDuplicate}
          />
        </div>

        <TranscriptDialog
          open={transcriptDialog.open}
          onOpenChange={(open) => setTranscriptDialog({ ...transcriptDialog, open })}
          contact={transcriptDialog.contact}
        />

        <RecordingDialog
          open={recordingDialog.open}
          onOpenChange={(open) => setRecordingDialog({ ...recordingDialog, open })}
          contact={recordingDialog.contact}
        />
      </Layout>
    </TooltipProvider>
  );
};

export default OutboundCampaigns;
