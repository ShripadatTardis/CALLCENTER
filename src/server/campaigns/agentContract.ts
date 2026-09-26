import type { AgentSummaryDto } from '../../types/api/agents.js';
import type { CallAgentContract } from './types.js';

/**
 * Session 9.1 Phase 2 — adapts today's live `/agents` roster response
 * into a CallAgentContract, honestly. `/agents` (src/types/api/agents.ts)
 * confirmed live to return only agent_id/display_name/persona_name/
 * direction/language/is_default — no expected-input, expected-outcome,
 * or output-field metadata exists in the Partner API today.
 *
 * This function therefore NEVER invents defaults for the three metadata
 * arrays — it always returns them empty with `contractSource: 'legacy'`
 * and `contractCompleteness: 'partial'` against today's roster. The
 * shape is ready for a future, richer `/agents` response (Partner API
 * dependency P0, see docs/SESSION_9_1_OUTBOUND_CAMPAIGN_DOMAIN_BUILD.md
 * §11) without requiring a campaign-engine rewrite when that lands —
 * only this one function's body would change.
 */
export function buildAgentContractFromRoster(agent: AgentSummaryDto): CallAgentContract {
  return {
    agentId: agent.agent_id,
    agentName: agent.display_name,
    status: undefined,
    direction: agent.direction,
    description: agent.persona_name,
    expectedInputFields: [],
    expectedOutcomes: [],
    outputFields: [],
    contractSource: 'legacy',
    contractCompleteness: 'partial',
  };
}
