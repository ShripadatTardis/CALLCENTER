import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { useCampaignDetail, useCampaignTargets } from '@/hooks/campaigns/useCampaignDetail';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { CampaignStatStrip } from '@/components/campaigns/CampaignStatStrip';
import { CampaignFiltersBar } from '@/components/campaigns/CampaignFiltersBar';
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
          <div className="min-h-full bg-background p-4 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaign…
          </div>
        </Layout>
      );
    }

    if (detailQuery.isError || !detailQuery.data) {
      return (
        <Layout>
          <div className="min-h-full bg-background p-4 space-y-4">
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
    <Layout>
      <div className="min-h-full bg-background p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground">Outbound Campaigns</h1>
            {data?.scoped && (
              <p className="text-[11px] text-muted-foreground mt-0.5">Showing campaigns for your authorized categories only.</p>
            )}
          </div>
          <Button size="sm" onClick={() => navigate('/outbound-campaigns/create')}>
            <Plus className="h-4 w-4 mr-1" />
            New Campaign
          </Button>
        </div>

        {isError && (
          <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={campaigns.length > 0} isFetching={isFetching} />
        )}

        <CampaignStatStrip campaigns={campaigns} />

        <CampaignFiltersBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns…
          </div>
        ) : (
          <CampaignGrid campaigns={filteredCampaigns} onViewCampaign={(c) => setSelectedCampaignId(c.id)} />
        )}
      </div>
    </Layout>
  );
};

export default OutboundCampaigns;
