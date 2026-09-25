import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { request } from '@/services/transport/httpClient';
import { useAgents } from '@/hooks/agents/useAgents';

/**
 * Session 6.2 — the shared Domain -> Category -> Agent classification
 * tree, authorized for the current role. Backed by
 * GET /api/agents?action=classification (api/agents/index.ts), which
 * reuses Customer 360's existing category/role primitives
 * (customer360_categories / customer360_category_agents /
 * role_customer360_categories / role_customer360_access) — no new
 * authorization model. See docs/CALL_CENTRE_SESSION6_2_INTERACTION_CLASSIFICATION_PLAN.md.
 *
 * Category assignment is agent_id -> category ONLY (never inferred from
 * intent/transcript/sentiment/etc.) — see that same doc §1/§6.
 */

export interface ClassificationCategory {
  id: string;
  name: string;
  agentIds: string[];
}

export interface Classification {
  domain: string;
  allCategories: boolean;
  categories: ClassificationCategory[];
}

export function useClassification() {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const classificationQuery = useQuery({
    queryKey: ['classification', role],
    queryFn: () =>
      request<Classification>('/agents', {
        method: 'GET',
        query: { action: 'classification' },
        headers: { 'x-user-role': role },
      }),
    enabled: Boolean(user),
  });

  // The classification tree only has agentIds — agent display names are
  // joined client-side from the same real /agents roster every other
  // screen already uses (useAgents), rather than duplicating a
  // name-resolution fetch server-side.
  const agentsQuery = useAgents();

  return {
    ...classificationQuery,
    agentsById: new Map((agentsQuery.data?.agents ?? []).map((a) => [a.agentId, a])),
    isLoading: classificationQuery.isLoading || agentsQuery.isLoading,
  };
}
