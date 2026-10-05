import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { CampaignStatStrip } from '@/components/campaigns/CampaignStatStrip';
import { CampaignFiltersBar } from '@/components/campaigns/CampaignFiltersBar';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import type { CampaignWithStats } from '@/types/campaign';
import { typography } from '@/lib/typography';

const PAGE_SIZE = 25;

/**
 * Session 12.1 — Campaign Detail is now a real route
 * (/outbound-campaigns/:campaignId, see CampaignDetailPage.tsx) rather
 * than local state conditionally rendering CampaignDetail inline; this
 * page is the list/index only, matching the Customers.tsx pattern.
 *
 * Real backend pagination wired in (the API already supported
 * page/pageSize — this was a UI-only gap, same class of fix Customers.tsx
 * got in Session 11.5B). Search/status remain client-side filters over
 * the current page only (the campaign list endpoint has no server-side
 * search/status params, and adding them is out of this session's UI-only
 * scope) — with only one real production campaign today this isn't
 * actively broken, but a future session adding real filter dimensions
 * to a growing campaign list should wire them server-side rather than
 * extend this client-side filter further.
 */
const OutboundCampaigns: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [page, setPage] = useState(1);

  // A new filter invalidates the previous page number — same discipline
  // Customers.tsx applies to its own (server-side) search.
  React.useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedStatus]);

  const { data, isLoading, isError, error, refetch, isFetching } = useCampaigns({ page, pageSize: PAGE_SIZE });
  const campaigns = data?.data ?? [];
  const totalCount = data?.pagination.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = data?.pagination.page ?? page;

  const filteredCampaigns = campaigns.filter((campaign: CampaignWithStats) => {
    const matchesSearch =
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (campaign.description ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || campaign.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout>
      {/* L1 — bounded workspace: fixed-height header/toolbar/stats, the
          record grid absorbs growth, pager stays pinned below it. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className={typography.pageTitle}>Outbound Campaigns</h1>
            {data?.scoped && (
              <p className={`${typography.metadata} mt-0.5`}>Showing campaigns for your authorized categories only.</p>
            )}
          </div>
          <Button size="xs" onClick={() => navigate('/outbound-campaigns/create')}>
            <Plus className="h-4 w-4 mr-1" />
            New Campaign
          </Button>
        </div>

        {isError && (
          <div className="flex-shrink-0">
            <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={campaigns.length > 0} isFetching={isFetching} />
          </div>
        )}

        <div className="flex-shrink-0">
          <CampaignStatStrip campaigns={campaigns} />
        </div>

        <div className="flex-shrink-0">
          <CampaignFiltersBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading campaigns…
            </div>
          ) : (
            <CampaignGrid
              campaigns={filteredCampaigns}
              onViewCampaign={(c) => navigate(`/outbound-campaigns/${c.id}`, { state: { origin: 'outbound-campaigns' } })}
            />
          )}
        </div>

        {totalCount > 0 && (
          <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
            <span>
              {totalCount} total campaign{totalCount === 1 ? '' : 's'} · Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isFetching}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isFetching}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OutboundCampaigns;
