import type { AutomatedQaObservation } from '@/services/qa/automatedQaService';
import type { CreateCorrectiveActionInput } from './correctiveActionsService';
import { QA_PARAMETERS } from '@/lib/qaParameters';

/**
 * Session 16.5 — QA integration, the FIRST source adapter (brief §7).
 * This is the one place QA-specific knowledge is allowed to exist for
 * Corrective Action Management: it reads a QA-shaped record and
 * produces a plain, normalized `CreateCorrectiveActionInput` that CA
 * Core (correctiveActionsService.ts / the RPCs) accepts with zero
 * awareness of what an "evaluation" or a "finding" is. A future source
 * (Interaction Trace, Campaign Ops, etc.) gets its own adapter file
 * exactly like this one — never a change to CA Core.
 *
 * Deliberately does NOT alter historical QA results and does NOT create
 * a CA merely because an evaluation failed technically — a
 * `contradictory_applicability` evaluator diagnostic failure is never
 * routed through this adapter; only a genuine, real observation (a
 * parameter the evaluator actually assessed) can become a CA, and only
 * via an explicit authorized user action (brief §2G — no automatic
 * generation).
 */

export interface AutomatedQaFindingContext {
  evaluationId: string;
  interactionId: string;
  channel: 'voice' | 'chat';
  agentId: string;
}

/** Prefer a reference to the existing evaluation/observation records
 * over copying a full transcript (brief §7) — sourceReferenceId is the
 * observation's own stable id; sourceContext carries only small,
 * bounded correlation metadata, not conversation content. */
export function buildCorrectiveActionInputFromAutomatedQaObservation(
  observation: AutomatedQaObservation,
  context: AutomatedQaFindingContext,
): CreateCorrectiveActionInput {
  const def = QA_PARAMETERS[observation.parameterCode];
  const title = `${def?.displayName ?? observation.parameterCode} — ${observation.value}`;
  const descriptionParts = [
    observation.explanation?.trim() || 'No explanation was recorded for this finding.',
    observation.reasonCode ? `Reason code: ${observation.reasonCode}.` : null,
  ].filter(Boolean);

  return {
    title,
    description: descriptionParts.join(' '),
    category: 'agent_behavior',
    priority: 'medium',
    agentId: context.agentId,
    sourceType: 'automated_qa_observation',
    sourceReferenceId: observation.id,
    sourceContext: {
      evaluationId: context.evaluationId,
      interactionId: context.interactionId,
      channel: context.channel,
      parameterCode: observation.parameterCode,
      primaryTurnId: observation.primaryTurnId,
      evidenceTurnIds: observation.evidenceTurnIds,
    },
    // Idempotent per observation — re-raising from the same finding never
    // creates a second CA.
    idempotencyKey: `automated_qa_observation:${observation.id}`,
  };
}

export interface HumanQaFindingContext {
  reviewId: string;
  interactionId: string;
  channel: 'voice' | 'chat';
  agentId: string;
}

export interface HumanQaFindingLike {
  id: string;
  parameterCode: string;
  value: string;
  primaryTurnId: string;
  evidenceTurnIds: string[];
  reasonCode: string | null;
  note: string | null;
}

/** Same shape of adapter for a Human QA finding — its existing data
 * model (`call_center.qa_findings`) provides the stable reference id. */
export function buildCorrectiveActionInputFromHumanQaFinding(
  finding: HumanQaFindingLike,
  context: HumanQaFindingContext,
): CreateCorrectiveActionInput {
  const def = QA_PARAMETERS[finding.parameterCode as keyof typeof QA_PARAMETERS];
  const title = `${def?.displayName ?? finding.parameterCode} — ${finding.value}`;
  const descriptionParts = [
    finding.note?.trim() || 'No note was recorded for this finding.',
    finding.reasonCode ? `Reason code: ${finding.reasonCode}.` : null,
  ].filter(Boolean);

  return {
    title,
    description: descriptionParts.join(' '),
    category: 'agent_behavior',
    priority: 'medium',
    agentId: context.agentId,
    sourceType: 'human_qa_finding',
    sourceReferenceId: finding.id,
    sourceContext: {
      reviewId: context.reviewId,
      interactionId: context.interactionId,
      channel: context.channel,
      parameterCode: finding.parameterCode,
      primaryTurnId: finding.primaryTurnId,
      evidenceTurnIds: finding.evidenceTurnIds,
    },
    idempotencyKey: `human_qa_finding:${finding.id}`,
  };
}
