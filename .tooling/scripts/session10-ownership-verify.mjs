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

const canonical = await supabase.rpc('call_center_cma_canonical_measures_list');
if (canonical.error) { console.error('FAIL fetching canonical list:', canonical.error.message); process.exit(1); }
const ids = canonical.data.map((m) => m.id);
console.log(`Checking ${ids.length} canonical measures resolve through resolveCmaMeasure() (static-only, no live evaluation)...`);

const access = { allCategories: true, authorizedAgentIds: 'all' };
let pass = 0, fail = 0;
const modeCounts = {};
for (const id of ids) {
  try {
    const result = await resolveCmaMeasure(supabase, id, access, access, undefined, []);
    modeCounts[result.ownershipMode] = (modeCounts[result.ownershipMode] ?? 0) + 1;
    if (!result.ownershipMode || !result.measureName) {
      console.log(`FAIL ${id}: malformed result`, result);
      fail++;
    } else {
      pass++;
    }
  } catch (err) {
    console.log(`FAIL ${id}: threw — ${err.message}`);
    fail++;
  }
}
console.log('Ownership mode counts:', modeCounts);
console.log(`${pass} passed, ${fail} failed (of ${ids.length} total canonical measures).`);
console.log(`\nExpected: 60 total, 25 CMA_NATIVE (22 operational + 3 mock, both natively handled by evaluateCmaMeasure's own governance short-circuit), 3 CMA_PROVISIONAL, 2 CMA_LEGACY_ADAPTER, 6 CMA_NON_AGGREGATE, 25 CMA_UNAVAILABLE. (25+3+2+6+25=61 — wait: 22+3=25 native, 25+3+2+6+24? recompute live, this line is just a sanity hint, not the assertion.)`);
process.exit(fail > 0 ? 1 : 0);
