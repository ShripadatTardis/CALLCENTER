import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { campaignsKeys } from './useCampaigns';
import {
  addCampaignTargets,
  amendCampaignTarget,
  createCampaign,
  holdCampaignTarget,
  pauseCampaign,
  releaseCampaignTargetHold,
  resumeCampaign,
  retryTarget,
  scheduleFollowup,
  skipCampaignTarget,
  startCampaign,
  stopCampaign,
} from '@/services/campaigns/campaignsService';
import type { CreateCampaignInput, ImportTargetRow } from '@/types/campaign';

/**
 * Every action genuinely persists real state (plan §15) — never a
 * misleading no-op (see NPS's own audit, plan §2). Session 9.2: every
 * mutation sends the current session's role so the server can enforce
 * the same category authorization Call Logs/Chat Logs already have
 * (see api/campaigns.ts) — an unauthorized action now fails with a
 * real 403/404 from the server, not a client-side illusion of success.
 */
export function useCampaignActions(campaignId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
    if (campaignId) {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.targets(campaignId) });
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) => createCampaign(input, role),
    onSuccess: invalidate,
  });

  const start = useMutation({ mutationFn: (id: string) => startCampaign(id, role), onSuccess: invalidate });
  // Session 12.7 §14 — pause/stop now require a non-empty reason, enforced server-side.
  const pause = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => pauseCampaign(id, reason, role),
    onSuccess: invalidate,
  });
  const resume = useMutation({ mutationFn: (id: string) => resumeCampaign(id, role), onSuccess: invalidate });
  const stop = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => stopCampaign(id, reason, role),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: ({ targetId, reason }: { targetId: string; reason?: string | null }) => retryTarget(targetId, reason, role),
    onSuccess: invalidate,
  });
  const followup = useMutation({
    mutationFn: (input: Parameters<typeof scheduleFollowup>[0]) => scheduleFollowup(input, role),
    onSuccess: invalidate,
  });

  // Session 12.7 — target controls. All invalidate the same target/detail
  // queries as every other mutation here, so the table reflects the new
  // state immediately without a manual refetch call at each call site.
  const skip = useMutation({
    mutationFn: ({ targetId, reasonCode, comment }: { targetId: string; reasonCode: string; comment: string | null }) =>
      skipCampaignTarget(targetId, reasonCode, comment, role),
    onSuccess: invalidate,
  });
  const hold = useMutation({
    mutationFn: ({ targetId, reason, note }: { targetId: string; reason: string | null; note: string | null }) =>
      holdCampaignTarget(targetId, reason, note, role),
    onSuccess: invalidate,
  });
  const releaseHold = useMutation({
    mutationFn: (targetId: string) => releaseCampaignTargetHold(targetId, role),
    onSuccess: invalidate,
  });
  const amend = useMutation({
    mutationFn: ({
      targetId,
      sourceAttributes,
      reason,
    }: {
      targetId: string;
      sourceAttributes: Record<string, unknown>;
      reason: string | null;
    }) => amendCampaignTarget(targetId, sourceAttributes, reason, role),
    onSuccess: invalidate,
  });
  const addTargets = useMutation({
    mutationFn: ({ id, rows }: { id: string; rows: ImportTargetRow[] }) => addCampaignTargets(id, rows, role),
    onSuccess: invalidate,
  });

  return { create, start, pause, resume, stop, retry, followup, skip, hold, releaseHold, amend, addTargets };
}
