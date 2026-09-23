/**
 * CONFIRMED — verified against the live GET /api/v1/agents response
 * during Session 1's production-foundation follow-up (2026-09-23). The
 * Swagger spec itself was still unreachable (502) at that time, but a
 * real authenticated request through the deployed proxy returned:
 *
 * {
 *   "success": true,
 *   "default_agent_id": "inbound-banking-default",
 *   "agents": [
 *     {
 *       "agent_id": "inbound-banking-default",
 *       "display_name": "Inbound Banking Assistant",
 *       "persona_name": "Sema",
 *       "direction": "inbound",
 *       "language": "en",
 *       "is_default": true
 *     },
 *     ...
 *   ]
 * }
 *
 * This superseded the earlier provisional, flat-array assumption (which
 * was based only on the 3-row example table in the Trigger Call doc).
 */
export interface AgentSummaryDto {
  agent_id: string;
  display_name: string;
  persona_name: string;
  /** Observed values: "inbound" | "outbound" — kept as string since no other values are confirmed. */
  direction: string;
  language: string;
  is_default: boolean;
}

export interface AgentsResponseDto {
  success: boolean;
  default_agent_id: string;
  agents: AgentSummaryDto[];
}
