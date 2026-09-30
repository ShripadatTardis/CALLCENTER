import type { AgentSummary } from '@/services/agents/agentsMapper';
import type { CallAgentContract } from '@/types/campaign';

/**
 * Session 9.1 Phase 2, rewritten Session 12.4 — the live `/agents`
 * response now genuinely carries the full agent contract (confirmed
 * live, see src/types/api/agents.ts's header comment), so this function
 * passes it through honestly instead of always returning an empty
 * partial/legacy shape. `contractSource: 'partner_api'` and
 * `contractCompleteness: 'complete'` for EVERY agent this endpoint
 * returns — including one whose three arrays are genuinely empty (e.g.
 * the inbound default agent, which has no campaign-driven inputs by
 * design): an empty array the API actually returned is a real, complete
 * fact about that agent, never "missing"/"legacy" data. This function
 * still never fabricates a field the API didn't send — see
 * agentsMapper.ts's own "never filtered, reordered, or defaulted" rule,
 * which this simply builds on top of.
 */
export function buildAgentContractFromRoster(agent: AgentSummary): CallAgentContract {
  return {
    agentId: agent.agentId,
    agentName: agent.displayName,
    status: agent.status || undefined,
    direction: agent.direction,
    description: agent.description || agent.personaName,
    expectedInputFields: agent.expectedInputFields.map((f) => ({
      fieldCode: f.fieldCode,
      displayName: f.displayName,
      dataType: f.dataType || undefined,
      required: f.required,
      description: f.description || undefined,
      allowedValues: f.allowedValues.length > 0 ? f.allowedValues : undefined,
      format: f.format || undefined,
    })),
    expectedOutcomes: agent.expectedOutcomes.map((o) => ({
      outcomeCode: o.outcomeCode,
      displayName: o.displayName,
      description: o.description || undefined,
    })),
    outputFields: agent.outputFields.map((f) => ({
      fieldCode: f.fieldCode,
      displayName: f.displayName,
      dataType: f.dataType || undefined,
      description: f.description || undefined,
      nullable: f.nullable,
    })),
    contractSource: 'partner_api',
    contractCompleteness: 'complete',
  };
}
