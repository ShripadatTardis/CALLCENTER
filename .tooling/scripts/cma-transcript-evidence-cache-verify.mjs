// Session 7 Part C — deterministic coverage of the real compiled
// cmaTranscriptEvidenceCache.ts (via esbuild, never a reimplementation).
// All deps (readCache/writeCache/fetchLive) are in-memory mocks — no
// real Supabase client or network call anywhere in this file.

import {
  computeTranscriptContentHash,
  isCacheFresh,
  getOrFetchTranscriptEvidence,
} from '../tmp/cmaTranscriptEvidenceCache.mjs';

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

function makeTurns(n, seed = 'a') {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: `2026-06-01T00:00:0${i}Z`,
    speaker: i % 2 === 0 ? 'customer' : 'agent',
    text: `${seed}-turn-${i}`,
  }));
}

function makeStore() {
  const rows = new Map();
  const key = (id, type) => `${id}:${type}`;
  let writeCalls = 0;
  let readCalls = 0;
  return {
    writeCalls: () => writeCalls,
    readCalls: () => readCalls,
    readCache: async (id, type) => {
      readCalls++;
      return rows.get(key(id, type)) ?? null;
    },
    writeCache: async (entry) => {
      writeCalls++;
      const existing = rows.get(key(entry.interactionId, entry.interactionType));
      const version = existing && existing.contentHash === entry.contentHash ? existing.version : (existing?.version ?? 0) + 1;
      rows.set(key(entry.interactionId, entry.interactionType), { ...entry, version, fetchedAt: new Date().toISOString() });
    },
    seed: (id, type, row) => rows.set(key(id, type), row),
  };
}

// 1. content hash: identical turns -> identical hash; any change -> different hash.
{
  const t1 = makeTurns(3);
  const t2 = makeTurns(3);
  assert('identical turn lists hash identically', computeTranscriptContentHash(t1), computeTranscriptContentHash(t2));
  const t3 = makeTurns(3, 'b');
  assertTrue('a changed turn text changes the hash', computeTranscriptContentHash(t1) !== computeTranscriptContentHash(t3));
  const t4 = makeTurns(4);
  assertTrue('a different turn count changes the hash', computeTranscriptContentHash(t1) !== computeTranscriptContentHash(t4));
}

// 2. isCacheFresh: pure TTL boundary.
{
  const now = new Date('2026-06-02T00:00:00Z');
  assertTrue('fetched 1h ago, 24h ttl -> fresh', isCacheFresh('2026-06-01T23:00:00Z', now, 24 * 60 * 60 * 1000));
  assertTrue('fetched 25h ago, 24h ttl -> stale', !isCacheFresh('2026-06-01T00:00:00Z', now, 24 * 60 * 60 * 1000));
}

// 3. Cache miss -> fetches live, writes cache once, returns fetched turns.
{
  const store = makeStore();
  const turns = makeTurns(2);
  const result = await getOrFetchTranscriptEvidence('call-1', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => turns,
  });
  assert('cache miss: returns the live-fetched turns', result.turns, turns);
  assert('cache miss: fetchStatus is available for non-empty turns', result.fetchStatus, 'available');
  assertTrue('cache miss: fromCache is false', result.fromCache === false);
  assertTrue('cache miss: writeCache was called exactly once', store.writeCalls() === 1);
}

// 4. Fresh cache hit -> never calls fetchLive.
{
  const store = makeStore();
  const turns = makeTurns(2);
  store.seed('call-2', 'call', {
    interactionId: 'call-2', interactionType: 'call', source: 'voiceforce_api',
    contentHash: computeTranscriptContentHash(turns), turns, turnCount: 2,
    fetchStatus: 'available', version: 1, fetchedAt: new Date().toISOString(),
  });
  let fetchCalled = false;
  const result = await getOrFetchTranscriptEvidence('call-2', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => { fetchCalled = true; return []; },
  });
  assertTrue('fresh cache hit: fetchLive is never called', !fetchCalled);
  assertTrue('fresh cache hit: fromCache is true', result.fromCache === true);
  assert('fresh cache hit: returns the cached turns unchanged', result.turns, turns);
  assertTrue('fresh cache hit: writeCache is never called', store.writeCalls() === 0);
}

// 5. Stale cache -> refetches live and refreshes the cache.
{
  const store = makeStore();
  const oldTurns = makeTurns(2, 'old');
  const staleTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago, > 24h TTL
  store.seed('call-3', 'call', {
    interactionId: 'call-3', interactionType: 'call', source: 'voiceforce_api',
    contentHash: computeTranscriptContentHash(oldTurns), turns: oldTurns, turnCount: 2,
    fetchStatus: 'available', version: 1, fetchedAt: staleTimestamp,
  });
  const newTurns = makeTurns(3, 'new');
  const result = await getOrFetchTranscriptEvidence('call-3', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => newTurns,
  });
  assertTrue('stale cache: refetches live rather than returning the stale turns', result.fromCache === false);
  assert('stale cache: returns the freshly fetched turns', result.turns, newTurns);
  assertTrue('stale cache: writeCache was called to refresh the row', store.writeCalls() === 1);
}

// 6. Live fetch throws (404/network) -> recorded as 'unavailable', never silently treated as resolved/empty-success.
{
  const store = makeStore();
  const result = await getOrFetchTranscriptEvidence('call-4', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => { throw new Error('HTTP 404'); },
  });
  assert('live fetch failure -> fetchStatus unavailable', result.fetchStatus, 'unavailable');
  assert('live fetch failure -> no turns fabricated', result.turns, []);
}

// 7. Live fetch succeeds but returns zero turns -> 'incomplete', distinct from a hard failure.
{
  const store = makeStore();
  const result = await getOrFetchTranscriptEvidence('call-5', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => [],
  });
  assert('zero turns (but no error) -> fetchStatus incomplete, not unavailable', result.fetchStatus, 'incomplete');
}

// 8. A cached 'unavailable' result is itself a cache hit within the TTL — avoids hammering a repeatedly-404ing endpoint.
{
  const store = makeStore();
  store.seed('call-6', 'call', {
    interactionId: 'call-6', interactionType: 'call', source: 'voiceforce_api',
    contentHash: computeTranscriptContentHash([]), turns: [], turnCount: 0,
    fetchStatus: 'unavailable', version: 1, fetchedAt: new Date().toISOString(),
  });
  let fetchCalled = false;
  const result = await getOrFetchTranscriptEvidence('call-6', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => { fetchCalled = true; return []; },
  });
  assertTrue('a fresh cached "unavailable" result is a cache hit too, no refetch', !fetchCalled);
  assert('cached unavailable status is preserved', result.fetchStatus, 'unavailable');
}

// 9. Idempotency across repeated identical fetches: re-running the same fetch (after forcing expiry) does not change the content hash.
{
  const store = makeStore();
  const turns = makeTurns(2);
  const staleTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  store.seed('call-7', 'call', {
    interactionId: 'call-7', interactionType: 'call', source: 'voiceforce_api',
    contentHash: computeTranscriptContentHash(turns), turns, turnCount: 2,
    fetchStatus: 'available', version: 1, fetchedAt: staleTimestamp,
  });
  const result = await getOrFetchTranscriptEvidence('call-7', 'call', {
    readCache: store.readCache,
    writeCache: store.writeCache,
    fetchLive: async () => turns, // same content again
  });
  assert('re-fetching byte-identical turns produces the same content hash', result.contentHash, computeTranscriptContentHash(turns));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
