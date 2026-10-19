// Session 7-T — CMA_POC_500_V1 synthetic dataset generator.
//
// Deterministic (fixed seed), reproducible. Generates 500 synthetic
// interactions (350 voice + 150 chat) plus supporting QA records, and
// independently computes expected values for the 10 target canonical
// measures DIRECTLY from the generated facts in this script — never by
// calling any CMA RPC. This file is the "independent expected result"
// source required by the session brief (never derive the expected
// answer from CMA's own output).
//
// Isolation: every row uses the id/interaction_id prefix `cma500_`, a
// dedicated anchor window [2026-08-01T00:00:00Z, 2026-08-08T00:00:00Z)
// that overlaps neither real production data (Sept-Oct 2026) nor the
// existing Session-4D `fx_` fixture window (2026-06-01/02). No new
// database column was added for a "dataset_id" — the `cma500_` id
// prefix IS the dataset identifier for this session, per the brief's
// own instruction to prefer existing metadata over a schema change
// when practical (see the deliverable doc for the one isolation gap
// this did NOT solve and the migration recommended for it).
//
// Output (written into .tooling/scripts/, this session's deliverables):
//   session7t-dataset-fixtures.sql   - idempotent INSERT script
//   session7t-dataset-cleanup.sql    - deletes every cma500_ row
//   session7t-expected-results.json  - independent expected values + raw facts

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

// ---- seeded PRNG (mulberry32) for full reproducibility ----
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 0xC3A500; // fixed seed -> identical output every run
const rng = mulberry32(SEED);
function rand() { return rng(); }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function round2(n) { return Math.round(n * 100) / 100; }

const WINDOW_FROM = Date.parse('2026-08-01T00:00:00Z');
const WINDOW_TO = Date.parse('2026-08-08T00:00:00Z'); // half-open, exclusive
const WINDOW_SPAN_MS = WINDOW_TO - WINDOW_FROM;

const AGENTS = ['cma500_agent_1', 'cma500_agent_2', 'cma500_agent_3', 'cma500_agent_4', 'cma500_agent_5'];
// agent_4 is deliberately given a restricted/empty authorized set in the
// validation pass (Business Data Scope negative scenario) — see §G.
const CAMPAIGNS = [
  { id: 'c5000000-0000-4000-8000-0000000000c1', name: 'cma500_campaign_1' },
  { id: 'c5000000-0000-4000-8000-0000000000c2', name: 'cma500_campaign_2' },
];
const N_CUSTOMERS_VOICE_REPEAT = 25; // customers with >1 voice interaction (repeat contact)
const N_CUSTOMERS_FIRST = 200; // customers with exactly 1 voice interaction (first contact only)

// ---- target scenario distribution (500 total) ----
const TOTAL = 500;
const N_VOICE = 350;
const N_CHAT = 150;
const DIST = { resolved: 205, escalated: 115, unresolved: 90, incomplete: 50, ambiguous: 40 };
if (Object.values(DIST).reduce((a, b) => a + b, 0) !== TOTAL) throw new Error('distribution must sum to 500');

// Build a deterministic, shuffled list of 500 scenario-category tags,
// then split 350/150 across voice/chat while preserving overall ratios
// as closely as integer counts allow.
function buildTagList() {
  const tags = [];
  for (const [cat, n] of Object.entries(DIST)) for (let i = 0; i < n; i++) tags.push(cat);
  // deterministic shuffle (Fisher-Yates with the seeded PRNG)
  for (let i = tags.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [tags[i], tags[j]] = [tags[j], tags[i]];
  }
  return tags;
}
const allTags = buildTagList();
const voiceTags = allTags.slice(0, N_VOICE);
const chatTags = allTags.slice(N_VOICE);

function sqlStr(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function randomTimestampInWindow() {
  const t = WINDOW_FROM + Math.floor(rand() * WINDOW_SPAN_MS);
  return new Date(t);
}

// ---- customer pool (voice repeat-contact + first-contact) ----
const customers = [];
for (let i = 0; i < N_CUSTOMERS_REPEAT_SAFE(); i++) {}
function N_CUSTOMERS_REPEAT_SAFE() { return 0; } // placeholder, unused (kept out of hot path)

for (let i = 0; i < N_CUSTOMERS_VOICE_REPEAT; i++) {
  customers.push({ id: `c6000000-0000-4000-8000-${String(i).padStart(12, '1')}`, ref: `cma500_customer_repeat_${i}`, repeat: true });
}
for (let i = 0; i < N_CUSTOMERS_FIRST; i++) {
  customers.push({ id: `c6000000-0000-4000-8000-${String(i + 500).padStart(12, '2')}`, ref: `cma500_customer_first_${i}`, repeat: false });
}

// ---- generate 350 voice interactions ----
const voiceRows = [];
let voiceSeq = 0;
// Build the repeat-contact customer's assignment list: each repeat
// customer gets 2-4 voice interactions; the remainder of voice rows go
// to first-contact customers (1 each), with leftover rows getting null
// customer_id (missing-customer-link scenario, deliberately included).
const repeatAssignments = [];
for (const c of customers.filter((c) => c.repeat)) {
  const nCalls = randInt(2, 4);
  for (let i = 0; i < nCalls; i++) repeatAssignments.push(c);
}
let repeatPtr = 0;
let firstPtr = 0;
const firstContactCustomers = customers.filter((c) => !c.repeat);

function scenarioToOutcomeFacts(tag, idx) {
  // Each scenario category maps to a DB-level outcome + a richer set of
  // conversation-evidence facts recorded only in the JSON (Part D),
  // since `customer_interactions.outcome` only supports
  // 'resolved' | 'escalated' | null in the real schema (no 'unresolved'/
  // 'abandoned'/'ambiguous' enum values exist — not fabricated here).
  const authRoll = rand();
  const wasAuthenticated = authRoll < 0.75 ? true : authRoll < 0.92 ? false : null; // ~75% success, 17% fail, 8% missing evidence
  const sentimentRoll = rand();
  const sentimentScore = sentimentRoll < 0.08 ? null : round2(Math.max(0, Math.min(0.95, rand() * 0.95)));
  const confRoll = rand();
  const intentConfidence = confRoll < 0.1 ? null : round2(Math.max(0, Math.min(0.99, 0.4 + rand() * 0.59)));

  switch (tag) {
    case 'resolved':
      return {
        outcome: 'resolved',
        duration_seconds: randInt(60, 900),
        wasAuthenticated, sentimentScore: sentimentScore ?? 0.7, intentConfidence,
        escalation_trigger: null,
        evidencePath: pickEvidencePath(idx, 'resolved'),
      };
    case 'escalated':
      return {
        outcome: 'escalated',
        duration_seconds: randInt(300, 1800),
        wasAuthenticated, sentimentScore: sentimentScore !== null ? Math.min(sentimentScore, 0.4) : null,
        intentConfidence,
        escalation_trigger: pick(['customer requested supervisor', 'policy exception', 'unresolved after retries', null]),
        evidencePath: pickEvidencePath(idx, 'escalated'),
      };
    case 'unresolved':
      return {
        outcome: null, // indeterminate outcome (real schema allows null)
        duration_seconds: randInt(120, 1200),
        wasAuthenticated, sentimentScore, intentConfidence,
        escalation_trigger: null,
        evidencePath: pickEvidencePath(idx, 'unresolved'),
      };
    case 'incomplete':
      return {
        outcome: null, // abandoned/incomplete also has no dedicated enum value; distinguished by short duration + recording_available=false
        duration_seconds: randInt(5, 45),
        wasAuthenticated: wasAuthenticated === true ? null : wasAuthenticated, // auth rarely completes on an abandoned call
        sentimentScore: null, // transcript too short to score
        intentConfidence: confRoll < 0.6 ? null : intentConfidence,
        escalation_trigger: null,
        evidencePath: pickEvidencePath(idx, 'incomplete'),
        recordingAvailable: false,
      };
    case 'ambiguous':
      // DB outcome is set (resolved or escalated, 50/50) but the
      // conversation-evidence (Part D) will be constructed to CONFLICT
      // with it — this is the VERIFICATION PATH population.
      return {
        outcome: rand() < 0.5 ? 'resolved' : 'escalated',
        duration_seconds: randInt(100, 1000),
        wasAuthenticated, sentimentScore, intentConfidence,
        escalation_trigger: null,
        evidencePath: 'verification',
      };
    default:
      throw new Error('unknown tag ' + tag);
  }
}

function pickEvidencePath(idx, cat) {
  // Distribute FAST_PATH / VERIFICATION_PATH / DERIVATION_PATH / UNSUPPORTED
  // deterministically across the population (Part D's 3 evaluation
  // populations + explicit unsupported cases).
  const r = idx % 10;
  if (r < 5) return 'fast_path';
  if (r < 7) return 'verification_path';
  if (r < 9) return 'derivation_path';
  return 'unsupported';
}

for (let i = 0; i < N_VOICE; i++) {
  const tag = voiceTags[i];
  const facts = scenarioToOutcomeFacts(tag, i);
  const agentRoll = rand();
  // agent_4 gets a deliberately smaller slice (restricted-scope agent); agent_5 is also lightly used.
  const agent = agentRoll < 0.02 ? null : pick(AGENTS); // ~2% missing-agent rows
  let customerId = null;
  if (rand() < 0.55 && repeatPtr < repeatAssignments.length) {
    customerId = repeatAssignments[repeatPtr++].id;
  } else if (firstPtr < firstContactCustomers.length) {
    customerId = firstContactCustomers[firstPtr++].id;
  } // else left null: missing customer link, deliberate edge case
  const campaign = rand() < 0.4 ? pick(CAMPAIGNS) : null;
  const startedAt = randomTimestampInWindow();
  // boundary timestamp cases: force a few rows exactly at window start/end
  let startedAtIso = startedAt.toISOString();
  if (i === 0) startedAtIso = new Date(WINDOW_FROM).toISOString(); // inclusive start boundary
  if (i === 1) startedAtIso = new Date(WINDOW_TO).toISOString(); // exclusive end boundary -- must NOT be counted

  voiceRows.push({
    rowIndex: i,
    id: `c7000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    interaction_id: `cma500_voice_${String(i).padStart(4, '0')}`,
    channel: 'voice',
    agent_id: agent,
    started_at: startedAtIso,
    outcome: facts.outcome,
    duration_seconds: facts.duration_seconds,
    sentiment_score: facts.sentimentScore,
    intent_confidence: facts.intentConfidence,
    was_authenticated: facts.wasAuthenticated,
    escalation_trigger: facts.escalation_trigger,
    customer_id: customerId,
    recording_available: facts.recordingAvailable ?? true,
    campaign_id: campaign ? campaign.id : null,
    scenario_category: tag,
    evidence_path: facts.evidencePath,
  });
}

// ---- generate 150 chat sessions ----
const chatRows = [];
for (let i = 0; i < N_CHAT; i++) {
  const tag = chatTags[i];
  const agentRoll = rand();
  const agent = agentRoll < 0.02 ? null : pick(AGENTS);
  const campaign = rand() < 0.3 ? pick(CAMPAIGNS) : null;
  const startedAt = randomTimestampInWindow();
  let spanSeconds;
  switch (tag) {
    case 'resolved': spanSeconds = randInt(60, 600); break;
    case 'escalated': spanSeconds = randInt(300, 1500); break;
    case 'unresolved': spanSeconds = randInt(120, 900); break;
    case 'incomplete': spanSeconds = randInt(5, 40); break;
    case 'ambiguous': spanSeconds = randInt(100, 800); break;
    default: spanSeconds = 120;
  }
  const lastActivity = new Date(startedAt.getTime() + spanSeconds * 1000);
  chatRows.push({
    id: `c8000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    upstream_session_id: `cma500_chat_${String(i).padStart(4, '0')}`,
    agent_id: agent,
    campaign_id: campaign ? campaign.id : null,
    started_at: startedAt.toISOString(),
    last_activity_at: lastActivity.toISOString(),
    status: tag === 'resolved' ? 'completed' : tag === 'incomplete' ? 'abandoned' : 'completed',
    message_count: randInt(2, 30),
    span_seconds: spanSeconds,
    scenario_category: tag,
  });
}

// ---- QA fixtures for CANON-CONTEXT-CONTINUITY-RATE / CANON-TASK-PROGRESSION-RATE ----
// Drawn from a subset of the voice population (QA reviews only sample a
// fraction of real calls, exactly like real operations) -- 80 human
// reviews (72 submitted + 8 draft/in_progress, must be excluded) and 60
// automated evaluations (54 completed + 6 running, must be excluded).
const qaHumanReviews = [];
const qaHumanFindingsCC = [];
const qaHumanFindingsTP = [];
const qaAutoEvals = [];
const qaAutoObsCC = [];
const qaAutoObsTP = [];

const N_HUMAN_SUBMITTED = 72;
const N_HUMAN_DRAFT = 8;
const N_AUTO_COMPLETED = 54;
const N_AUTO_RUNNING = 6;

function ccValueFor(idx, total) {
  // ~65% PASS, ~25% FAIL, ~10% N_A (ineligible)
  const r = idx / total;
  if (r < 0.65) return 'PASS';
  if (r < 0.90) return 'FAIL';
  return 'N_A';
}
function tpValueFor(idx, total) {
  // ~58% PASS, ~32% FAIL, ~10% N_A
  const r = idx / total;
  if (r < 0.58) return 'PASS';
  if (r < 0.90) return 'FAIL';
  return 'N_A';
}

for (let i = 0; i < N_HUMAN_SUBMITTED + N_HUMAN_DRAFT; i++) {
  const submitted = i < N_HUMAN_SUBMITTED;
  const voiceRow = voiceRows[i % voiceRows.length];
  const reviewId = `c9000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  qaHumanReviews.push({
    id: reviewId,
    interaction_id: voiceRow.interaction_id,
    channel: 'voice',
    agent_id: voiceRow.agent_id ?? AGENTS[0],
    status: submitted ? 'submitted' : 'in_progress',
    started_at: voiceRow.started_at,
  });
  qaHumanFindingsCC.push({ review_id: reviewId, value: ccValueFor(i, N_HUMAN_SUBMITTED + N_HUMAN_DRAFT) });
  qaHumanFindingsTP.push({ review_id: reviewId, value: tpValueFor(i, N_HUMAN_SUBMITTED + N_HUMAN_DRAFT) });
}

for (let i = 0; i < N_AUTO_COMPLETED + N_AUTO_RUNNING; i++) {
  const completed = i < N_AUTO_COMPLETED;
  const voiceRow = voiceRows[(i + 37) % voiceRows.length];
  const evalId = `ca000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  qaAutoEvals.push({
    id: evalId,
    interaction_id: voiceRow.interaction_id,
    channel: 'voice',
    agent_id: voiceRow.agent_id ?? AGENTS[0],
    status: completed ? 'completed' : 'running',
    started_at: voiceRow.started_at,
  });
  qaAutoObsCC.push({ evaluation_id: evalId, value: ccValueFor(i, N_AUTO_COMPLETED + N_AUTO_RUNNING) });
  qaAutoObsTP.push({ evaluation_id: evalId, value: tpValueFor(i, N_AUTO_COMPLETED + N_AUTO_RUNNING) });
}

// =====================================================================
// INDEPENDENT EXPECTED VALUE COMPUTATION
// Computed purely from the generated facts above, in plain JS -- never
// by invoking any CMA RPC or algorithm under test.
// =====================================================================

function inWindow(iso) {
  const t = Date.parse(iso);
  return t >= WINDOW_FROM && t < WINDOW_TO;
}
const eligibleVoice = voiceRows.filter((r) => inWindow(r.started_at));
const excludedBoundaryRow = voiceRows.find((r) => Date.parse(r.started_at) === WINDOW_TO);

function ratio(num, denom) { return denom > 0 ? round2((num / denom) * 100) : null; }

// 1. Resolution Rate (CANON-RES-RATE): num=resolved, denom=resolved+escalated, pop=all eligible
const resDenom = eligibleVoice.filter((r) => r.outcome === 'resolved' || r.outcome === 'escalated').length;
const resNum = eligibleVoice.filter((r) => r.outcome === 'resolved').length;
const resolutionRate = { canonicalId: 'CANON-RES-RATE', governance: 'decided_operational', population: eligibleVoice.length, numerator: resNum, denominator: resDenom, expectedValue: ratio(resNum, resDenom) };

// 2. First Contact Resolution (candidate only -- CANON-FIRST-CONTACT-RES, pending_decision)
// Candidate definition used here: resolved on an interaction belonging
// to a first-contact customer (repeat=false) OR the customer's FIRST
// chronological voice interaction among repeat customers.
const customerFirstInteractionIds = new Set();
{
  const byCustomer = new Map();
  for (const r of eligibleVoice) {
    if (!r.customer_id) continue;
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }
  for (const [, list] of byCustomer) {
    list.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    customerFirstInteractionIds.add(list[0].interaction_id);
  }
}
const fcrEligible = eligibleVoice.filter((r) => r.customer_id && customerFirstInteractionIds.has(r.interaction_id));
const fcrNum = fcrEligible.filter((r) => r.outcome === 'resolved').length;
const fcr = { canonicalId: 'CANON-FIRST-CONTACT-RES', governance: 'pending_decision_candidate_only', population: fcrEligible.length, numerator: fcrNum, denominator: fcrEligible.length, expectedValue: ratio(fcrNum, fcrEligible.length) };

// 3. Escalation Rate (candidate only -- CANON-ESC-RATE, pending_decision)
const escDenom = resDenom; // same handled population as resolution rate
const escNum = eligibleVoice.filter((r) => r.outcome === 'escalated').length;
const escalationRate = { canonicalId: 'CANON-ESC-RATE', governance: 'pending_decision_candidate_only', population: eligibleVoice.length, numerator: escNum, denominator: escDenom, expectedValue: ratio(escNum, escDenom) };

// 4a. Average Handle Time -- OPERATIONAL ANALOG CANON-SUCCESSFUL-RES-TIME (resolved only, <14400s)
const srtEligible = eligibleVoice.filter((r) => r.outcome === 'resolved' && r.duration_seconds != null && r.duration_seconds < 14400);
const srtSum = srtEligible.reduce((s, r) => s + r.duration_seconds, 0);
const successfulResTime = { canonicalId: 'CANON-SUCCESSFUL-RES-TIME', governance: 'decided_operational', population: eligibleVoice.length, numerator: srtSum, denominator: srtEligible.length, expectedValue: srtEligible.length ? round2(srtSum / srtEligible.length) : null };

// 4b. Average Handle Time -- CANDIDATE true all-outcome AHT (CANON-AVG-HANDLE-TIME, pending_decision)
const ahtEligible = eligibleVoice.filter((r) => r.duration_seconds != null && r.duration_seconds < 14400);
const ahtSum = ahtEligible.reduce((s, r) => s + r.duration_seconds, 0);
const aht = { canonicalId: 'CANON-AVG-HANDLE-TIME', governance: 'pending_decision_candidate_only', population: eligibleVoice.length, numerator: ahtSum, denominator: ahtEligible.length, expectedValue: ahtEligible.length ? round2(ahtSum / ahtEligible.length) : null };

// 5. Authentication Success Rate (CANON-AUTH-SUCCESS-RATE)
const authEligible = eligibleVoice.filter((r) => r.was_authenticated !== null);
const authNum = authEligible.filter((r) => r.was_authenticated === true).length;
const authSuccessRate = { canonicalId: 'CANON-AUTH-SUCCESS-RATE', governance: 'decided_operational', population: eligibleVoice.length, numerator: authNum, denominator: authEligible.length, expectedValue: ratio(authNum, authEligible.length) };

// 6. Average Sentiment Score (CANON-AVG-SENT-SCORE)
const sentEligible = eligibleVoice.filter((r) => r.sentiment_score !== null);
const sentSum = sentEligible.reduce((s, r) => s + r.sentiment_score, 0);
const avgSentScore = { canonicalId: 'CANON-AVG-SENT-SCORE', governance: 'decided_operational', population: eligibleVoice.length, numerator: round2(sentSum), denominator: sentEligible.length, expectedValue: sentEligible.length ? round2(sentSum / sentEligible.length) : null };

// 7. Intent Classification / Confidence (CANON-INTENT-CONFIDENCE)
const confEligible = eligibleVoice.filter((r) => r.intent_confidence !== null);
const confSum = confEligible.reduce((s, r) => s + r.intent_confidence, 0);
const intentConfidence = { canonicalId: 'CANON-INTENT-CONFIDENCE', governance: 'decided_operational_blocked_in_prod_only', population: eligibleVoice.length, numerator: round2(confSum), denominator: confEligible.length, expectedValue: confEligible.length ? round2(confSum / confEligible.length) : null };

// 8. Chat Session Span (CANON-CHAT-SESSION-SPAN)
const eligibleChat = chatRows.filter((r) => inWindow(r.started_at));
const chatSpanSum = eligibleChat.reduce((s, r) => s + r.span_seconds, 0);
const chatSpan = { canonicalId: 'CANON-CHAT-SESSION-SPAN', governance: 'decided_operational', population: eligibleChat.length, numerator: chatSpanSum, denominator: eligibleChat.length, expectedValue: eligibleChat.length ? round2(chatSpanSum / eligibleChat.length) : null };

// 9. Context Continuity Rate (CANON-CONTEXT-CONTINUITY-RATE), all 3 population selectors
function qaRate(findingsList, reviewStatusMap) {
  const eligible = findingsList.filter((f) => reviewStatusMap.get(f.review_id ?? f.evaluation_id) === true && f.value !== 'N_A');
  const hits = eligible.filter((f) => f.value === 'PASS');
  return { denom: eligible.length, num: hits.length, value: ratio(hits.length, eligible.length) };
}
// A QA review/evaluation is only in-population if BOTH its own status
// qualifies (submitted / completed) AND its own started_at falls inside
// the evaluation window -- the real RPC filters on
// qr.started_at/aqe.started_at directly, independent of the underlying
// interaction's timestamp, so this must mirror that exactly.
const humanStatusMap = new Map(qaHumanReviews.map((r) => [r.id, r.status === 'submitted' && inWindow(r.started_at)]));
const autoStatusMap = new Map(qaAutoEvals.map((e) => [e.id, e.status === 'completed' && inWindow(e.started_at)]));

const ccHuman = qaRate(qaHumanFindingsCC, humanStatusMap);
const ccAuto = qaRate(qaAutoObsCC, autoStatusMap);
const ccCombinedDenom = ccHuman.denom + ccAuto.denom;
const ccCombinedNum = ccHuman.num + ccAuto.num;
const contextContinuity = {
  canonicalId: 'CANON-CONTEXT-CONTINUITY-RATE', governance: 'decided_operational',
  human: { population: qaHumanReviews.filter((r) => r.status === 'submitted' && inWindow(r.started_at)).length, numerator: ccHuman.num, denominator: ccHuman.denom, expectedValue: ccHuman.value },
  automated: { population: qaAutoEvals.filter((e) => e.status === 'completed' && inWindow(e.started_at)).length, numerator: ccAuto.num, denominator: ccAuto.denom, expectedValue: ccAuto.value },
  combined: { population: qaHumanReviews.filter((r) => r.status === 'submitted' && inWindow(r.started_at)).length + qaAutoEvals.filter((e) => e.status === 'completed' && inWindow(e.started_at)).length, numerator: ccCombinedNum, denominator: ccCombinedDenom, expectedValue: ratio(ccCombinedNum, ccCombinedDenom) },
};

// 10. Task Progression Rate (CANON-TASK-PROGRESSION-RATE), all 3 population selectors
const tpHuman = qaRate(qaHumanFindingsTP, humanStatusMap);
const tpAuto = qaRate(qaAutoObsTP, autoStatusMap);
const tpCombinedDenom = tpHuman.denom + tpAuto.denom;
const tpCombinedNum = tpHuman.num + tpAuto.num;
const taskProgression = {
  canonicalId: 'CANON-TASK-PROGRESSION-RATE', governance: 'decided_operational',
  human: { population: qaHumanReviews.filter((r) => r.status === 'submitted' && inWindow(r.started_at)).length, numerator: tpHuman.num, denominator: tpHuman.denom, expectedValue: tpHuman.value },
  automated: { population: qaAutoEvals.filter((e) => e.status === 'completed' && inWindow(e.started_at)).length, numerator: tpAuto.num, denominator: tpAuto.denom, expectedValue: tpAuto.value },
  combined: { population: qaHumanReviews.filter((r) => r.status === 'submitted' && inWindow(r.started_at)).length + qaAutoEvals.filter((e) => e.status === 'completed' && inWindow(e.started_at)).length, numerator: tpCombinedNum, denominator: tpCombinedDenom, expectedValue: ratio(tpCombinedNum, tpCombinedDenom) },
};

// also compute per-agent and per-campaign and per-channel-restricted slices for §G
function sliceByAgent(agentId) {
  const rows = eligibleVoice.filter((r) => r.agent_id === agentId);
  const denom = rows.filter((r) => r.outcome === 'resolved' || r.outcome === 'escalated').length;
  const num = rows.filter((r) => r.outcome === 'resolved').length;
  return { agentId, population: rows.length, numerator: num, denominator: denom, expectedValue: ratio(num, denom) };
}
const perAgentResRate = AGENTS.map(sliceByAgent);

function sliceByCampaign(campaignId) {
  const rows = eligibleVoice.filter((r) => r.campaign_id === campaignId);
  const denom = rows.filter((r) => r.outcome === 'resolved' || r.outcome === 'escalated').length;
  const num = rows.filter((r) => r.outcome === 'resolved').length;
  return { campaignId, population: rows.length, numerator: num, denominator: denom, expectedValue: ratio(num, denom) };
}
const perCampaignResRate = CAMPAIGNS.map((c) => sliceByCampaign(c.id));

// restricted agent scope: authorize only agent_4 (lightly used) -- proves scope narrowing
const restrictedScopeResRate = sliceByAgent('cma500_agent_4');
// empty eligible population: a disjoint window with zero rows
const emptyWindowResRate = { population: 0, numerator: null, denominator: 0, expectedValue: null, note: 'zero_denominator -- window has no eligible rows by construction' };

const expected = {
  datasetId: 'CMA_POC_500_V1',
  seed: SEED,
  window: { from: new Date(WINDOW_FROM).toISOString(), to: new Date(WINDOW_TO).toISOString() },
  counts: { total: TOTAL, voice: N_VOICE, chat: N_CHAT, distribution: DIST, qaHumanSubmitted: N_HUMAN_SUBMITTED, qaHumanDraft: N_HUMAN_DRAFT, qaAutoCompleted: N_AUTO_COMPLETED, qaAutoRunning: N_AUTO_RUNNING },
  excludedBoundaryRowInteractionId: excludedBoundaryRow ? excludedBoundaryRow.interaction_id : null,
  measures: {
    resolutionRate, fcr, escalationRate, successfulResTime, aht, authSuccessRate, avgSentScore,
    intentConfidence, chatSpan, contextContinuity, taskProgression,
  },
  slices: { perAgentResRate, perCampaignResRate, restrictedScopeResRate, emptyWindowResRate },
};

writeFileSync(path.join(OUT_DIR, 'session7t-expected-results.json'), JSON.stringify(expected, null, 2));

// =====================================================================
// SQL fixtures + cleanup
// =====================================================================

const fixtureSql = [];
fixtureSql.push('-- Session 7-T — CMA_POC_500_V1 synthetic population.');
fixtureSql.push('-- Generated by .tooling/scripts/session7t-generate-dataset.mjs — DO NOT hand-edit.');
fixtureSql.push('-- Disposable PostgreSQL only. Idempotent (deletes any prior cma500_ rows first).');
fixtureSql.push('begin;');
fixtureSql.push('delete from call_center.automated_qa_observations where evaluation_id in (select id from call_center.automated_qa_evaluations where interaction_id like \'cma500_%\');');
fixtureSql.push('delete from call_center.automated_qa_evaluations where interaction_id like \'cma500_%\';');
fixtureSql.push('delete from call_center.qa_findings where review_id in (select id from call_center.qa_reviews where interaction_id like \'cma500_%\');');
fixtureSql.push('delete from call_center.qa_reviews where interaction_id like \'cma500_%\';');
fixtureSql.push('delete from call_center.chat_sessions where upstream_session_id like \'cma500_%\';');
fixtureSql.push('delete from call_center.customer_interactions where interaction_id like \'cma500_%\';');

fixtureSql.push('-- voice interactions');
for (const r of voiceRows) {
  fixtureSql.push(
    `insert into call_center.customer_interactions (id, interaction_id, channel, agent_id, started_at, outcome, duration_seconds, sentiment_score, intent_confidence, was_authenticated, escalation_trigger, customer_id, recording_available, campaign_id, source, ingested_at) values (${sqlStr(r.id)}, ${sqlStr(r.interaction_id)}, 'voice', ${sqlStr(r.agent_id)}, ${sqlStr(r.started_at)}, ${sqlStr(r.outcome)}, ${sqlStr(r.duration_seconds)}, ${sqlStr(r.sentiment_score)}, ${sqlStr(r.intent_confidence)}, ${sqlStr(r.was_authenticated)}, ${sqlStr(r.escalation_trigger)}, ${r.customer_id ? sqlStr(r.customer_id) : 'null'}, ${sqlStr(r.recording_available)}, ${r.campaign_id ? sqlStr(r.campaign_id) : 'null'}, 'cma500-synthetic', now());`
  );
}

fixtureSql.push('-- chat sessions');
for (const r of chatRows) {
  fixtureSql.push(
    `insert into call_center.chat_sessions (id, upstream_session_id, agent_id, campaign_id, started_at, last_activity_at, status, message_count) values (${sqlStr(r.id)}, ${sqlStr(r.upstream_session_id)}, ${sqlStr(r.agent_id)}, ${r.campaign_id ? sqlStr(r.campaign_id) : 'null'}, ${sqlStr(r.started_at)}, ${sqlStr(r.last_activity_at)}, ${sqlStr(r.status)}, ${sqlStr(r.message_count)});`
  );
}

fixtureSql.push('-- human QA reviews + findings (context_continuity_rate, task_progression_rate)');
for (const r of qaHumanReviews) {
  fixtureSql.push(
    `insert into call_center.qa_reviews (id, interaction_id, channel, agent_id, reviewer_user_id, status, started_at, contract_version) values (${sqlStr(r.id)}, ${sqlStr(r.interaction_id)}, 'voice', ${sqlStr(r.agent_id)}, null, ${sqlStr(r.status)}, ${sqlStr(r.started_at)}, 'cma500_v1');`
  );
}
for (const f of qaHumanFindingsCC) {
  fixtureSql.push(`insert into call_center.qa_findings (review_id, parameter_code, value, primary_turn_id) values (${sqlStr(f.review_id)}, 'context_continuity_rate', ${sqlStr(f.value)}, 'cma500_turn_1');`);
}
for (const f of qaHumanFindingsTP) {
  fixtureSql.push(`insert into call_center.qa_findings (review_id, parameter_code, value, primary_turn_id) values (${sqlStr(f.review_id)}, 'task_progression_rate', ${sqlStr(f.value)}, 'cma500_turn_1');`);
}

fixtureSql.push('-- automated QA evaluations + observations');
for (const e of qaAutoEvals) {
  fixtureSql.push(
    `insert into call_center.automated_qa_evaluations (id, interaction_id, channel, agent_id, status, prompt_version, contract_version, schema_version, request_ids, transcript_snapshot, transcript_hash, evaluated_turn_ids, uncovered_turn_ids, unassessable_parameters, evaluation_completeness, window_count, started_at) values (${sqlStr(e.id)}, ${sqlStr(e.interaction_id)}, 'voice', ${sqlStr(e.agent_id)}, ${sqlStr(e.status)}, 'cma500_p1', 'cma500_v1', 'cma500_s1', '{}'::jsonb, '{}'::jsonb, ${sqlStr('cma500_hash_' + e.id)}, '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, ${sqlStr(e.started_at)});`
  );
}
for (const o of qaAutoObsCC) {
  fixtureSql.push(`insert into call_center.automated_qa_observations (evaluation_id, parameter_code, value, primary_turn_id) values (${sqlStr(o.evaluation_id)}, 'context_continuity_rate', ${sqlStr(o.value)}, 'cma500_turn_1');`);
}
for (const o of qaAutoObsTP) {
  fixtureSql.push(`insert into call_center.automated_qa_observations (evaluation_id, parameter_code, value, primary_turn_id) values (${sqlStr(o.evaluation_id)}, 'task_progression_rate', ${sqlStr(o.value)}, 'cma500_turn_1');`);
}

fixtureSql.push('commit;');
writeFileSync(path.join(OUT_DIR, 'session7t-dataset-fixtures.sql'), fixtureSql.join('\n') + '\n');

const cleanupSql = [
  '-- Session 7-T — CMA_POC_500_V1 cleanup. Removes every cma500_ row.',
  'begin;',
  "delete from call_center.automated_qa_observations where evaluation_id in (select id from call_center.automated_qa_evaluations where interaction_id like 'cma500_%');",
  "delete from call_center.automated_qa_evaluations where interaction_id like 'cma500_%';",
  "delete from call_center.qa_findings where review_id in (select id from call_center.qa_reviews where interaction_id like 'cma500_%');",
  "delete from call_center.qa_reviews where interaction_id like 'cma500_%';",
  "delete from call_center.chat_sessions where upstream_session_id like 'cma500_%';",
  "delete from call_center.customer_interactions where interaction_id like 'cma500_%';",
  'commit;',
];
writeFileSync(path.join(OUT_DIR, 'session7t-dataset-cleanup.sql'), cleanupSql.join('\n') + '\n');

console.log('Generated', voiceRows.length, 'voice rows,', chatRows.length, 'chat rows,',
  qaHumanReviews.length, 'human QA reviews,', qaAutoEvals.length, 'automated QA evaluations.');
console.log('Expected results written to session7t-expected-results.json');
console.log(JSON.stringify(expected.measures, null, 2));
