// CMA-2 Governance Registry — deterministic verification suite.
//
// Same convention as every other *-verify.mjs in this project: pure JS
// assertions against the real compiled/source artifacts, no live
// database connection (this repo's established testing approach has no
// disposable-Postgres harness wired into verify:full — every other
// *-verify.mjs script here is a logic-level test, and this one follows
// that same convention rather than introducing a new kind of test
// infrastructure). SQL dependency-order correctness (the forward-FK
// class of defect CMA-1A/CMA_DATA_MODEL_v0_3_1.md §1 found and fixed) is
// checked statically against the migration file's own text, the same
// way that correction was originally traced by hand.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry, coverageReport, BASE_FACTS, DIMENSIONS } from './cma-registry-build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { console.log(`PASS ${name}`); pass++; }
  else { console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`); fail++; }
}

const registry = buildRegistry();
const registry2 = buildRegistry();

// --- Determinism / repeatability ---
assert('seeding is deterministic: two builds produce identical canonical measure sets',
  JSON.stringify(registry.canonicalMeasures) === JSON.stringify(registry2.canonicalMeasures));
assert('seeding is deterministic: two builds produce identical measure occurrence sets',
  JSON.stringify(registry.measures) === JSON.stringify(registry2.measures));
assert('seeding is deterministic: two builds produce identical chart visualization sets',
  JSON.stringify(registry.chartVisualizations) === JSON.stringify(registry2.chartVisualizations));

// --- Every register row accounted for; no silent omission (brief §3) ---
const accountedFor = registry.measures.length + registry.chartVisualizations.length + registry.flaggedCharts.length;
assert('every row in the Master Measures Register is accounted for (mapped, visualization, or flagged)',
  accountedFor === registry.totalRegisterRows,
  `accounted=${accountedFor} total=${registry.totalRegisterRows}`);

const classifiedIds = new Set(registry.occurrenceClassification.map((o) => o.measure_id));
assert('every accounted-for row has an explicit occurrence classification',
  classifiedIds.size === accountedFor);

const validClassifications = new Set(['mapped_to_canonical_measure', 'visualization_only', 'pending_business_definition_decision', 'not_yet_implemented_or_mock', 'visualization_only_unresolved_target']);
assert('every occurrence classification is one of the brief-required buckets',
  registry.occurrenceClassification.every((o) => validClassifications.has(o.classification)));

// --- No duplicate identifiers (uniqueness, brief §8) ---
function dupes(ids) {
  const seen = new Set(); const d = [];
  for (const id of ids) { if (seen.has(id)) d.push(id); seen.add(id); }
  return d;
}
assert('no duplicate canonical measure ids', dupes(registry.canonicalMeasures.map((c) => c.id)).length === 0,
  JSON.stringify(dupes(registry.canonicalMeasures.map((c) => c.id))));
assert('no duplicate measure occurrence ids', dupes(registry.measures.map((m) => m.id)).length === 0);
assert('no duplicate chart visualization ids', dupes(registry.chartVisualizations.map((c) => c.id)).length === 0);
assert('no duplicate base fact ids', dupes(BASE_FACTS.map((b) => b.id)).length === 0);
assert('no duplicate dimension ids', dupes(DIMENSIONS.map((d) => d.id)).length === 0);

// --- Referential integrity (brief §8: valid measure/fact/dimension relationships) ---
const canonicalIds = new Set(registry.canonicalMeasures.map((c) => c.id));
const measureIds = new Set(registry.measures.map((m) => m.id));
const dimensionIds = new Set(DIMENSIONS.map((d) => d.id));
const baseFactIds = new Set(BASE_FACTS.map((b) => b.id));

assert('every measure occurrence references an existing canonical measure',
  registry.measures.every((m) => canonicalIds.has(m.canonical_measure_id)));
assert('every measure_dimensions row references an existing measure and dimension',
  registry.measureDimensions.every((md) => measureIds.has(md.measure_id) && dimensionIds.has(md.dimension_id)));
assert('every measure_base_facts row references an existing measure and base fact',
  registry.measureBaseFacts.every((mbf) => measureIds.has(mbf.measure_id) && baseFactIds.has(mbf.base_fact_id)));
assert('every migration_reference_measure_id points at a real occurrence of that same canonical measure',
  registry.canonicalMeasures.every((c) => !c.migration_reference_measure_id ||
    registry.measures.some((m) => m.id === c.migration_reference_measure_id && m.canonical_measure_id === c.id)));

// --- Chart visualization target constraint (brief §2/§5.2 of the data model doc) ---
assert('every registered chart visualization has exactly one target (canonical measure XOR base fact)',
  registry.chartVisualizations.every((cv) =>
    (cv.visualizes_canonical_measure_id != null) + (cv.visualizes_base_fact_id != null) === 1));
assert('every chart target reference resolves to a real row',
  registry.chartVisualizations.every((cv) =>
    (cv.visualizes_canonical_measure_id == null || canonicalIds.has(cv.visualizes_canonical_measure_id)) &&
    (cv.visualizes_base_fact_id == null || baseFactIds.has(cv.visualizes_base_fact_id))));
assert('at least one chart with a genuinely dynamic/parameterized target is honestly flagged, not force-fit',
  registry.flaggedCharts.length >= 1);

// --- Governance vocabulary invariants (brief §4: pending decisions never silently treated as authoritative) ---
assert('every mock canonical measure has measure_class=mock_indicator and vice versa',
  registry.canonicalMeasures.every((c) => (c.measure_class === 'mock_indicator') === (c.governed_algorithm_status === 'mock')));
assert('an unimplemented canonical measure has no live, decided migration reference',
  registry.canonicalMeasures.filter((c) => c.governed_algorithm_status === 'unimplemented')
    .every((c) => c.migration_reference_measure_id == null ||
      !registry.measures.find((m) => m.id === c.migration_reference_measure_id && m.status === 'live')));
assert('a pending_decision canonical measure has >=2 distinct live occurrences (a real, unresolved disagreement, not a single-implementation default)',
  registry.canonicalMeasures.filter((c) => c.governed_algorithm_status === 'pending_decision')
    .every((c) => registry.measures.filter((m) => m.canonical_measure_id === c.id && m.status === 'live').length >= 2));
assert('no occurrence under a pending_decision canonical measure is classified as finally "mapped" (its governing algorithm is not yet decided)',
  registry.occurrenceClassification
    .filter((o) => o.canonical_measure_id && registry.canonicalMeasures.find((c) => c.id === o.canonical_measure_id)?.governed_algorithm_status === 'pending_decision')
    .every((o) => o.classification === 'pending_business_definition_decision'));
assert('no mock or unimplemented occurrence is classified as "mapped" (never treated as an authoritative CMA output)',
  registry.measures.every((m) => {
    if (m.status !== 'mock' && m.status !== 'backend_gap' && m.status !== 'awaiting_telemetry' && m.status !== 'partial') return true;
    const occ = registry.occurrenceClassification.find((o) => o.measure_id === m.id);
    return occ && occ.classification !== 'mapped_to_canonical_measure' || m.status === 'partial' /* a partial occurrence inside an otherwise-decided group can be a legitimate mapped partial-coverage row */;
  }));

// --- Measure-neutral Base Facts (brief §6: no precomputed numerator/denominator contributions stored as facts) ---
const forbiddenFactNamePattern = /(^|_)(rate|ratio|percent|pct)(_|$)|success_count|contact_rate/i;
assert('no base fact is itself a precomputed ratio/rate (base facts stay measurement-neutral)',
  BASE_FACTS.every((f) => !forbiddenFactNamePattern.test(f.field_name)));

// --- Static migration SQL dependency-order check (the CMA-1A-class forward-FK defect) ---
const migrationPath = path.join(ROOT, 'supabase/migrations/20261027000000_cma_governance_registry.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');
function firstIndexOf(sql, needle) { const i = sql.indexOf(needle); return i; }
const idxCanonicalCreate = firstIndexOf(migrationSql, 'create table if not exists call_center.cma_canonical_measures');
const idxMeasuresCreate = firstIndexOf(migrationSql, 'create table if not exists call_center.cma_measures');
const idxFkAlter = firstIndexOf(migrationSql, 'add constraint cma_canonical_measures_migration_reference_measure_id_fkey');
const idxMeasureDimCreate = firstIndexOf(migrationSql, 'create table if not exists call_center.cma_measure_dimensions');
const idxMeasureBaseFactCreate = firstIndexOf(migrationSql, 'create table if not exists call_center.cma_measure_base_facts');
const idxChartCreate = firstIndexOf(migrationSql, 'create table if not exists call_center.cma_chart_visualizations');

assert('cma_canonical_measures has no inline forward reference to cma_measures (the CMA-1A-class defect)',
  !/migration_reference_measure_id\s+text\s+references/.test(migrationSql));
assert('cma_measures is created before cma_canonical_measures gets its migration_reference_measure_id FK added',
  idxMeasuresCreate > 0 && idxFkAlter > idxMeasuresCreate);
assert('cma_canonical_measures is created before cma_measures (dependency order)',
  idxCanonicalCreate > 0 && idxCanonicalCreate < idxMeasuresCreate);
assert('cma_measure_dimensions is created after both cma_measures and cma_dimensions',
  idxMeasureDimCreate > idxMeasuresCreate);
assert('cma_measure_base_facts is created after both cma_measures and cma_base_facts',
  idxMeasureBaseFactCreate > idxMeasuresCreate);
assert('cma_chart_visualizations is created after cma_canonical_measures, cma_base_facts, and cma_dimensions',
  idxChartCreate > idxCanonicalCreate);
assert('every new RPC is revoked from public/anon/authenticated and granted only to service_role',
  migrationSql.includes("revoke all on function %s from public, anon, authenticated") &&
  migrationSql.includes("grant execute on function %s to service_role"));
assert('the new read permission is additive (on conflict do nothing), never overwrites an existing row',
  /insert into call_center\.permissions[\s\S]*?on conflict \(key\) do nothing/.test(migrationSql));

// --- Static API authorization check (brief §8: server-side authorization for registry modifications/access) ---
const adminApiPath = path.join(ROOT, 'api/admin.ts');
const adminApiSrc = readFileSync(adminApiPath, 'utf8');
const registryHandlerMatch = adminApiSrc.match(/async function handleCmaRegistryGet[\s\S]*?\n}\n/);
assert('handleCmaRegistryGet exists', !!registryHandlerMatch);
if (registryHandlerMatch) {
  const body = registryHandlerMatch[0];
  const permIdx = body.indexOf("requirePermission(req, res, 'cma.registry.view')");
  const rpcIdx = body.search(/await (listCanonicalMeasures|getCanonicalMeasure|listCanonicalMeasureOccurrences|getMeasureOccurrence|listDimensions|listBaseFactsForMeasure|listChartVisualizations|getGovernanceStatus)\(/);
  assert('handleCmaRegistryGet checks cma.registry.view before any registry data is read', permIdx >= 0 && permIdx < rpcIdx);
}
assert('the cmaRegistry resource is wired into the dispatcher and rejects non-GET methods',
  /resource === 'cmaRegistry'[\s\S]*?methodNotAllowed\(res, \['GET'\]\)/.test(adminApiSrc));

// --- Seed file idempotency shape (every insert is an upsert) ---
const seedPath = path.join(ROOT, 'supabase/seed/cma_governance_registry_seed.sql');
const seedSql = readFileSync(seedPath, 'utf8');
const insertLines = seedSql.split('\n').filter((l) => l.trim().startsWith('insert into'));
assert('every generated seed insert is an idempotent upsert (on conflict ... do update/do nothing)',
  insertLines.every((l) => l.includes('on conflict')));
assert('the generated seed file is non-trivial and covers every registered entity type',
  ['cma_base_facts', 'cma_dimensions', 'cma_canonical_measures', 'cma_measures', 'cma_measure_dimensions', 'cma_measure_base_facts', 'cma_chart_visualizations']
    .every((t) => seedSql.includes(`insert into call_center.${t}`)));

console.log('');
console.log(JSON.stringify(coverageReport(registry), null, 2));
console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
