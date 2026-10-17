// CMA-2 Governance Registry — deterministic registry builder.
//
// Parses docs/MASTER_MEASURES_REGISTER.csv (the approved measure
// inventory) and derives the CMA governance registry seed data:
// cma_canonical_measures, cma_measures, cma_measure_dimensions,
// cma_measure_base_facts, cma_chart_visualizations, plus an
// occurrence-classification coverage report. Pure function of the CSV
// content — same input always produces the same output (determinism
// requirement, brief §9).
//
// Grouping rule: rows are grouped into one canonical measure by their
// "Measure Name" column with any trailing parenthetical qualifier
// stripped (e.g. "First Contact Resolution (unscoped)" and "(per-agent)"
// both collapse to "First Contact Resolution"). This is exactly the
// pattern used throughout docs/MASTER_MEASURES_REGISTER.md §7.5 (FCR,
// Escalation Rate, AHT, Intent Accuracy, Technical Performance) and
// naturally leaves every RATIO-GAP-*/CAMP-*/QA-*/CALIB-*/CUST360-* row
// that documents a genuinely distinct business concept as its own
// canonical measure, since those each carry a distinct Measure Name —
// no ID-prefix heuristic is used, because ID prefixes alone would
// wrongly merge all 25 RATIO-GAP-* rows (each a distinct ratio) into one
// group. CHART-* rows are routed to cma_chart_visualizations instead of
// cma_canonical_measures (brief §2/§5.2 of CMA_DATA_MODEL_v0_3_1.md).
//
// This script is read-only against the CSV and writes nothing by
// itself — call buildRegistry() and consume the returned structure, or
// run this file directly to print the coverage report to stdout.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV_PATH = path.resolve(__dirname, '../../docs/MASTER_MEASURES_REGISTER.csv');

// ---------------------------------------------------------------------
// RFC4180 CSV parsing (quoted fields, embedded commas/newlines, "" escape)
// ---------------------------------------------------------------------
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export function loadCsvRecords(csvPath = DEFAULT_CSV_PATH) {
  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const rec = {};
    header.forEach((h, idx) => { rec[h.trim()] = (r[idx] ?? '').trim(); });
    return rec;
  });
}

// ---------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------
function stripParenthetical(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function slugToCanonicalId(name, usedIds) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const abbrevMap = {
    FIRST: 'FIRST', CONTACT: 'CONTACT', RESOLUTION: 'RES', RATE: 'RATE', ESCALATION: 'ESC',
    AVERAGE: 'AVG', HANDLE: 'HANDLE', TIME: 'TIME', AUTHENTICATION: 'AUTH', SUCCESS: 'SUCCESS',
    INTENT: 'INTENT', ACCURACY: 'ACC', SENTIMENT: 'SENT', TECHNICAL: 'TECH', PERFORMANCE: 'PERF',
  };
  const slug = words.map((w) => abbrevMap[w] ?? w).join('-').slice(0, 40);
  let id = `CANON-${slug}`;
  let suffix = 2;
  while (usedIds.has(id)) { id = `CANON-${slug}-${suffix}`; suffix++; }
  usedIds.add(id);
  return id;
}

const MOCK_NAME_HINTS = ['NPS', 'ORCHESTRATOR', 'WHATSAPP'];

function isMockRow(rec) {
  if ((rec['Source Classification'] ?? '').toUpperCase().includes('MOCK')) return true;
  const obs = `${rec.Observations ?? ''} ${rec['Business Description'] ?? ''}`.toUpperCase();
  return MOCK_NAME_HINTS.some((hint) => obs.includes(hint)) && obs.includes('MOCK');
}

function isUnimplementedRow(rec) {
  const src = (rec['Original Data Source'] ?? '').toLowerCase();
  const vs = (rec['Verification Status'] ?? '').toLowerCase();
  return src.includes('not implemented') || vs.includes('not implemented');
}

function mapMeasureStatus(rec, { mock, unimplemented }) {
  if (mock) return 'mock';
  if (unimplemented) {
    const src = (rec['Original Data Source'] ?? '').toLowerCase();
    if (src.includes('awaiting_telemetry')) return 'awaiting_telemetry';
    if (src.includes('partial')) return 'partial';
    return 'backend_gap';
  }
  const srcClass = rec['Source Classification'] ?? '';
  if (srcClass === 'UNKNOWN') return 'backend_gap';
  return 'live';
}

function nonEmpty(v, fallback = 'unknown') {
  const t = (v ?? '').trim();
  if (t === '' || t.toUpperCase() === 'N/A' || t.toUpperCase() === 'UNKNOWN') return fallback;
  return t;
}

// ---------------------------------------------------------------------
// Fixed, hand-verified catalogs — Base Facts and Dimensions are
// measurement-neutral, governed vocabulary, not auto-derived from CSV
// free text (brief §2/§6: "do not introduce precomputed numerator/
// denominator contributions... into the interaction storage" — these
// mirror real columns already in call_center.customer_interactions
// (CMA-1A) plus the real qa_findings/automated_qa_observations/
// campaign_executions tables, nothing invented).
// ---------------------------------------------------------------------
export const BASE_FACTS = [
  { id: 'FACT-DURATION-SECONDS', entity: 'interaction', field_name: 'duration_seconds', data_type: 'integer', source_table: 'call_center.customer_interactions', description: 'Reported call/session duration in seconds.' },
  { id: 'FACT-OUTCOME', entity: 'interaction', field_name: 'outcome', data_type: 'text', source_table: 'call_center.customer_interactions', description: 'Interaction outcome classification (e.g. resolved, escalated).' },
  { id: 'FACT-FCR', entity: 'interaction', field_name: 'fcr', data_type: 'boolean', source_table: 'call_center.customer_interactions', description: 'Whether the interaction was resolved on first contact.' },
  { id: 'FACT-SENTIMENT-SCORE', entity: 'interaction', field_name: 'sentiment_score', data_type: 'numeric', source_table: 'call_center.customer_interactions', description: 'Per-interaction sentiment score.' },
  { id: 'FACT-WAS-AUTHENTICATED', entity: 'interaction', field_name: 'was_authenticated', data_type: 'boolean', source_table: 'call_center.customer_interactions', description: 'Whether an authentication flow was attempted and its result.' },
  { id: 'FACT-ESCALATION-TRIGGER', entity: 'interaction', field_name: 'escalation_trigger', data_type: 'text', source_table: 'call_center.customer_interactions', description: 'Recorded reason an interaction escalated, when available.' },
  { id: 'FACT-INTENT-CONFIDENCE', entity: 'interaction', field_name: 'intent_confidence', data_type: 'numeric', source_table: 'call_center.customer_interactions', description: "Model's own classifier confidence for the detected intent." },
  { id: 'FACT-INTENT', entity: 'interaction', field_name: 'intent', data_type: 'text', source_table: 'call_center.customer_interactions', description: 'Classified customer intent.' },
  { id: 'FACT-STARTED-AT', entity: 'interaction', field_name: 'started_at', data_type: 'timestamptz', source_table: 'call_center.customer_interactions', description: 'Interaction start timestamp.' },
  { id: 'FACT-CHANNEL', entity: 'interaction', field_name: 'channel', data_type: 'text', source_table: 'call_center.customer_interactions', description: 'Interaction channel (voice/chat).' },
  { id: 'FACT-AGENT-ID', entity: 'interaction', field_name: 'agent_id', data_type: 'text', source_table: 'call_center.customer_interactions', description: 'Handling agent identifier.' },
  { id: 'FACT-CAMPAIGN-ID', entity: 'interaction', field_name: 'campaign_id', data_type: 'uuid', source_table: 'call_center.customer_interactions', description: 'Linked outbound campaign, when resolved.' },
  { id: 'FACT-CUSTOMER-ID', entity: 'interaction', field_name: 'customer_id', data_type: 'uuid', source_table: 'call_center.customer_interactions', description: 'Resolved customer identity, when available.' },
  { id: 'FACT-SOURCE', entity: 'interaction', field_name: 'source', data_type: 'text', source_table: 'call_center.customer_interactions', description: "Upstream system of record ('call-data' or 'chat-sessions')." },
  { id: 'FACT-QA-PARAMETER-VALUE', entity: 'qa_observation', field_name: 'value', data_type: 'text', source_table: 'call_center.qa_findings / automated_qa_observations', description: 'PASS/FAIL/N_A/CANNOT_VERIFY judgment for one QA parameter on one turn or review.' },
  { id: 'FACT-CAMPAIGN-EXECUTION-TRIGGERED', entity: 'campaign_execution', field_name: 'triggered_at', data_type: 'timestamptz', source_table: 'call_center.campaign_executions', description: 'Whether/when a campaign target was triggered.' },
  { id: 'FACT-CAMPAIGN-RESULT-IS-SUCCESS', entity: 'campaign_execution', field_name: 'is_success', data_type: 'boolean', source_table: 'call_center.campaign_results', description: 'Raw result-rule success flag for one campaign execution.' },
  { id: 'FACT-CAMPAIGN-CLASSIFICATION-IS-SUCCESS', entity: 'campaign_execution', field_name: 'is_success', data_type: 'boolean', source_table: 'call_center.campaign_classifications', description: 'Policy-classification success flag for one campaign execution.' },
  { id: 'FACT-CALL-COUNT', entity: 'interaction', field_name: '(count)', data_type: 'integer', source_table: 'call_center.customer_interactions', description: 'Raw count of voice interactions — no ratio, used by raw-count charts.' },
  { id: 'FACT-CHAT-SESSION-COUNT', entity: 'interaction', field_name: '(count)', data_type: 'integer', source_table: 'call_center.customer_interactions', description: 'Raw count of chat interactions — no ratio, used by raw-count charts.' },
  { id: 'FACT-LATENCY-MS', entity: 'call_metric', field_name: 'latency_ms', data_type: 'integer', source_table: 'voice pipeline Call Metrics API', description: 'Per-call pipeline latency breakdown (STT/LLM/TTS/tool/RAG).' },
  { id: 'FACT-CONCURRENCY-COUNT', entity: 'interaction', field_name: '(count, status=active)', data_type: 'integer', source_table: 'call_center.customer_interactions', description: 'Concurrent active-call count at a point in time.' },
];

export const DIMENSIONS = [
  { id: 'time', label: 'Time', canonical_values: null, normalization_rule: 'Bucketed from started_at; bucket width is caller-selected (day/week/etc.).', mapping_source: 'call_center.customer_interactions.started_at' },
  { id: 'channel', label: 'Channel', canonical_values: '["voice","chat"]', normalization_rule: "Direct value of customer_interactions.channel; no free-text variants exist.", mapping_source: 'call_center.customer_interactions.channel' },
  { id: 'agent', label: 'Agent', canonical_values: null, normalization_rule: 'Resolved by agent_id, never by display-name string match (closes the CHART-VOICE-06-class join-reliability gap).', mapping_source: 'call_center.customer_interactions.agent_id' },
  { id: 'campaign', label: 'Campaign', canonical_values: null, normalization_rule: 'Resolved by campaign_id FK; campaign_name is display-only and never used for grouping.', mapping_source: 'call_center.customer_interactions.campaign_id' },
  { id: 'interaction_source', label: 'Interaction Source', canonical_values: '["call-data","chat-sessions"]', normalization_rule: 'Direct value of customer_interactions.source.', mapping_source: 'call_center.customer_interactions.source' },
  { id: 'outcome', label: 'Outcome', canonical_values: '["resolved","escalated"]', normalization_rule: 'Direct value of customer_interactions.outcome; indeterminate/null outcomes are excluded from outcome-grouped views, never coerced into one of the two known values.', mapping_source: 'call_center.customer_interactions.outcome' },
  { id: 'customer', label: 'Customer', canonical_values: null, normalization_rule: 'Resolved by customer_id FK; only available when identity resolution succeeded (customer_id is nullable).', mapping_source: 'call_center.customer_interactions.customer_id' },
];

const FIELD_TO_BASE_FACT = {
  duration_seconds: 'FACT-DURATION-SECONDS', outcome: 'FACT-OUTCOME', fcr: 'FACT-FCR',
  sentiment_score: 'FACT-SENTIMENT-SCORE', sentiment: 'FACT-SENTIMENT-SCORE', was_authenticated: 'FACT-WAS-AUTHENTICATED',
  escalation_trigger: 'FACT-ESCALATION-TRIGGER', intent_confidence: 'FACT-INTENT-CONFIDENCE', intent_accuracy: 'FACT-INTENT-CONFIDENCE',
  intent: 'FACT-INTENT', started_at: 'FACT-STARTED-AT', channel: 'FACT-CHANNEL', agent_id: 'FACT-AGENT-ID',
  campaign_id: 'FACT-CAMPAIGN-ID', customer_id: 'FACT-CUSTOMER-ID', source: 'FACT-SOURCE',
  'parametercode=': 'FACT-QA-PARAMETER-VALUE', value: 'FACT-QA-PARAMETER-VALUE',
  'is_success': null, // disambiguated per-row below (raw vs policy)
  latency_ms: 'FACT-LATENCY-MS',
};

function findBaseFactsForRow(rec) {
  const haystacks = {
    numerator: (rec.Numerator ?? '').toLowerCase(),
    denominator: (rec.Denominator ?? '').toLowerCase(),
    field: (rec['Exact Backend Field'] ?? '').toLowerCase(),
  };
  const found = new Map(); // base_fact_id -> role
  const consider = (text, role) => {
    for (const [needle, factId] of Object.entries(FIELD_TO_BASE_FACT)) {
      if (!factId) continue;
      if (text.includes(needle)) {
        if (!found.has(factId)) found.set(factId, role);
      }
    }
  };
  // campaign success disambiguation: raw vs policy
  if (haystacks.field.includes('campaign_results') || haystacks.numerator.includes('is_success') && !haystacks.field.includes('classification')) {
    found.set('FACT-CAMPAIGN-RESULT-IS-SUCCESS', 'numerator');
  }
  if (haystacks.field.includes('campaign_classifications') || haystacks.numerator.toLowerCase().includes('policy')) {
    found.set('FACT-CAMPAIGN-CLASSIFICATION-IS-SUCCESS', 'numerator');
  }
  consider(haystacks.numerator, 'numerator');
  consider(haystacks.denominator, 'denominator');
  consider(haystacks.field, 'eligibility_filter');
  // numerator/denominator role wins over eligibility_filter for the same fact
  return [...found.entries()].map(([base_fact_id, role]) => ({ base_fact_id, role }));
}

function findDimensionsForRow(rec) {
  const dims = new Set();
  const agentScope = (rec['Agent Scope'] ?? '').toUpperCase();
  const channelScope = (rec['Channel Scope'] ?? '').toUpperCase();
  const campaignScope = (rec['Campaign Scope'] ?? '').toUpperCase();
  const dateBasis = (rec['Date/Time Basis'] ?? '').toUpperCase();
  const formula = `${rec.Numerator ?? ''} ${rec.Denominator ?? ''} ${rec.Formula ?? ''}`.toLowerCase();
  if (agentScope && agentScope !== 'N/A') dims.add('agent');
  if (channelScope && channelScope !== 'N/A') dims.add('channel');
  if (campaignScope && campaignScope !== 'N/A') dims.add('campaign');
  if (dateBasis && dateBasis !== 'N/A') dims.add('time');
  if (formula.includes('outcome')) dims.add('outcome');
  if (formula.includes('customer') || formula.includes('repeat')) dims.add('customer');
  if ((rec['Original Data Source'] ?? '').toLowerCase().includes('source identity')) dims.add('interaction_source');
  return [...dims];
}

// ---------------------------------------------------------------------
// Chart target resolution
// ---------------------------------------------------------------------
function resolveChartTarget(rec, canonicalByName) {
  const name = rec['Measure Name'] ?? '';
  const desc = `${rec['Business Description'] ?? ''} ${rec.Formula ?? ''} ${rec.Numerator ?? ''}`.toLowerCase();
  // try to match an existing canonical measure by name fragment
  for (const [canonicalName, group] of canonicalByName) {
    const frag = canonicalName.toLowerCase();
    if (frag.length > 3 && desc.includes(frag)) return { visualizes_canonical_measure_id: group.id };
  }
  if (desc.includes('escalat') || desc.includes('outcome')) {
    const g = canonicalByName.get('Escalation Rate') || canonicalByName.get('Resolution Rate');
    if (g) return { visualizes_canonical_measure_id: g.id };
  }
  if (desc.includes('aht') || desc.includes('handle time')) {
    const g = [...canonicalByName.entries()].find(([n]) => n.toLowerCase().includes('handle time'));
    if (g) return { visualizes_canonical_measure_id: g[1].id };
  }
  if (desc.includes('latency')) return { visualizes_base_fact_id: 'FACT-LATENCY-MS' };
  if (desc.includes('concurrency')) return { visualizes_base_fact_id: 'FACT-CONCURRENCY-COUNT' };
  if (desc.includes('chat')) return { visualizes_base_fact_id: 'FACT-CHAT-SESSION-COUNT' };
  if (desc.includes('call') || name.toUpperCase().includes('VOICE')) return { visualizes_base_fact_id: 'FACT-CALL-COUNT' };
  return null; // genuinely no fixed single target — flagged, not forced (mirrors CHART-RT-01's documented gap)
}

function resolvePresentationDimension(rec) {
  const text = `${rec['Business Description'] ?? ''} ${rec['Screen/Component'] ?? ''} ${rec['Display Label'] ?? ''}`.toLowerCase();
  if (text.includes('by agent')) return 'agent';
  if (text.includes('over time') || text.includes('trend') || text.includes('distribution')) return 'time';
  return null;
}

// ---------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------
export function buildRegistry(csvPath = DEFAULT_CSV_PATH) {
  const records = loadCsvRecords(csvPath);
  const chartRecords = records.filter((r) => r['Measure ID'].startsWith('CHART-'));
  const measureRecords = records.filter((r) => !r['Measure ID'].startsWith('CHART-'));

  // 1. Group measure rows into canonical measures by stripped name.
  //
  // Exception: a QA-* (live, per-review/turn-level parameter) row and a
  // RATIO-GAP-* (population-level, unimplemented) row can share the exact
  // same Measure Name by coincidence (9 such pairs exist). The register's
  // own documentation (MASTER_MEASURES_REGISTER.md §7.6/§6, 5th bullet)
  // explicitly says these are "conceptually parallel but operationally
  // separate... never mistaken for the same thing" — so they are kept as
  // two distinct canonical measures here rather than merged by name,
  // overriding the general stripped-name grouping rule for this one case.
  const groupsByName = new Map(); // groupKey -> { rows: [] }
  for (const rec of measureRecords) {
    const stripped = stripParenthetical(rec['Measure Name']);
    const parenMatch = rec['Measure Name'].match(/\(([^)]*)\)\s*$/);
    const qualifier = (parenMatch?.[1] ?? '').toLowerCase();
    const id = rec['Measure ID'];
    const isQaLive = id.startsWith('QA-');
    const isRatioGap = id.startsWith('RATIO-GAP-');
    // CAMP-02 vs CAMP-03 (and any future "(... classification)" pair):
    // per MASTER_MEASURES_REGISTER.md §7.2, "two independently-maintained
    // success definitions for the same target... not interchangeable" —
    // a genuinely different business definition, not a display variant
    // of one disputed definition, so each classification variant gets its
    // own canonical measure rather than being folded into one
    // pending_decision group.
    if (qualifier.includes('classification')) {
      const groupKey = `${stripped}::${qualifier}`;
      if (!groupsByName.has(groupKey)) groupsByName.set(groupKey, { rows: [], displayName: `${stripped} (${qualifier})` });
      groupsByName.get(groupKey).rows.push(rec);
      continue;
    }
    const existingQaGroupKey = `${stripped}::qa-live`;
    const existingRatioGapGroupKey = `${stripped}::ratio-gap`;
    let groupKey = stripped;
    if (isQaLive) groupKey = existingQaGroupKey;
    else if (isRatioGap) {
      // Only split when a QA-live row with the same stripped name exists
      // anywhere in the CSV — otherwise this RATIO-GAP row groups normally
      // (it is simply its own singleton canonical measure, as for the
      // other 16 unimplemented ratios with no live QA counterpart).
      const hasQaSibling = measureRecords.some((r) => r['Measure ID'].startsWith('QA-') && stripParenthetical(r['Measure Name']) === stripped);
      groupKey = hasQaSibling ? existingRatioGapGroupKey : stripped;
    }
    if (!groupsByName.has(groupKey)) groupsByName.set(groupKey, { rows: [], displayName: stripped });
    groupsByName.get(groupKey).rows.push(rec);
  }

  const usedIds = new Set();
  const canonicalMeasures = [];
  const canonicalByName = new Map(); // strippedName -> canonical measure object
  const measures = [];
  const measureDimensions = [];
  const measureBaseFacts = [];
  const occurrenceClassification = [];

  for (const [groupKey, group] of groupsByName) {
    const rows = group.rows;
    const name = groupKey.endsWith('::ratio-gap') ? `${group.displayName} (Population Ratio)` : group.displayName;
    const mock = rows.every(isMockRow) && rows.some(isMockRow);
    const anyMock = rows.some(isMockRow);
    const unimplemented = rows.every(isUnimplementedRow);
    const distinctFormulas = new Set(rows.map((r) => `${r['Code File and Function'] ?? ''}`.trim()).filter(Boolean));
    const liveRows = rows.filter((r) => !isMockRow(r) && !isUnimplementedRow(r));

    let status;
    let measureClass = anyMock ? 'mock_indicator' : 'business_measure';
    if (anyMock) status = 'mock';
    else if (unimplemented) status = 'unimplemented';
    else if (liveRows.length >= 2 && distinctFormulas.size >= 2) status = 'pending_decision';
    else status = 'decided';

    const id = slugToCanonicalId(name, usedIds);
    const businessDefinition = rows[0]['Business Description'] || name;

    // migration reference: prefer a row whose Screen/Component mentions the
    // canonical engine (Ratio Explorer/Dashboard/Analytics) and is a real,
    // live implementation; else the sole live row; else null.
    let migrationRef = null;
    if (liveRows.length > 0) {
      const canonical = liveRows.find((r) => /ratio explorer|dashboard|analytics/i.test(r['Screen/Component'] ?? ''));
      migrationRef = (canonical ?? liveRows[0])['Measure ID'];
    }

    const canonicalMeasure = {
      id, canonical_name: name, business_definition: businessDefinition,
      measure_class: measureClass, governed_algorithm_status: status,
      governed_formula_ref: migrationRef ? `ratioMath.ts#${migrationRef}` : null,
      migration_reference_measure_id: migrationRef,
    };
    canonicalMeasures.push(canonicalMeasure);
    canonicalByName.set(name, canonicalMeasure);

    for (const rec of rows) {
      const rowMock = isMockRow(rec);
      const rowUnimpl = isUnimplementedRow(rec);
      const measureStatus = mapMeasureStatus(rec, { mock: rowMock, unimplemented: rowUnimpl });
      const measure = {
        id: rec['Measure ID'],
        canonical_measure_id: id,
        formula_ref: `${nonEmpty(rec['Code File and Function'])}`,
        eligible_population: nonEmpty(rec['Eligible Population']),
        numerator: nonEmpty(rec.Numerator),
        denominator: nonEmpty(rec.Denominator),
        zero_denominator_handling: nonEmpty(rec['Zero Denominator Handling']),
        aggregation_method: nonEmpty(rec['Aggregation Method']),
        depends_on_measures: null,
        status: measureStatus,
      };
      measures.push(measure);

      for (const dim of findDimensionsForRow(rec)) {
        measureDimensions.push({ measure_id: measure.id, dimension_id: dim });
      }
      for (const bf of findBaseFactsForRow(rec)) {
        measureBaseFacts.push({ measure_id: measure.id, base_fact_id: bf.base_fact_id, role: bf.role });
      }

      let classification;
      if (rowMock) classification = 'not_yet_implemented_or_mock';
      else if (rowUnimpl) classification = 'not_yet_implemented_or_mock';
      else if (status === 'pending_decision') classification = 'pending_business_definition_decision';
      else classification = 'mapped_to_canonical_measure';
      occurrenceClassification.push({ measure_id: measure.id, canonical_measure_id: id, classification });
    }
  }

  // 2. Chart visualizations.
  const chartVisualizations = [];
  const flaggedCharts = [];
  for (const rec of chartRecords) {
    const target = resolveChartTarget(rec, canonicalByName);
    if (!target) { flaggedCharts.push(rec['Measure ID']); continue; }
    chartVisualizations.push({
      id: rec['Measure ID'],
      chart_name: rec['Measure Name'],
      visualizes_canonical_measure_id: target.visualizes_canonical_measure_id ?? null,
      visualizes_base_fact_id: target.visualizes_base_fact_id ?? null,
      presentation_dimension_id: resolvePresentationDimension(rec),
    });
    occurrenceClassification.push({ measure_id: rec['Measure ID'], canonical_measure_id: null, classification: 'visualization_only' });
  }
  for (const chartId of flaggedCharts) {
    occurrenceClassification.push({ measure_id: chartId, canonical_measure_id: null, classification: 'visualization_only_unresolved_target' });
  }

  // dedupe measureBaseFacts / measureDimensions (primary key dedupe)
  const dedupeBaseFacts = dedupeBy(measureBaseFacts, (r) => `${r.measure_id}::${r.base_fact_id}::${r.role}`);
  const dedupeDims = dedupeBy(measureDimensions, (r) => `${r.measure_id}::${r.dimension_id}`);

  return {
    baseFacts: BASE_FACTS,
    dimensions: DIMENSIONS,
    canonicalMeasures,
    measures,
    measureDimensions: dedupeDims,
    measureBaseFacts: dedupeBaseFacts,
    chartVisualizations,
    flaggedCharts,
    occurrenceClassification,
    totalRegisterRows: records.length,
  };
}

function dedupeBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function coverageReport(registry) {
  const byClass = {};
  for (const o of registry.occurrenceClassification) {
    byClass[o.classification] = (byClass[o.classification] ?? 0) + 1;
  }
  const byStatus = {};
  for (const cm of registry.canonicalMeasures) {
    byStatus[cm.governed_algorithm_status] = (byStatus[cm.governed_algorithm_status] ?? 0) + 1;
  }
  return {
    totalRegisterRows: registry.totalRegisterRows,
    canonicalMeasuresRegistered: registry.canonicalMeasures.length,
    measureOccurrencesRegistered: registry.measures.length,
    chartVisualizationsRegistered: registry.chartVisualizations.length,
    chartsFlaggedUnresolved: registry.flaggedCharts,
    canonicalMeasuresByStatus: byStatus,
    occurrencesByClassification: byClass,
    dimensionsRegistered: registry.dimensions.length,
    baseFactsRegistered: registry.baseFacts.length,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('cma-registry-build.mjs')) {
  const registry = buildRegistry();
  console.log(JSON.stringify(coverageReport(registry), null, 2));
}
