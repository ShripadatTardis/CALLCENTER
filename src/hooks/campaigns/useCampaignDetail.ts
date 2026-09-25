import { useQuery } from '@tanstack/react-query';
import { campaignsKeys } from './useCampaigns';
import { fetchCampaignDetail, fetchCampaignTargets } from '@/services/campaigns/campaignsService';

export function useCampaignDetail(campaignId: string | undefined) {
  return useQuery({
    queryKey: campaignsKeys.detail(campaignId ?? ''),
    queryFn: () => fetchCampaignDetail(campaignId as string),
    enabled: Boolean(campaignId),
  });
}

export function useCampaignTargets(campaignId: string | undefined, opts: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: [...campaignsKeys.targets(campaignId ?? ''), opts],
    queryFn: () => fetchCampaignTargets(campaignId as string, opts),
    enabled: Boolean(campaignId),
  });
}
