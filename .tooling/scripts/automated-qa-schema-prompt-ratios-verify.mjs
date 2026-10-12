// Session 16.3 — JSON Schema, prompt construction, and the ratio adapter,
// against the REAL compiled modules (via esbuild, not a reimplementation).
import { buildAutomatedQaJsonSchema } from '../tmp/automatedQaSchema.mjs';
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from '../tmp/automatedQaPrompt.mjs';
import { computeAutomatedQaRatios } from '../tmp/automatedQaRatios.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
function assertTrue(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? pass++ : fail++;
}

const CANONICAL_CODES = [
  'context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate',
  'unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate', 'conversation_recovery_rate', 'response_grounding_rate',
];

// --- Schema ---
const schema = buildAutomatedQaJsonSchema();
assert('schema root type is object', schema.type, 'object');
assertTrue('schema requires interaction_assessment/observations/unassessable_parameters', (schema.required ?? []).length === 3);
assert('observations item parameter_code enum uses the exact canonical codes, not synonyms', schema.properties.observations.items.properties.parameter_code.enum, CANONICAL_CODES);
assertTrue('schema is JSON-serializable (no circular refs, no functions)', (() => { try { JSON.stringify(schema); return true; } catch { return false; } })());

// --- Prompt (independence) ---
const systemPrompt = buildSystemPrompt();
for (const code of CANONICAL_CODES) {
  assertTrue(`system prompt documents parameter ${code}`, systemPrompt.includes(code));
}
assertTrue('system prompt states independence from prior human review', /independent|has not seen/i.test(systemPrompt));
assertTrue('system prompt never mentions Human QA findings/PASS-FAIL review data as input', !/qa_review|qa_finding|reviewer_note|human.?(authored|submitted|judgment)/i.test(systemPrompt));

const turns = [
  { turnId: 't1', role: 'customer', speakerLabel: 'Customer', timestamp: '2026-10-07T10:00:00Z', text: 'Is a passport enough for ID?' },
  { turnId: 't2', role: 'agent', speakerLabel: 'AI', timestamp: '2026-10-07T10:00:05Z', text: 'A passport works for identity verification.' },
];
const userPrompt = buildUserPrompt(turns, 0, 1);
assertTrue('user prompt includes every given turn id', turns.every((t) => userPrompt.includes(`[${t.turnId}]`)));
assertTrue('single-window prompt says "full conversation"', userPrompt.includes('full conversation'));
assertTrue('user prompt contains ONLY transcript content, never a Human QA artifact marker', !/qa_review|reviewerNote|PASS\b.*FAIL\b.*reviewer/i.test(userPrompt));

const multiWindowPrompt = buildUserPrompt(turns, 1, 3);
assertTrue('multi-window prompt announces its part number', multiWindowPrompt.includes('part 2 of 3'));
assert('PROMPT_VERSION is a stable, non-empty string', typeof PROMPT_VERSION === 'string' && PROMPT_VERSION.length > 0, true);

// --- Ratio adapter (reuses computeQaRatios — field rename only, no new math) ---
const observations = [
  { evaluationId: 'eval-1', parameterCode: 'task_progression_rate', value: 'PASS' },
  { evaluationId: 'eval-1', parameterCode: 'task_progression_rate', value: 'FAIL' },
  { evaluationId: 'eval-1', parameterCode: 'response_grounding_rate', value: 'CANNOT_VERIFY' },
  { evaluationId: 'eval-1', parameterCode: 'response_grounding_rate', value: 'GROUNDED' },
  { evaluationId: 'eval-1', parameterCode: 'repetition_loop_rate', value: 'ISSUE' },
  { evaluationId: 'eval-1', parameterCode: 'repetition_loop_rate', value: 'NO_ISSUE' }, // same evaluation (= same "review") -> rolls up to one interaction-level observation
];
const ratios = computeAutomatedQaRatios(observations);
assert('task_progression_rate: 1 PASS / 2 eligible', { n: ratios.task_progression_rate.numerator, d: ratios.task_progression_rate.denominator }, { n: 1, d: 2 });
assert('response_grounding_rate excludes CANNOT_VERIFY from eligible denominator', { n: ratios.response_grounding_rate.numerator, d: ratios.response_grounding_rate.denominator }, { n: 1, d: 1 });
assert('repetition_loop_rate rolls up to ONE evaluation-level opportunity (ISSUE present -> counts once)', { n: ratios.repetition_loop_rate.numerator, d: ratios.repetition_loop_rate.denominator }, { n: 1, d: 1 });
assert('an untouched parameter has null rate, never a fabricated 0%', ratios.conversation_recovery_rate.rate, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
