import type { AgentInputFieldDto, AgentOutcomeDto, AgentOutputFieldDto, AgentsResponseDto, AgentSummaryDto } from '@/types/api/agents';

/**
 * UI-facing agent summary, mapped from the confirmed live /agents
 * response (see src/types/api/agents.ts).
 *
 * Session 12.4 — extended to the full agent contract (expected input
 * fields / expected outcomes / output fields), confirmed live rather
 * than assumed. Every array is passed through verbatim (mapped field
 * names only) — never filtered, reordered, or defaulted; an agent that
 * genuinely declares zero fields (the inbound default agent) keeps its
 * real empty arrays.
 */
export interface AgentInputField {
  fieldCode: string;
  displayName: string;
  dataType: string;
  required: boolean;
  description: string;
  allowedValues: string[];
  format: string;
}

export interface AgentOutcome {
  outcomeCode: string;
  displayName: string;
  description: string;
}

export interface AgentOutputField {
  fieldCode: string;
  displayName: string;
  dataType: string;
  nullable: boolean;
  description: string;
}

export interface AgentSummary {
  agentId: string;
  agentName: string;
  displayName: string;
  personaName: string;
  direction: string;
  status: string;
  description: string;
  language: string;
  isDefault: boolean;
  expectedInputFields: AgentInputField[];
  expectedOutcomes: AgentOutcome[];
  outputFields: AgentOutputField[];
}

function mapInputField(dto: AgentInputFieldDto): AgentInputField {
  return {
    fieldCode: dto.field_code,
    displayName: dto.display_name,
    dataType: dto.data_type,
    required: dto.required,
    description: dto.description,
    allowedValues: dto.allowed_values ?? [],
    format: dto.format ?? '',
  };
}

function mapOutcome(dto: AgentOutcomeDto): AgentOutcome {
  return { outcomeCode: dto.outcome_code, displayName: dto.display_name, description: dto.description };
}

function mapOutputField(dto: AgentOutputFieldDto): AgentOutputField {
  return {
    fieldCode: dto.field_code,
    displayName: dto.display_name,
    dataType: dto.data_type,
    nullable: dto.nullable,
    description: dto.description,
  };
}

export function mapAgentSummary(dto: AgentSummaryDto): AgentSummary {
  return {
    agentId: dto.agent_id,
    agentName: dto.agent_name,
    displayName: dto.display_name,
    personaName: dto.persona_name,
    direction: dto.direction,
    status: dto.status,
    description: dto.description,
    language: dto.language,
    isDefault: dto.is_default,
    expectedInputFields: (dto.expected_input_fields ?? []).map(mapInputField),
    expectedOutcomes: (dto.expected_outcomes ?? []).map(mapOutcome),
    outputFields: (dto.output_fields ?? []).map(mapOutputField),
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
