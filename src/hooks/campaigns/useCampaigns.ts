import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCampaignAuditEvents,
  fetchCampaignClassifications,
  fetchCampaignConfigurationVersions,
  fetchCampaignExecutionByInteraction,
  fetchCampaignSkipReasons,
  fetchCampaigns,
} from '@/services/campaigns/campaignsService';

export const campaignsKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignsKeys.all, 'list'] as const,
  list: (page?: number, pageSize?: number) => [...campaignsKeys.lists(), { page, pageSize }] as const,
  details: () => [...campaignsKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignsKeys.details(), id] as const,
  targets: (id: string) => [...campaignsKeys.all, 'targets', id] as const,
  classifications: () => [...campaignsKeys.all, 'classifications'] as const,
  skipReasons: () => [...campaignsKeys.all, 'skipReasons'] as const,
  configurationVersions: (id: string) => [...campaignsKeys.all, 'configurationVersions', id] as const,
  auditEvents: (id: string) => [...campaignsKeys.all, 'auditEvents', id] as const,
  executionByInteraction: (campaignId: string, interactionId: string) =>
    [...campaignsKeys.all, 'executionByInteraction', campaignId, interactionId] as const,
};

/**
 * Session 12.6 — live Universal Campaign Classification roster, the
 * same fetch-live-not-hardcode pattern useAgents() already established
 * for the Agents roster. Reference data, not role-scoped.
 */
export function useCampaignClassifications() {
  return useQuery({
    queryKey: campaignsKeys.classifications(),
    queryFn: fetchCampaignClassifications,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Live campaign list — replaces industryCampaignGenerator.ts (plan §1/§25).
 * Session 9.2: sends the current session's role so the server can apply
 * the same category authorization Call Logs/Chat Logs already have (see
 * api/campaigns.ts) — included in the query key so switching role never
 * serves another role's cached page.
 */
export function useCampaigns(opts: { page?: number; pageSize?: number } = {}) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.list(opts.page, opts.pageSize), role],
    queryFn: () => fetchCampaigns(opts, role),
  });
}

/** Session 12.7 — system-configured Skip Reason master, fetched live. */
export function useCampaignSkipReasons() {
  return useQuery({
    queryKey: campaignsKeys.skipReasons(),
    queryFn: fetchCampaignSkipReasons,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCampaignConfigurationVersions(campaignId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.configurationVersions(campaignId ?? ''), role],
    queryFn: () => fetchCampaignConfigurationVersions(campaignId as string, role),
    enabled: Boolean(campaignId),
  });
}

/**
 * Session 15.3 — the real input values sent for one campaign-triggered
 * interaction (Call Logs' "what was actually sent to the agent"
 * follow-up to Agent Contract). Disabled entirely when the interaction
 * has no campaignId — most calls/chats are not campaign-triggered, and
 * this lookup only ever makes sense for the ones that are.
 */
export function useCampaignExecutionByInteraction(campaignId: string | undefined, interactionId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.executionByInteraction(campaignId ?? '', interactionId ?? ''), role],
    queryFn: () => fetchCampaignExecutionByInteraction(campaignId as string, interactionId as string, role),
    enabled: Boolean(campaignId) && Boolean(interactionId),
  });
}

/** Campaign History's read path. */
export function useCampaignAuditEvents(campaignId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...campaignsKeys.auditEvents(campaignId ?? ''), role],
    queryFn: () => fetchCampaignAuditEvents(campaignId as string, 200, role),
    enabled: Boolean(campaignId),
  });
}
