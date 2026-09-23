/**
 * PROVISIONAL — the /api/v1/agents response schema is NOT fully
 * documented in the vendor's reference docs. Only these 3 fields are
 * confirmed, from the example table in the Trigger Call API doc
 * (agent_id, display name, direction):
 *
 *   agent_id                | Display name          | Direction
 *   emi-reminder-agent      | EMI Reminder           | outbound
 *   forex-transaction-agent | Forex Transaction      | outbound
 *   inbound-banking-default | Inbound Banking Asst.  | inbound (default)
 *
 * Auth requirements, pagination, and the full field set are unconfirmed.
 *
 * Attempted to resolve this during Session 1 by fetching the live
 * Swagger UI (https://bankingvoicebot.nl-demo.com/api/v1/docs) and the
 * raw OpenAPI spec (https://bankingvoicebot.nl-demo.com/api/v1/openapi.yaml).
 * Both requests, and a request to the bare base URL, returned HTTP 502
 * Bad Gateway — the demo host itself was unreachable at the time, not a
 * permissions/auth problem specific to the docs path. Re-attempt this
 * fetch once the demo host is confirmed reachable, and revise this file
 * (and its proxy at /api/agents/index.ts, and agentsMapper.ts) against
 * the confirmed contract before trusting anything beyond the 3 fields
 * below.
 */
export interface AgentSummaryDto {
  agent_id: string;
  /** Exact key name unconfirmed — verify against the live response. */
  name: string;
  /** e.g. "inbound" | "outbound" — kept as string, not a union, until confirmed. */
  direction: string;
}

/**
 * Response shape is ALSO unconfirmed — assumed to be a flat array for
 * now (no documented pagination). Revise once the real contract is known.
 */
export type AgentsResponseDto = AgentSummaryDto[];
