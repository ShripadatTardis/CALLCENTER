import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(process.env.CUSTOMER360_SUPABASE_URL, process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { resolveCmaMeasure } = await import('../tmp/cmaOwnershipResolver.mjs');

const access = { allCategories: true, authorizedAgentIds: 'all' };
const window = { from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  cond ? pass++ : fail++;
}

// The 3 mock measures — real working path through evaluateCmaMeasure's own governance
// short-circuit, not a registry label with nothing behind it.
for (const id of ['CANON-NPS-CAMPAIGNS', 'CANON-ORCHESTRATOR-FLOW-METRICS', 'CANON-WHATSAPP-CONNECTION-STATUS']) {
  const r = await resolveCmaMeasure(supabase, id, access, access, { window }, []);
  check(`${id} live path returns a real mock-kind result`, r.value && r.value.kind === 'mock', JSON.stringify(r.value));
}

// The 5 non-aggregate measures — real RPC-backed resolvers.
const sent = await resolveCmaMeasure(supabase, 'CANON-SENT', access, access, { window }, []);
check('CANON-SENT live path returns a real distribution', sent.value && (sent.value.kind === 'distribution' || sent.value.kind === 'no_eligible_rows'), JSON.stringify(sent.value));

const calib1 = await resolveCmaMeasure(supabase, 'CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI', access, access, { window }, []);
check('CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI live path returns a real paired_comparison', calib1.value && (calib1.value.kind === 'paired_comparison' || calib1.value.kind === 'no_eligible_rows'), JSON.stringify(calib1.value)?.slice(0, 200));

const calib2 = await resolveCmaMeasure(supabase, 'CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE', access, access, { window }, []);
check('CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE live path returns a real distribution', calib2.value && (calib2.value.kind === 'distribution' || calib2.value.kind === 'no_eligible_rows'), JSON.stringify(calib2.value)?.slice(0, 200));

const calib3 = await resolveCmaMeasure(supabase, 'CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME', access, access, { window }, []);
check('CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME live path returns a real paired_comparison', calib3.value && (calib3.value.kind === 'paired_comparison' || calib3.value.kind === 'no_eligible_rows'), JSON.stringify(calib3.value)?.slice(0, 200));

// Corrective action lookup needs a real record id.
const { data: caRows } = await supabase.from('corrective_actions').select('id').limit(1);
if (caRows && caRows.length > 0) {
  const ca = await resolveCmaMeasure(supabase, 'CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY', access, access, { window, recordId: caRows[0].id }, []);
  check('CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY live path returns a real record_lookup', ca.value && ca.value.kind === 'record_lookup', JSON.stringify(ca.value));
} else {
  console.log('SKIP CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY live check — no corrective_actions rows exist to look up (not a code defect).');
}

// The 2 legacy adapters.
const intentAcc = await resolveCmaMeasure(supabase, 'CANON-AVG-INTENT-ACC', access, access, { window }, []);
check('CANON-AVG-INTENT-ACC live path returns a real result (value or honest unsupported)', intentAcc.value && ['value', 'zero_denominator', 'unsupported'].includes(intentAcc.value.kind), JSON.stringify(intentAcc.value));

const techPerf = await resolveCmaMeasure(supabase, 'CANON-CALL-TECH-PERF', access, access, { window }, []);
check('CANON-CALL-TECH-PERF live path returns an honest explanation (client-side delivery)', Boolean(techPerf.unavailableReason), techPerf.unavailableReason);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
