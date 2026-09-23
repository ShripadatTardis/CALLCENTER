import type { AgentsResponseDto, AgentSummaryDto } from '@/types/api/agents';

/**
 * UI-facing agent summary, mapped from the confirmed live /agents
 * response (see src/types/api/agents.ts).
 */
export interface AgentSummary {
  agentId: string;
  displayName: string;
  personaName: string;
  direction: string;
  language: string;
  isDefault: boolean;
}

export function mapAgentSummary(dto: AgentSummaryDto): AgentSummary {
  return {
    agentId: dto.agent_id,
    displayName: dto.display_name,
    personaName: dto.persona_name,
    direction: dto.direction,
    language: dto.language,
    isDefault: dto.is_default,
  };
}

export function mapAgentsResponse(dto: AgentsResponseDto): {
  defaultAgentId: string;
  agents: AgentSummary[];
} {
  return {
    defaultAgentId: dto.default_agent_id,
    agents: dto.agents.map(mapAgentSummary),
  };
}
