import { request } from '@/services/transport/httpClient';
import type { AgentsResponseDto } from '@/types/api/agents';
import { mapAgentSummary, type AgentSummary } from './agentsMapper';

/**
 * Agents domain service. See src/types/api/agents.ts — the /agents
 * contract is provisional; this service and its proxy route
 * (/api/agents/index.ts) assume a flat, unpaginated array response and
 * the same X-API-Key auth as the other endpoints, neither of which is
 * confirmed. Revise once the Swagger spec is reachable.
 */
export async function fetchAgents(): Promise<AgentSummary[]> {
  const dto = await request<AgentsResponseDto>('/agents', { method: 'GET' });
  return dto.map(mapAgentSummary);
}
