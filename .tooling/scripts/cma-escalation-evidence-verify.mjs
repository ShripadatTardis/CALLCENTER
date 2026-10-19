// Session 6 — deterministic coverage of the real compiled reference
// evaluator (src/server/cma/cmaEscalationEvidence.ts, bundled via
// esbuild, not reimplemented) against the brief's own §15 test list.
// Never calls a real LLM — `verify` is always a deterministic, in-
// memory mock here. No Supabase/Postgres is touched by this script.

import {
  evaluateEscalationReasonEvidence,
  computeEscalationReasonEvaluationId,
} from '../tmp/cmaEscalationEvidence.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
function assertTrue(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` -- ${detail ?? ''}`}`);
  cond ? pass++ : fail++;
}

function neverCalledVerifier() {
  let called = false;
  const verify = async () => { called = true; return null; };
  return { verify, wasCalled: () => called };
}

async function run() {
  // 1. Not escalated, no trigger — ineligible, no LLM call.
  {
    const { verify, wasCalled } = neverCalledVerifier();
    const f = await evaluateEscalationReasonEvidence({ interactionId: 'c1', outcome: 'resolved', escalationTrigger: null }, verify);
    assert('non-escalated, no trigger -> ineligible', f.eligibility, 'ineligible');
    assertTrue('non-escalated -> no LLM call', !wasCalled());
  }

  // 2. Fast path: valid API finding, trigger present and consistent with outcome.
  {
    const { verify, wasCalled } = neverCalledVerifier();
    const f = await evaluateEscalationReasonEvidence(
      { interactionId: 'c2', outcome: 'escalated', escalationTrigger: 'customer requested supervisor' },
      verify,
    );
    assert('fast path value', f.value, 'customer requested supervisor');
    assert('fast path validationStatus', f.validationStatus, 'validated');
    assert('fast path evaluationMethod', f.evaluationMethod, 'fast_path');
    assertTrue('fast path never calls the LLM', !wasCalled());
    assert('fast path evidenceRefs cites the structured field', f.evidenceRefs, ['escalation_trigger']);
  }

  // 3. Missing API finding, no transcript -> unsupported inference, not fabricated.
  {
    const { verify } = neverCalledVerifier();
    const f = await evaluateEscalationReasonEvidence({ interactionId: 'c3', outcome: 'escalated', escalationTrigger: null }, verify);
    assert('missing trigger + no transcript -> unresolved', f.validationStatus, 'insufficient');
    assert('missing trigger + no transcript -> no value fabricated', f.value, null);
    assert('missing trigger + no transcript -> evaluationMethod', f.evaluationMethod, 'unresolved');
  }

  // 4. Conflicting API/structured evidence (requested but not executed), no transcript -> unsupported inference, never silently resolved either way.
  {
    const { verify, wasCalled } = neverCalledVerifier();
    const f = await evaluateEscalationReasonEvidence({ interactionId: 'c4', outcome: 'resolved', escalationTrigger: 'customer asked to escalate' }, verify);
    assert('contradictory evidence, no transcript -> indeterminate eligibility', f.eligibility, 'indeterminate');
    assert('contradictory evidence, no transcript -> insufficient', f.validationStatus, 'insufficient');
    assertTrue('contradictory w/ no transcript -> no LLM call', !wasCalled());
    assertTrue('note explains the requested-vs-executed distinction', f.note.includes('requested, not confirmed executed'));
  }

  // 5. Selective escalation to targeted LLM: missing trigger, transcript available, verifier resolves it.
  {
    const transcript = [
      { timestamp: '2026-06-01T00:00:00Z', speaker: 'customer' },
      { timestamp: '2026-06-01T00:00:05Z', speaker: 'agent' },
    ];
    let calledWith = null;
    const verify = async (id, t) => {
      calledWith = { id, turns: t.length };
      return { reasonCategory: 'agent_unable_to_resolve', confidence: 0.82, evidenceTurnIndices: [1] };
    };
    const f = await evaluateEscalationReasonEvidence({ interactionId: 'c5', outcome: 'escalated', escalationTrigger: null, transcript }, verify);
    assert('verification path value', f.value, 'agent_unable_to_resolve');
    assert('verification path validationStatus', f.validationStatus, 'validated');
    assert('verification path evaluationMethod', f.evaluationMethod, 'verification_llm');
    assertTrue('verification path cites a real transcript turn', f.evidenceRefs.length === 1 && f.evidenceRefs[0].includes('c5'));
    assertTrue('verifier was actually invoked', calledWith !== null && calledWith.id === 'c5' && calledWith.turns === 2);
  }

  // 6. Verification path, but conflicting evidence (requested not executed) WITH a transcript -> resolved via transcript, recorded as contradicted not silently merged.
  {
    const transcript = [{ timestamp: '2026-06-01T00:00:00Z', speaker: 'agent' }];
    const verify = async () => ({ reasonCategory: 'policy_required_escalation', confidence: 0.6, evidenceTurnIndices: [0] });
    const f = await evaluateEscalationReasonEvidence(
      { interactionId: 'c6', outcome: 'resolved', escalationTrigger: 'escalation requested', transcript },
      verify,
    );
    assert('contradictory + transcript resolves value', f.value, 'policy_required_escalation');
    assert('contradictory + transcript -> contradicted, not validated', f.validationStatus, 'contradicted');
    assertTrue('contradicted note present', f.note !== null && f.note.includes('contradicted'));
  }

  // 7. Unresolved interpretation: verifier itself returns null (failed call) or 'unresolved' category.
  {
    const transcript = [{ timestamp: '2026-06-01T00:00:00Z', speaker: 'agent' }];
    const verifyFails = async () => null;
    const f1 = await evaluateEscalationReasonEvidence({ interactionId: 'c7a', outcome: 'escalated', escalationTrigger: null, transcript }, verifyFails);
    assert('verifier failure -> unresolved', f1.validationStatus, 'unresolved');
    assert('verifier failure -> no value fabricated', f1.value, null);

    const verifyUnresolved = async () => ({ reasonCategory: 'unresolved', confidence: 0.2, evidenceTurnIndices: [] });
    const f2 = await evaluateEscalationReasonEvidence({ interactionId: 'c7b', outcome: 'escalated', escalationTrigger: null, transcript }, verifyUnresolved);
    assert('verifier explicit unresolved -> unresolved', f2.validationStatus, 'unresolved');
  }

  // 8. Verifier cites a turn index that doesn't exist in the real transcript -> rejected, not trusted blindly.
  {
    const transcript = [{ timestamp: '2026-06-01T00:00:00Z', speaker: 'agent' }];
    const verify = async () => ({ reasonCategory: 'technical_failure', confidence: 0.9, evidenceTurnIndices: [7] });
    const f = await evaluateEscalationReasonEvidence({ interactionId: 'c8', outcome: 'escalated', escalationTrigger: null, transcript }, verify);
    assert('invalid cited turn -> unresolved, not trusted', f.validationStatus, 'unresolved');
    assertTrue('invalid-citation note present', f.note.includes('no valid transcript turns'));
  }

  // 9. Idempotency: identical inputs -> identical evaluation id, across repeated calls.
  {
    const input = { interactionId: 'c9', outcome: 'escalated', escalationTrigger: 'customer requested supervisor' };
    const id1 = computeEscalationReasonEvaluationId(input, 'deterministic-v1');
    const id2 = computeEscalationReasonEvaluationId({ ...input }, 'deterministic-v1');
    assert('idempotent evaluation id for identical inputs', id1, id2);
  }

  // 10. Source updates / evaluation versions: changing evaluatorVersion (e.g. a prompt bump) changes the id; a supersedesEvaluationId carries forward when supplied.
  {
    const input = { interactionId: 'c10', outcome: 'escalated', escalationTrigger: 'customer requested supervisor' };
    const idV1 = computeEscalationReasonEvaluationId(input, 'deterministic-v1');
    const idV2 = computeEscalationReasonEvaluationId(input, 'deterministic-v2');
    assertTrue('different evaluatorVersion -> different evaluation id', idV1 !== idV2);

    const { verify } = neverCalledVerifier();
    const f = await evaluateEscalationReasonEvidence({ ...input, priorEvaluationId: idV1 }, verify);
    assert('supersession is carried through explicitly, never silent', f.supersedesEvaluationId, idV1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
