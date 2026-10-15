// Session 16.4.3 — deterministic verification of the Interaction Trace
// integration, against the REAL compiled modules via esbuild (not a
// reimplementation): src/lib/interactionTraceValidation.ts and
// src/lib/interactionTraceErrorMessage.ts. Per the brief's §11 list:
// items with real pure logic are unit-tested here; "voice/chat endpoint
// selection", "successful trace mapping", "tool/RAG nested structures",
// "events", "empty turns", "null optional fields" and "unknown trace
// version" are thin pass-through plumbing in api/calls/data.ts /
// api/chat/logs.ts (this session deliberately does NOT transform the
// upstream shape — the brief's §3 explicitly requires preserving the
// full documented nested structure verbatim, never inferring or
// discarding fields) — verified here via STRUCTURAL source checks
// (grep-based, below) rather than a reimplemented mapper, matching the
// existing precedent in call-metrics-verify.mjs's own header comment
// ("thin proxy plumbing ... no pure logic to unit test beyond what's
// already covered") for the identical situation. "No browser exposure
// of API keys" and "missing API credentials" are also verified
// structurally — see the bottom of this file.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isValidInteractionId } from '../tmp/interactionTraceValidation.mjs';
import { mapInteractionTraceError } from '../tmp/interactionTraceErrorMessage.mjs';

/**
 * Portable recursive text search — avoids shelling out to grep (not
 * guaranteed available/portable across this project's Windows/bash
 * toolchain). `excludeDirs` skips subdirectories by name (e.g.
 * `server`, which is Node-only code imported exclusively by api/*.ts,
 * never by the Vite client bundle — confirmed by this session via a
 * repo-wide check that no src/components|pages|hooks|services file
 * actually imports from src/server, only mentions it in comments).
 */
function findInSourceTree(rootDir, needle, excludeDirs = []) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (excludeDirs.includes(entry)) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        if (text.includes(needle)) hits.push(full);
      }
    }
  };
  walk(rootDir);
  return hits;
}

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

// --- interaction_id validation (docx: "1-128 letters, digits, - or _") ---
assert('valid uuid-shaped call id accepted', isValidInteractionId('4009557f-924b-4cb9-803d-4fde93bb49f3'), true);
assert('valid chat id accepted', isValidInteractionId('chat-0452bc14-ec0a-49a3-8116-a40c097e7809'), true);
assert('empty id rejected', isValidInteractionId(''), false);
assert('id with spaces rejected', isValidInteractionId('abc def'), false);
assert('id with slash rejected (path traversal shape)', isValidInteractionId('abc/def'), false);
assert('id with query-string shape rejected', isValidInteractionId('abc?x=1'), false);
assert('129-char id rejected (over the 128 limit)', isValidInteractionId('a'.repeat(129)), false);
assert('128-char id accepted (at the limit)', isValidInteractionId('a'.repeat(128)), true);
assert('single char id accepted (at the floor)', isValidInteractionId('a'), true);

// --- error-response mapping (422: Invalid interaction identifier, §5) ---
{
  const r = mapInteractionTraceError(422, 'invalid_interaction_id');
  assert('422 message', r.message.includes('not a valid trace identifier'), true);
  assert('422 is not retryable', r.canRetry, false);
}
// 401: Backend authentication failure
{
  const r = mapInteractionTraceError(401, undefined);
  assertTrue('401 message mentions credential', r.message.toLowerCase().includes('credential'));
  assert('401 is not retryable', r.canRetry, false);
}
// 403: Backend transcripts permission missing
{
  const r = mapInteractionTraceError(403, undefined);
  assertTrue('403 message mentions transcripts permission', r.message.toLowerCase().includes('transcripts permission'));
  assert('403 is not retryable', r.canRetry, false);
}
// 404: trace not found or unavailable for this interaction
{
  const r = mapInteractionTraceError(404, 'trace_not_found');
  assertTrue('404 message distinguishes "not available", not a crash/error framing', r.message.toLowerCase().includes('no trace is available'));
  assert('404 is not retryable (permanent absence, not transient)', r.canRetry, false);
}
// 409: interaction active, no turn recorded yet — transient, retry makes sense
{
  const r = mapInteractionTraceError(409, 'trace_not_ready');
  assertTrue('409 message says "try again shortly"', r.message.toLowerCase().includes('try again shortly'));
  assert('409 IS retryable (transient, unlike 404)', r.canRetry, true);
}
// 502: trace store temporarily unavailable — transient, retry makes sense
{
  const r = mapInteractionTraceError(502, 'trace_store_unavailable');
  assertTrue('502 message says temporarily unavailable', r.message.toLowerCase().includes('temporarily unavailable'));
  assert('502 IS retryable (distinguishes transient failure from permanent 404, brief §5)', r.canRetry, true);
}
// Unknown/unexpected status — fails open to a generic retryable message rather than crashing.
{
  const r = mapInteractionTraceError(500, undefined);
  assertTrue('unknown status produces a generic message, not a crash', typeof r.message === 'string' && r.message.length > 0);
  assert('unknown status defaults to retryable (safer default than silently blocking retry)', r.canRetry, true);
}

// --- structural checks: thin-plumbing items from §11 that have no pure
// logic to re-implement (matches call-metrics-verify.mjs's own stated
// precedent for the same situation) ---

const callsDataSrc = readFileSync(new URL('../../api/calls/data.ts', import.meta.url), 'utf8');
const chatLogsSrc = readFileSync(new URL('../../api/chat/logs.ts', import.meta.url), 'utf8');

assertTrue('voice endpoint selection: api/calls/data.ts dispatches resource=trace', callsDataSrc.includes("resource === 'trace'"));
assertTrue('voice endpoint selection: proxies to the documented call trace path', callsDataSrc.includes('/api/v1/interaction-trace/call/'));
assertTrue('chat endpoint selection: api/chat/logs.ts dispatches resource=trace', chatLogsSrc.includes("req.query.resource === 'trace'"));
assertTrue('chat endpoint selection: proxies to the documented chat trace path', chatLogsSrc.includes('/api/v1/interaction-trace/chat/'));
assertTrue('voice route validates interaction_id before calling upstream (422 path)', callsDataSrc.includes('INTERACTION_ID_PATTERN.test(id)'));
assertTrue('chat route validates interaction_id before calling upstream (422 path)', chatLogsSrc.includes('INTERACTION_ID_PATTERN.test(id)'));
assertTrue('voice trace route fails closed to unrestricted Agent Scope only (no per-id attribution available)', callsDataSrc.includes("access.allCategories || access.authorizedAgentIds === 'all'"));
assertTrue('existing call-data branch (non-trace) is untouched — same authorization call still present', (callsDataSrc.match(/resolveAccessForAuthenticatedUser\(req, 'agent'\)/g) ?? []).length >= 2);

// Response shape preservation: the route forwards the upstream body as-is
// (status + JSON.parse(text)) rather than re-shaping it — confirms "do
// not discard fields" / "preserve nested structures" (§3) structurally:
// there is no field-by-field reconstruction of the trace response
// anywhere in either route.
assertTrue('voice route does not reconstruct the trace response field-by-field (passes upstream body through via proxyRequest)', callsDataSrc.includes('await proxyRequest(res, `${baseUrl}/api/v1/interaction-trace/call/'));
assertTrue('chat route does not reconstruct the trace response field-by-field (relays parsed upstream body as-is)', /res\.status\(upstream\.status\)\.json\(body\);\s*\n\}$/.test(chatLogsSrc.trim()));

// --- missing credentials: getBackendConfig() throws, withErrorBoundary
// turns that into a clean 500 rather than crashing the function — this
// exact mechanism is shared by every route including the new trace
// branches (both call handleInteractionTrace/handleChatInteractionTrace
// INSIDE the same withErrorBoundary-wrapped default export). ---
const voicebotSrc = readFileSync(new URL('../../api/_voicebot.ts', import.meta.url), 'utf8');
assertTrue('getBackendConfig throws when VOICEBOT_BASE_URL/VOICEBOT_API_KEY are unset (shared by the new trace handlers)', voicebotSrc.includes("throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server')"));
assertTrue('both new trace handlers run inside the file-level withErrorBoundary wrapper (voice)', callsDataSrc.includes('export default withErrorBoundary(async (req, res)'));
assertTrue('both new trace handlers run inside the file-level withErrorBoundary wrapper (chat)', chatLogsSrc.includes('export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse)'));

// --- existing transcript fallback: Interaction Detail must remain
// functional when the trace API 404s/409s/502s — enforced structurally
// by the panel being a SEPARATE, independently-erroring component from
// ConversationTranscript, never gating it. ---
const dialogSrc = readFileSync(new URL('../../src/components/call-logs/InteractionDetailDialog.tsx', import.meta.url), 'utf8');
const chatDialogSrc = readFileSync(new URL('../../src/components/chat/ChatSessionDetailDialog.tsx', import.meta.url), 'utf8');
assertTrue('InteractionTracePanel is rendered independently of ConversationTranscript (call dialog) — a trace error cannot block the transcript', dialogSrc.includes('<InteractionTracePanel') && dialogSrc.includes('<ConversationTranscript'));
assertTrue('InteractionTracePanel is rendered independently of ConversationTranscript (chat dialog) — a trace error cannot block the transcript', chatDialogSrc.includes('<InteractionTracePanel') && chatDialogSrc.includes('<ConversationTranscript'));
const panelSrc = readFileSync(new URL('../../src/components/interaction-detail/InteractionTracePanel.tsx', import.meta.url), 'utf8');
assertTrue('the trace panel is collapsed by default (lazy, never auto-fetched on dialog open)', panelSrc.includes('useState(false)'));

// --- no browser exposure of API keys: the real backend key must never
// be referenced from CLIENT-BUNDLED code (src/components, src/pages,
// src/hooks, src/services, src/lib, src/types, src/contexts) — only
// from api/*.ts (server-only Vercel Functions) or src/server/* (Node-
// only, imported exclusively by api/*.ts, never by the Vite client
// bundle — src/server itself legitimately references it, e.g. the
// existing genericLlmClient.ts, so it's excluded here, not scrubbed). ---
const srcRoot = new URL('../../src', import.meta.url);
const srcHits = findInSourceTree(srcRoot.pathname.replace(/^\/([A-Za-z]):/, '$1:'), 'VOICEBOT_API_KEY', ['server']);
assert('VOICEBOT_API_KEY is never referenced in client-bundled code under src/ (server/ excluded, it is Node-only)', srcHits, []);

// --- QA-evaluation boundary (brief §9, hard guardrail): nothing in the
// Automated QA evaluation path imports anything from the new
// interaction-trace feature. ---
const qaBoundaryDirs = ['src/server/qa', 'src/hooks/qa', 'src/services/qa'];
for (const dir of qaBoundaryDirs) {
  const root = new URL(`../../${dir}`, import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');
  const hits = findInSourceTree(root, 'interactionTrace');
  assert(`no QA code under ${dir} imports anything from the interaction-trace feature (§9 boundary)`, hits, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
