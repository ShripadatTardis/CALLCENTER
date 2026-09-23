import { useQuery } from '@tanstack/react-query';
import { agentsKeys } from '@/services/agents/agentsKeys';
import { fetchAgents } from '@/services/agents/agentsService';

/**
 * Live agent directory — replaces every mock agent source (industry
 * generator, initiateCallAgents.ts) for screens converted in Session 2.
 */
export function useAgents() {
  return useQuery({
    queryKey: agentsKeys.lists(),
    queryFn: fetchAgents,
  });
}
