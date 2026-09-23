import { request } from '@/services/transport/httpClient';
import type { AgentsResponseDto } from '@/types/api/agents';
import { mapAgentsResponse, type AgentSummary } from './agentsMapper';

/**
 * Agents domain service. See src/types/api/agents.ts — the /agents
 * contract is now confirmed against a real live response (2026-09-23):
 * an object with `default_agent_id` and an `agents` array, not a flat
 * array. X-API-Key auth is confirmed required (the proxy attaches it).
 */
export async function fetchAgents(): Promise<{ defaultAgentId: string; agents: AgentSummary[] }> {
  const dto = await request<AgentsResponseDto>('/agents', { method: 'GET' });
  return mapAgentsResponse(dto);
}
