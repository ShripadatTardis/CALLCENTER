import { request } from '@/services/transport/httpClient';
import type { QaParameterCode, QaResultValue } from '@/lib/qaParameters';
import type { QaTurn } from '@/lib/qaConversation';
import type { QaChannel } from './qaService';

/**
 * Session 16.3 — Automated QA. Thin service layer over the consolidated
 * /api/admin route (`?resource=automatedQa`), same 12-function Hobby-plan
 * ceiling reason as every other admin-dispatched resource.
 */

export type AutomatedQaStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export interface AutomatedQaObservation {
  id: string;
  evaluationId: string;
  parameterCode: QaParameterCode;
  value: QaResultValue;
  primaryTurnId: string;
  evidenceTurnIds: string[];
  reasonCode: string | null;
  explanation: string | null;
  createdAt: string;
}

export interface AutomatedQaUnassessableParameter {
  parameterCode: QaParameterCode;
  reason: string;
}

export interface AutomatedQaEvaluation {
  id: string;
  interactionId: string;
  channel: QaChannel;
  agentId: string;
  upstreamSid: string | null;
  status: AutomatedQaStatus;
  initiatedBy: string;
  startedAt: string | null;
  completedAt: string | null;
  modelId: string | null;
  promptVersion: string;
  contractVersion: string;
  schemaVersion: string;
  requestIds: string[];
  transcriptSnapshot: QaTurn[];
  transcriptHash: string;
  evaluatedTurnIds: string[];
  uncoveredTurnIds: string[];
  unassessableParameters: AutomatedQaUnassessableParameter[];
  evaluationCompleteness: 'COMPLETE' | 'PARTIAL';
  windowCount: number;
  tokenUsage: { promptTokens: number; completionTokens: number } | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  observations?: AutomatedQaObservation[];
}

export async function startAutomatedQaEvaluation(interactionId: string, channel: QaChannel, agentId: string): Promise<AutomatedQaEvaluation> {
  const res = await request<{ data: AutomatedQaEvaluation }>('/admin', {
    method: 'POST',
    query: { resource: 'automatedQa', action: 'start' },
    body: { interactionId, channel, agentId },
  });
  return res.data;
}

export async function fetchAutomatedQaEvaluation(evaluationId: string): Promise<AutomatedQaEvaluation> {
  const res = await request<{ data: AutomatedQaEvaluation }>('/admin', {
    query: { resource: 'automatedQa', action: 'get', evaluationId },
  });
  return res.data;
}

export async function listAutomatedQaEvaluationsForInteraction(interactionId: string, channel: QaChannel): Promise<AutomatedQaEvaluation[]> {
  const res = await request<{ data: AutomatedQaEvaluation[] }>('/admin', {
    query: { resource: 'automatedQa', action: 'listForInteraction', interactionId, channel },
  });
  return res.data;
}

export async function listAutomatedQaEvaluations(status?: AutomatedQaStatus): Promise<AutomatedQaEvaluation[]> {
  const res = await request<{ data: AutomatedQaEvaluation[] }>('/admin', {
    query: status ? { resource: 'automatedQa', action: 'list', status } : { resource: 'automatedQa', action: 'list' },
  });
  return res.data;
}

/** Session 16.4.4.1 — per-attempt LLM diagnostics for one evaluation
 * (request/response, structured validation detail, retry relationships).
 * Distinct from `AutomatedQaEvaluation` itself and from "evaluation
 * history" (multiple separate evaluation RUNS of the same interaction) —
 * these are the one-or-more LLM call ATTEMPTS inside a single evaluation
 * run. Gated server-side on `automated_qa.diagnostics.view`, a narrower
 * permission than `qa.automated.view`. */
export type AutomatedQaAttemptOutcome =
  | 'success' | 'transport_failure' | 'parse_failure' | 'llm_error'
  | 'contradictory_applicability' | 'uninformative_unassessability';

export interface AutomatedQaAttemptDiagnostic {
  id: string;
  evaluationId: string;
  windowIndex: number;
  /** 1-based within (evaluationId, windowIndex). */
  attemptNumber: number;
  requestId: string;
  modelId: string | null;
  outcome: AutomatedQaAttemptOutcome;
  errorCode: string | null;
  errorMessage: string | null;
  /** Exact response body text, never normalized/corrected. Null only for
   * a transport-level failure that never received a body. */
  rawResponse: string | null;
  validationDetail: Record<string, unknown> | null;
  /** The previous attempt's error/defect code, or null for the first
   * attempt in a window. */
  retryReason: string | null;
  correctionInstructionId: string | null;
  previousAttemptId: string | null;
  requestedMaxOutputTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function fetchAutomatedQaDiagnostics(evaluationId: string): Promise<AutomatedQaAttemptDiagnostic[]> {
  const res = await request<{ data: AutomatedQaAttemptDiagnostic[] }>('/admin', {
    query: { resource: 'automatedQa', action: 'diagnostics', evaluationId },
  });
  return res.data;
}
