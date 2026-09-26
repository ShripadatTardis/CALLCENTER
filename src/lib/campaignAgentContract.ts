import type { AgentSummary } from '@/services/agents/agentsMapper';
import type { CallAgentContract } from '@/types/campaign';

/**
 * Session 9.1 Phase 2 — frontend mirror of
 * src/server/campaigns/agentContract.ts (same "adapt honestly, never
 * fabricate" rule). Today's live /agents roster (mapped to AgentSummary
 * by agentsMapper.ts) has no expected-input/outcome/output metadata, so
 * every contract built here is `contractSource: 'legacy'` and
 * `contractCompleteness: 'partial'` with all three arrays empty.
 */
export function buildAgentContractFromRoster(agent: AgentSummary): CallAgentContract {
  return {
    agentId: agent.agentId,
    agentName: agent.displayName,
    direction: agent.direction,
    description: agent.personaName,
    expectedInputFields: [],
    expectedOutcomes: [],
    outputFields: [],
    contractSource: 'legacy',
    contractCompleteness: 'partial',
  };
}
