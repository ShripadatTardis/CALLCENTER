import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { campaignsKeys } from './useCampaigns';
import { fetchCampaignDetail, fetchCampaignTargets } from '@/services/campaigns/campaignsService';

/** Session 9.2: same server-side category authorization as useCampaigns — see api/campaigns.ts. */
export function useCampaignDetail(campaignId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.detail(campaignId ?? ''), role],
    queryFn: () => fetchCampaignDetail(campaignId as string, role),
    enabled: Boolean(campaignId),
  });
}

export function useCampaignTargets(campaignId: string | undefined, opts: { page?: number; pageSize?: number } = {}) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.targets(campaignId ?? ''), opts, role],
    queryFn: () => fetchCampaignTargets(campaignId as string, opts, role),
    enabled: Boolean(campaignId),
  });
}
