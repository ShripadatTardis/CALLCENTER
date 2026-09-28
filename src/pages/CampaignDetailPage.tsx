import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCampaignDetail, useCampaignTargets } from '@/hooks/campaigns/useCampaignDetail';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import { resolveDetailOrigin, type DetailNavigationState } from '@/lib/detailOrigin';

/**
 * Session 12.1 — real routed Campaign Detail (/outbound-campaigns/:campaignId),
 * replacing OutboundCampaigns.tsx's previous local-state conditional
 * render. Directly addressable/bookmarkable, works on a hard refresh
 * (no in-memory-only state required to render correctly), and applies
 * N1 origin-aware navigation exactly like CustomerDetail.tsx/AgentDetail.tsx
 * already do — same mechanism, not a parallel one.
 */
const CampaignDetailPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = resolveDetailOrigin((location.state as DetailNavigationState | null)?.origin, 'outbound-campaigns');

  const detailQuery = useCampaignDetail(campaignId);
  const targetsQuery = useCampaignTargets(campaignId, { pageSize: 200 });
  const { refetch: refetchList } = useCampaigns();

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
          <Button variant="outline" onClick={() => navigate(returnTo.path)}>
            ← Back to {returnTo.label}
          </Button>
          <QueryErrorBanner error={detailQuery.error} onRetry={() => void detailQuery.refetch()} isFetching={detailQuery.isFetching} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <CampaignDetail
        campaign={detailQuery.data}
        targets={targetsQuery.data?.data ?? []}
        onBack={() => navigate(returnTo.path)}
        onRefetch={() => {
          void detailQuery.refetch();
          void targetsQuery.refetch();
          void refetchList();
        }}
      />
    </Layout>
  );
};

export default CampaignDetailPage;
