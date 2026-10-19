// Session 7 Part D/F — deterministic coverage of the real compiled
// cmaEvidenceOrchestrator.ts (via esbuild, never a reimplementation),
// exercising the full reference case against mocked transcript-cache,
// LLM-verifier, and persistence dependencies — no real Supabase client,
// network call, or LLM call anywhere in this file.

import {
  evaluateAndPersistEscalationReason,
  escalationReasonNeedsTranscript,
} from '../tmp/cmaEvidenceOrchestrator.mjs';

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

function neverFetchTranscriptDeps() {
  let fetchCalled = false;
  return {
    deps: {
      readCache: async () => null,
      writeCache: async () => {},
      fetchLive: async () => { fetchCalled = true; return []; },
    },
    wasFetchCalled: () => fetchCalled,
  };
}

function unavailableTranscriptDeps() {
  return {
    readCache: async () => null,
    writeCache: async () => {},
    fetchLive: async () => { throw new Error('HTTP 404'); },
  };
}

function availableTranscriptDeps(turns) {
  return {
    readCache: async () => null,
    writeCache: async () => {},
    fetchLive: async () => turns,
  };
}

function neverPersist() {
  const calls = [];
  return {
    persist: async (finding) => { calls.push(finding); return { id: `evidence-${calls.length}`, supersededId: null }; },
    calls,
  };
}

function neverGetActive() {
  return async () => null;
}

const transcript3 = [
  { timestamp: '2026-06-01T00:00:00Z', speaker: 'customer', text: 'I need to speak to a human, this bot is useless' },
  { timestamp: '2026-06-01T00:00:05Z', speaker: 'agent', text: 'Let me transfer you to a supervisor.' },
];

// 1. Supported escalation (fast path): trigger present + outcome=escalated.
//    No transcript fetch attempted, LLM never asked.
{
  const { deps: transcriptDeps, wasFetchCalled } = neverFetchTranscriptDeps();
  let askCalled = false;
  const { persist, calls } = neverPersist();
  const row = { interactionId: 'call-1', outcome: 'escalated', escalationTrigger: 'customer requested supervisor' };
  assertTrue('escalationReasonNeedsTranscript: false for a clean fast-path row', !escalationReasonNeedsTranscript(row));
  const outcome = await evaluateAndPersistEscalationReason(row, {
    transcriptDeps,
    askLlm: async () => { askCalled = true; return null; },
    getActiveEvidence: neverGetActive(),
    persist,
  });
  assertTrue('fast path: transcript fetch never attempted', !wasFetchCalled());
  assertTrue('fast path: LLM never asked', !askCalled);
  assert('fast path: evaluationMethod', outcome.finding.evaluationMethod, 'fast_path');
  assert('fast path: value is the real escalation_trigger', outcome.finding.value, 'customer requested supervisor');
  assertTrue('fast path: persist was called exactly once', calls.length === 1);
  assert('fast path: persistedId returned', outcome.persistedId, 'evidence-1');
}

// 2. Escalation requested but NOT executed (contradiction), transcript unavailable
//    (e.g. a 404) -> transcript fetch IS attempted (we don't know in advance),
//    but LLM is never asked (no transcript to ask about), result stays insufficient.
{
  const transcriptDeps = unavailableTranscriptDeps();
  let askCalled = false;
  const { persist } = neverPersist();
  const row = { interactionId: 'call-2', outcome: 'resolved', escalationTrigger: 'customer asked to escalate' };
  assertTrue('escalationReasonNeedsTranscript: true for a contradictory row', escalationReasonNeedsTranscript(row));
  const outcome = await evaluateAndPersistEscalationReason(row, {
    transcriptDeps,
    askLlm: async () => { askCalled = true; return null; },
    getActiveEvidence: neverGetActive(),
    persist,
  });
  assertTrue('contradiction + unavailable transcript: fetch WAS attempted', outcome.transcriptFetchAttempted);
  assertTrue('contradiction + unavailable transcript: LLM never asked (no transcript to ask about)', !askCalled);
  assert('contradiction + unavailable transcript: validationStatus', outcome.finding.validationStatus, 'insufficient');
  assert('contradiction + unavailable transcript: eligibility', outcome.finding.eligibility, 'indeterminate');
}

// 3. Contradictory API and conversation evidence, transcript AVAILABLE ->
//    LLM is asked with the FULL transcript (including text), result is
//    resolved but recorded as contradicted, never silently merged.
{
  const transcriptDeps = availableTranscriptDeps(transcript3);
  let askedWith = null;
  const { persist, calls } = neverPersist();
  const row = { interactionId: 'call-3', outcome: 'resolved', escalationTrigger: 'escalation requested' };
  const outcome = await evaluateAndPersistEscalationReason(row, {
    transcriptDeps,
    askLlm: async (interactionId, outcomeArg, trigger, turns) => {
      askedWith = { interactionId, outcomeArg, trigger, turnCount: turns.length, hasText: turns.every((t) => typeof t.text === 'string') };
      return { reasonCategory: 'customer_requested_human', confidence: 0.9, evidenceTurnIndices: [0] };
    },
    getActiveEvidence: neverGetActive(),
    persist,
  });
  assertTrue('contradiction + transcript: LLM was asked with the full-text transcript', askedWith !== null && askedWith.hasText && askedWith.turnCount === 2);
  assert('contradiction + transcript: LLM received the real outcome', askedWith.outcomeArg, 'resolved');
  assert('contradiction + transcript: LLM received the real escalation_trigger', askedWith.trigger, 'escalation requested');
  assert('contradiction + transcript: validationStatus is contradicted, not validated', outcome.finding.validationStatus, 'contradicted');
  assert('contradiction + transcript: value resolved via the transcript', outcome.finding.value, 'customer_requested_human');
  assertTrue('contradiction + transcript: evidenceRefs cite a real transcript turn id', outcome.finding.evidenceRefs.length === 1 && outcome.finding.evidenceRefs[0].includes('call-3'));
}

// 4. Missing transcript entirely for an otherwise-eligible row (outcome=escalated, no trigger).
{
  const transcriptDeps = unavailableTranscriptDeps();
  const { persist } = neverPersist();
  const row = { interactionId: 'call-4', outcome: 'escalated', escalationTrigger: null };
  const outcome = await evaluateAndPersistEscalationReason(row, {
    transcriptDeps,
    askLlm: async () => null,
    getActiveEvidence: neverGetActive(),
    persist,
  });
  assert('missing transcript + no trigger: validationStatus insufficient', outcome.finding.validationStatus, 'insufficient');
  assert('missing transcript + no trigger: no value fabricated', outcome.finding.value, null);
}

// 5. Unknown/unresolved outcome: LLM is asked but returns an explicit
//    'unresolved' category (or null) -> result stays honestly unresolved.
{
  const transcriptDeps = availableTranscriptDeps(transcript3);
  const { persist } = neverPersist();
  const row = { interactionId: 'call-5', outcome: 'escalated', escalationTrigger: null };
  const outcome = await evaluateAndPersistEscalationReason(row, {
    transcriptDeps,
    askLlm: async () => ({ reasonCategory: 'unresolved', confidence: 0.3, evidenceTurnIndices: [] }),
    getActiveEvidence: neverGetActive(),
    persist,
  });
  assert('LLM explicit unresolved category -> validationStatus unresolved', outcome.finding.validationStatus, 'unresolved');
  assert('LLM explicit unresolved category -> no value fabricated', outcome.finding.value, null);
}

// 6. Idempotency / evidence reuse across a repeated evaluation of the SAME
//    interaction: the second run's transcript fetch is served from cache
//    (no second live fetch), and the second run's persisted finding
//    explicitly supersedes the first run's.
{
  let liveFetchCalls = 0;
  const cacheRows = new Map();
  const transcriptDeps = {
    readCache: async (id, type) => cacheRows.get(`${id}:${type}`) ?? null,
    writeCache: async (entry) => cacheRows.set(`${entry.interactionId}:${entry.interactionType}`, { ...entry, version: 1, fetchedAt: new Date().toISOString() }),
    fetchLive: async () => { liveFetchCalls++; return transcript3; },
  };
  const activeByInteraction = new Map();
  const getActiveEvidence = async (interactionId) => activeByInteraction.get(interactionId) ?? null;
  const persisted = [];
  const persist = async (finding) => {
    const id = `evidence-${persisted.length + 1}`;
    persisted.push(finding);
    activeByInteraction.set(finding.interactionId, { id });
    return { id, supersededId: finding.supersedesEvaluationId };
  };
  const row = { interactionId: 'call-6', outcome: 'resolved', escalationTrigger: 'customer asked to escalate' };
  const askLlm = async () => ({ reasonCategory: 'customer_requested_human', confidence: 0.85, evidenceTurnIndices: [0] });

  const first = await evaluateAndPersistEscalationReason(row, { transcriptDeps, askLlm, getActiveEvidence, persist });
  const second = await evaluateAndPersistEscalationReason(row, { transcriptDeps, askLlm, getActiveEvidence, persist });

  assertTrue('idempotency: live transcript fetch happened exactly once across both runs', liveFetchCalls === 1);
  assert('idempotency: first run has no supersession (nothing active yet)', first.finding.supersedesEvaluationId, null);
  assert('idempotency: second run explicitly supersedes the first run\'s persisted id', second.finding.supersedesEvaluationId, first.persistedId);
  assertTrue('idempotency: both runs produced the same evidenceRefs (same transcript, same answer)', JSON.stringify(first.finding.evidenceRefs) === JSON.stringify(second.finding.evidenceRefs));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
