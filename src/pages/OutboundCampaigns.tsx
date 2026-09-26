import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, Plus } from 'lucide-react';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { useCampaignDetail, useCampaignTargets } from '@/hooks/campaigns/useCampaignDetail';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { CampaignOverviewStats } from '@/components/campaigns/CampaignOverviewStats';
import { CampaignFilters } from '@/components/campaigns/CampaignFilters';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import type { CampaignWithStats } from '@/types/campaign';

const OutboundCampaigns: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useCampaigns();
  const campaigns = data?.data ?? [];

  const detailQuery = useCampaignDetail(selectedCampaignId ?? undefined);
  const targetsQuery = useCampaignTargets(selectedCampaignId ?? undefined, { pageSize: 200 });

  const filteredCampaigns = campaigns.filter((campaign: CampaignWithStats) => {
    const matchesSearch =
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (campaign.description ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || campaign.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  if (selectedCampaignId) {
    if (detailQuery.isLoading || targetsQuery.isLoading) {
      return (
        <Layout>
          <div className="p-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading campaign…
          </div>
        </Layout>
      );
    }

    if (detailQuery.isError || !detailQuery.data) {
      return (
        <Layout>
          <div className="p-6 space-y-4">
            <Button variant="outline" onClick={() => setSelectedCampaignId(null)}>
              ← Back to Campaigns
            </Button>
            <QueryErrorBanner
              error={detailQuery.error}
              onRetry={() => void detailQuery.refetch()}
              isFetching={detailQuery.isFetching}
            />
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
        <CampaignDetail
          campaign={detailQuery.data}
          targets={targetsQuery.data?.data ?? []}
          onBack={() => setSelectedCampaignId(null)}
          onRefetch={() => {
            void detailQuery.refetch();
            void targetsQuery.refetch();
            void refetch();
          }}
        />
      </Layout>
    );
  }

  return (
    <TooltipProvider>
      <Layout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <PageHeader
              pillar="Operationalize"
              title="Outbound Campaigns"
              description="Manage AI-powered proactive voice campaigns."
            />
            <Button
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600"
              onClick={() => navigate('/outbound-campaigns/create')}
            >
              <Plus className="h-4 w-4" />
              <span>Create Campaign</span>
            </Button>
          </div>

          {isError && (
            <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={campaigns.length > 0} isFetching={isFetching} />
          )}

          {data?.scoped && (
            <p className="text-xs text-muted-foreground">
              Showing campaigns for your authorized categories only.
            </p>
          )}

          <CampaignOverviewStats campaigns={campaigns} />

          <CampaignFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
          />

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading campaigns…
            </div>
          ) : (
            <CampaignGrid campaigns={filteredCampaigns} onViewCampaign={(c) => setSelectedCampaignId(c.id)} />
          )}
        </div>
      </Layout>
    </TooltipProvider>
  );
};

export default OutboundCampaigns;
