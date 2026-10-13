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

// Session 16.3.8 — bumped v1 -> v2: the system prompt's N/A vs
// CANNOT_VERIFY guidance was strengthened (A3) following the 16.3.6
// investigation into evaluation cbaa9075 (a 20-turn conversation scored
// zero observations / nine unassessable with the placeholder reason
// "N_A"). Every persisted evaluation keeps the exact prompt version it
// ran under (automated_qa_evaluations.prompt_version) — a historical v1
// evaluation is never silently reinterpreted as having used v2 wording.
export const PROMPT_VERSION = 'v2';

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
    // Session 16.3.8 (A3) — N/A and CANNOT_VERIFY are frequently confused
    // by a small model under pressure to resolve a large parameter list
    // quickly. Spelled out explicitly, separate from any one parameter's
    // own line, because the distinction applies to every parameter (N/A)
    // and specifically to response_grounding_rate (CANNOT_VERIFY).
    'N/A and CANNOT_VERIFY mean different things — do not use one for the other. Use N/A (an unassessable_parameters entry) only when this conversation never presented a genuine opportunity to assess that parameter at all — there is nothing to judge, not even uncertainly. Use CANNOT_VERIFY (response_grounding_rate only) when the agent DID make a factual/evidence-backed claim — a real opportunity existed — but you have no way to check that specific claim against evidence. A claim you cannot verify is never, by itself, evidence that the claim was wrong: absence of visible evidence is a data gap, not a finding of NOT_GROUNDED, and it is never silently treated as GROUNDED either.',
    '',
    // Session 16.3.8 (A4) — every unassessable_parameters.reason must be
    // specific to that parameter and this conversation. A generic
    // placeholder ("N_A", "NA", "-", or similar) will be rejected and the
    // response retried — write one concrete sentence explaining what
    // about THIS conversation made the parameter inapplicable.
    'Every unassessable_parameters entry needs a real, parameter-specific reason — one sentence saying what about this specific conversation made that parameter inapplicable (e.g. "The agent never asked a clarifying question, so there was nothing to assess for unnecessary clarification."). Never write a placeholder like "N_A", "NA", "-", or leave the reason effectively empty. It is entirely normal, and not a failure on your part, for several or even all nine parameters to genuinely have no opportunity in a short conversation — just say specifically why for each one.',
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

// Session 16.3.5 (originally generic) -> 16.3.8 (A2 — targeted). The
// 16.3.6 investigation into evaluation cbaa9075 found strong
// circumstantial evidence that a generic "you contradicted yourself,
// fix it" correction caused the model to over-correct into marking ALL
// nine parameters unassessable, discarding several genuinely correct
// assessments along with the one real conflict. This version instead
// names the exact conflicting parameter(s) and explicitly tells the
// model to leave every other parameter's assessment untouched.
export function buildConsistencyRetryInstruction(conflictingCodes: QaParameterCode[]): string {
  const names = conflictingCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(', ');
  return (
    '\n\nCORRECTION REQUIRED: in your previous response, the following parameter(s) appeared in BOTH `observations` and ' +
    `\`unassessable_parameters\` at the same time: ${names}. Each parameter must appear in EXACTLY ONE of the two collections. ` +
    `Re-decide ONLY ${conflictingCodes.length === 1 ? 'this parameter' : 'these parameters'}: look again at whether a genuine assessment opportunity existed for ` +
    `${conflictingCodes.length === 1 ? 'it' : 'each of them'}, and place it in exactly one collection accordingly — do not default to either PASS or N/A, decide based on the actual conversation. ` +
    'Every OTHER parameter in your previous response was NOT part of this conflict — keep those exact same assessments unchanged; do not re-evaluate, remove, or weaken them.'
  );
}

// Session 16.3.8 (A4) — the targeted retry for the "all placeholder
// reasons" defect found in evaluation cbaa9075, mirroring
// buildConsistencyRetryInstruction's "fix only what was wrong" shape
// rather than inviting a second, broader re-evaluation.
export function buildPlaceholderReasonRetryInstruction(placeholderCodes: QaParameterCode[]): string {
  const names = placeholderCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(', ');
  return (
    '\n\nCORRECTION REQUIRED: in your previous response, unassessable_parameters gave a placeholder, non-specific reason ' +
    `(like "N_A", "NA", or "-") for: ${names}. Keep every assessment from your previous response exactly as it was — observations and the ` +
    'other unassessable_parameters entries are unchanged. Only rewrite the reason text for the parameter(s) named above: write one concrete ' +
    'sentence, specific to this conversation, explaining what made a genuine assessment opportunity absent for that parameter. If, on reflection, ' +
    'a real opportunity actually did exist, move that parameter to `observations` with a proper value instead.'
  );
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
