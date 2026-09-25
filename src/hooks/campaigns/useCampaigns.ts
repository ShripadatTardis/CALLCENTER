import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns } from '@/services/campaigns/campaignsService';

export const campaignsKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignsKeys.all, 'list'] as const,
  list: (page?: number, pageSize?: number) => [...campaignsKeys.lists(), { page, pageSize }] as const,
  details: () => [...campaignsKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignsKeys.details(), id] as const,
  targets: (id: string) => [...campaignsKeys.all, 'targets', id] as const,
};

/** Live campaign list — replaces industryCampaignGenerator.ts (plan §1/§25). */
export function useCampaigns(opts: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: campaignsKeys.list(opts.page, opts.pageSize),
    queryFn: () => fetchCampaigns(opts),
  });
}
