import { QA_PARAMETERS, QA_PARAMETER_CODES, type QaParameterCode } from './qaParameters.js';
import type { QaTurn } from './qaConversation.js';

/**
 * Session 16.3 — prompt construction. VoiceForce owns the evaluation
 * instructions and conversation preparation (brief §4); this module is
 * pure (no I/O, no LLM call) so it's independently testable.
 *
 * Independence (brief §5, non-negotiable): this prompt NEVER receives
 * Human QA findings, PASS/FAIL values, ratios, reviewer notes, evidence
 * selections, or business conclusions — only the raw transcript and the
 * canonical parameter dictionary, both of which also exist independent
 * of any Human QA review ever having happened.
 */

export const PROMPT_VERSION = 'v1';

function parameterLine(code: QaParameterCode): string {
  const def = QA_PARAMETERS[code];
  return `- ${code} ("${def.displayName}", ${def.dimension}): allowed values [${def.allowedValues.join(', ')}], clean value "${def.cleanValue}", problem reason codes [${def.reasonCodes.join(', ')}]. ${def.shortHelp}`;
}

export function buildSystemPrompt(): string {
  const paramLines = QA_PARAMETER_CODES.map(parameterLine).join('\n');
  return [
    'You are an independent conversation-quality evaluator for a banking voice/chat assistant. You assess ONLY the nine parameters below, using ONLY the conversation given to you.',
    '',
    'For each parameter, first decide whether a genuine opportunity to assess it exists in this conversation (applicability). If no such opportunity exists, add an entry to unassessable_parameters instead of guessing a value. Do not record a parameter as PASS (or its clean value) just because nothing seems wrong when there was never a real opportunity to test it.',
    '',
    'For each applicable parameter, decide the value using exactly its own allowed values. Use the clean value when the agent handled it correctly. Use a problem value — with a reason_code from that parameter\'s own list — when there is a genuine issue. For response_grounding_rate specifically: if you cannot verify whether the agent\'s claim is factually supported because no source/policy evidence is available to you, use CANNOT_VERIFY, which is a data-availability gap, not a quality failure — never guess GROUNDED or NOT_GROUNDED without a basis.',
    '',
    'Parameters:',
    paramLines,
    '',
    'Every observation must reference primary_turn_id using one of the exact turn ids given in the conversation — never invent a turn id, never use a position number.',
    '',
    'You are evaluating independently. You have not seen and must not assume any prior human review of this conversation.',
    '',
    'Respond only with JSON matching the given schema.',
  ].join('\n');
}

function formatTurn(turn: QaTurn): string {
  return `[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`;
}

export function buildUserPrompt(turns: QaTurn[], windowIndex: number, windowCount: number): string {
  const header = windowCount > 1
    ? `This is part ${windowIndex + 1} of ${windowCount} of one conversation, shown in order. Only use the turn ids shown in this part.`
    : 'This is the full conversation.';
  const body = turns.map(formatTurn).join('\n');
  return `${header}\n\n${body}`;
}
