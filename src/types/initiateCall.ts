/**
 * Session 2: AIAgent, CallPayload, and InitiatedCall (Vapi-shaped) were
 * removed here — replaced by AgentSummary (src/services/agents/agentsMapper.ts),
 * TriggerCallRequestDto (src/types/api/calls.ts), and Interaction
 * (src/types/interaction.ts) respectively. CallConfiguration is kept —
 * it's a backend-agnostic form-state shape, still accurate.
 */
export interface CallConfiguration {
  phoneNumber: string;
  selectedAgent: string;
  /** Session 13.3 — direct operator-entered values for the selected agent's declared contract inputs (src/lib/agentContractInputs.ts). Keyed by fieldCode; reset whenever selectedAgent changes. */
  agentInputs: Record<string, unknown>;
}
