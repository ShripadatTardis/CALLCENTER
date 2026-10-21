// Session 9 — FCR-03 / ESC-03 / AHT-03 candidate accuracy verification.
//
// Uses the REAL, already-implemented, already-deployed compiled formulas
// from src/server/analytics/ratioMath.ts (bundled via esbuild into
// .tooling/tmp/ratioMath.mjs, not a reimplementation), run against the
// real CMA_POC_500_V1 synthetic population fetched read-only from
// production. Expected values below were computed independently via
// plain SQL aggregation BEFORE this script was written (see
// docs/SESSION_9_FCR_ESC_AHT_CMA_OWNERSHIP.md Part G for the exact
// queries) — never by calling computeFcr/computeEscalationRate/computeAht
// itself, per the brief's explicit "do not derive independent
// expectations by calling the CMA algorithm under test."
//
// Read-only: performs no INSERT/UPDATE/DELETE against production.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { computeFcr, computeEscalationRate, computeAht } from '../tmp/ratioMath.mjs';
import { selectEscalationOccurredEvidencePath } from '../tmp/cmaCandidateAlgorithms9.mjs';

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}
const envVars = parseEnvFile('.env');
for (const [k, v] of Object.entries(envVars)) if (!process.env[k]) process.env[k] = v;

const SUPABASE_URL = process.env.CUSTOMER360_SUPABASE_URL;
const SERVICE_KEY = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY not found in .env — cannot run live accuracy check.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
function assertEqual(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

async function main() {
  // --- fetch the real 350-row CMA_POC_500_V1 voice population, read-only ---
  // call_center schema is not exposed to PostgREST in this project (every
  // read goes through a public.call_center_* RPC) — reuses the Session
  // 8.1 TEST-mode RPC, which already returns the full
  // customer_interactions row shape (including fcr), unrestricted.
  const { data: rows, error } = await supabase.rpc('call_center_test_mode_voice_interactions_list', {
    p_dataset_id: 'CMA_POC_500_V1', p_all_agents: true, p_authorized_agent_ids: [],
  });
  if (error) { console.error('FAIL: could not fetch fixture rows —', error.message); process.exit(1); }
  console.log(`Fetched ${rows.length} rows from CMA_POC_500_V1 (channel=voice).`);

  const asCalls = rows.map((r) => ({ fcr: r.fcr, outcome: r.outcome, duration_seconds: r.duration_seconds }));

  // --- independently pre-computed expected values (plain SQL aggregates, run before this script existed) ---
  assertEqual('row count matches known benchmark', rows.length, 350);

  const fcrResult = computeFcr(asCalls);
  assertEqual('FCR-03 numerator (all calls)', fcrResult.numerator, 164);
  assertEqual('FCR-03 denominator (all calls)', fcrResult.denominator, 350);
  assertEqual('FCR-03 value', fcrResult.value, 46.9); // 164/350 * 100, rounded to 1 decimal by rateOrNull()

  const escResult = computeEscalationRate(asCalls);
  assertEqual('ESC-03 numerator (escalated, handled only)', escResult.numerator, 84);
  assertEqual('ESC-03 denominator (handled only)', escResult.denominator, 248);
  assertEqual('ESC-03 value', escResult.value, 33.9); // 84/248 * 100, rounded to 1 decimal

  const ahtResult = computeAht(asCalls);
  assertEqual('AHT-03 denominator (finite, non-stale)', ahtResult.denominator, 350);
  assertEqual('AHT-03 numerator (sum seconds)', ahtResult.numerator, 199727);
  assertEqual('AHT-03 value (mean seconds, rounded)', ahtResult.value, Math.round(199727 / 350));

  // --- restricted agent scope: VF_TEST_AGENT_A only ---
  const agentARows = asCalls.filter((_, i) => rows[i].agent_id === 'VF_TEST_AGENT_A');
  const { data: countCheck } = await supabase
    .from('customer_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('dataset_id', 'CMA_POC_500_V1').eq('channel', 'voice').eq('agent_id', 'VF_TEST_AGENT_A');
  console.log(`VF_TEST_AGENT_A rows: ${agentARows.length}`);
  const fcrAgentA = computeFcr(agentARows);
  assertEqual('FCR-03 restricted to VF_TEST_AGENT_A — denominator matches row count', fcrAgentA.denominator, agentARows.length);

  // --- empty population ---
  const emptyFcr = computeFcr([]);
  assertEqual('FCR-03 empty population — value is null, not 0', emptyFcr.value, null);
  const emptyEsc = computeEscalationRate([]);
  assertEqual('ESC-03 empty population — value is null, not 0', emptyEsc.value, null);
  const emptyAht = computeAht([]);
  assertEqual('AHT-03 empty population — value is null, not 0', emptyAht.value, null);

  // --- null/indeterminate outcome never silently becomes resolved or escalated ---
  const indeterminateRows = asCalls.filter((c) => c.outcome === null);
  assertEqual('indeterminate-outcome row count', indeterminateRows.length, 102);
  const escIndeterminateContribution = computeEscalationRate(indeterminateRows);
  assertEqual('ESC-03 over ONLY indeterminate rows — denominator is 0 (none silently counted)', escIndeterminateContribution.denominator, 0);
  assertEqual('ESC-03 over ONLY indeterminate rows — value is null, never fabricated', escIndeterminateContribution.value, null);
  // ...but AHT-03 does NOT exclude indeterminate-outcome rows (duration-based, not outcome-based):
  const ahtIndeterminate = computeAht(indeterminateRows);
  assertEqual('AHT-03 over indeterminate-outcome rows — still counts them if duration is valid', ahtIndeterminate.denominator > 0, true);

  // --- evidence-path routing for the indeterminate population (Part D/F demonstration, no LLM call made) ---
  const noContext = selectEscalationOccurredEvidencePath({
    interactionId: 'sample-indeterminate-no-transcript', outcome: null, escalationTrigger: null, verificationContextAvailable: false,
  });
  assertEqual('indeterminate outcome, no transcript -> unsupported_inference (never silently resolved)', noContext.kind, 'unsupported_inference');
  const withContext = selectEscalationOccurredEvidencePath({
    interactionId: 'sample-indeterminate-with-transcript', outcome: null, escalationTrigger: null, verificationContextAvailable: true,
  });
  assertEqual('indeterminate outcome, transcript available -> verification_required (never fast_path)', withContext.kind, 'verification_required');
  const determinateFast = selectEscalationOccurredEvidencePath({
    interactionId: 'sample-escalated', outcome: 'escalated', escalationTrigger: 'policy exception', verificationContextAvailable: false,
  });
  assertEqual('determinate escalated outcome -> fast_path (no LLM call needed)', determinateFast.kind, 'fast_path');
  const contradiction = selectEscalationOccurredEvidencePath({
    interactionId: 'sample-contradiction', outcome: 'resolved', escalationTrigger: 'customer requested supervisor', verificationContextAvailable: false,
  });
  assertEqual('resolved outcome but trigger present, no transcript -> unsupported_inference (contradiction, not silently resolved)', contradiction.kind, 'unsupported_inference');

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
