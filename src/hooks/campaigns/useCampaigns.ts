import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCampaignAuditEvents,
  fetchCampaignClassifications,
  fetchCampaignConfigurationVersions,
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
