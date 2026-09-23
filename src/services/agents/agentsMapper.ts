import type { AgentSummaryDto } from '@/types/api/agents';

/**
 * Minimal UI-facing agent summary. Kept intentionally small — mirrors
 * only the 3 fields confirmed in AgentSummaryDto (see
 * src/types/api/agents.ts for why this is provisional).
 */
export interface AgentSummary {
  agentId: string;
  displayName: string;
  direction: string;
}

export function mapAgentSummary(dto: AgentSummaryDto): AgentSummary {
  return {
    agentId: dto.agent_id,
    displayName: dto.name,
    direction: dto.direction,
  };
}
