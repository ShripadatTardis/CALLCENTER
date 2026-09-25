import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsKeys } from './useCampaigns';
import {
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  retryTarget,
  scheduleFollowup,
  startCampaign,
  stopCampaign,
} from '@/services/campaigns/campaignsService';
import type { CreateCampaignInput } from '@/types/campaign';

/** Every action genuinely persists real state (plan §15) — never a misleading no-op (see NPS's own audit, plan §2). */
export function useCampaignActions(campaignId?: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
    if (campaignId) {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.targets(campaignId) });
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) => createCampaign(input),
    onSuccess: invalidate,
  });

  const start = useMutation({ mutationFn: (id: string) => startCampaign(id), onSuccess: invalidate });
  const pause = useMutation({ mutationFn: (id: string) => pauseCampaign(id), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: (id: string) => resumeCampaign(id), onSuccess: invalidate });
  const stop = useMutation({ mutationFn: (id: string) => stopCampaign(id), onSuccess: invalidate });
  const retry = useMutation({ mutationFn: (targetId: string) => retryTarget(targetId), onSuccess: invalidate });
  const followup = useMutation({ mutationFn: scheduleFollowup, onSuccess: invalidate });

  return { create, start, pause, resume, stop, retry, followup };
}
