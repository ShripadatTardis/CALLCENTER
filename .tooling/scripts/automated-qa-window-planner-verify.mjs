// Session 16.3 — bounded context-window planner, against the REAL
// compiled src/lib/automatedQaWindowPlanner.ts (via esbuild, not a
// reimplementation).
import { planQaTurnWindows, estimateTokens } from '../tmp/automatedQaWindowPlanner.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function turn(id, text) {
  return { turnId: id, role: 'agent', speakerLabel: 'AI', timestamp: '2026-10-07T10:00:00Z', text };
}

assert('empty turns -> no windows', planQaTurnWindows([], 1000), []);

const shortTurns = [turn('t1', 'Hello'), turn('t2', 'How can I help?')];
const oneWindow = planQaTurnWindows(shortTurns, 1000);
assert('short conversation fits in one window', oneWindow.length, 1);
assert('one window covers both turns', oneWindow[0].turns.length, 2);

const longText = 'x'.repeat(400); // ~100 tokens per turn
const manyTurns = Array.from({ length: 10 }, (_, i) => turn(`t${i}`, longText));
const budget = 250; // forces a split well before all 10 turns fit
const windows = planQaTurnWindows(manyTurns, budget);
assert('long conversation splits into more than one window', windows.length > 1, true);

const allTurnIdsAcrossWindows = windows.flatMap((w) => w.turns.map((t) => t.turnId));
assert('every turn appears across windows exactly once (no double-count, no drop)', new Set(allTurnIdsAcrossWindows).size, manyTurns.length);
assert('windows cover every turn (union equals input)', allTurnIdsAcrossWindows.length, manyTurns.length);

// Non-overlapping, order-preserving: windows concatenated must equal original order.
const reconstructed = allTurnIdsAcrossWindows.join(',');
const original = manyTurns.map((t) => t.turnId).join(',');
assert('windows preserve original turn order (sequential, non-overlapping)', reconstructed, original);

const indices = windows.map((w) => w.index);
assert('window indices are sequential from 0', indices, windows.map((_, i) => i));

// A single turn that alone exceeds the budget still gets its own window (best effort).
const hugeTurn = [turn('huge', 'y'.repeat(4000))];
const hugeWindows = planQaTurnWindows(hugeTurn, 100);
assert('a turn larger than the whole budget still gets its own window, not dropped', hugeWindows.length, 1);
assert('the oversized window still contains the turn', hugeWindows[0].turns.length, 1);

assert('estimateTokens is roughly length/4 (cheap heuristic, not a real tokenizer)', estimateTokens('abcd'), 1);
assert('estimateTokens rounds up for partial tokens', estimateTokens('abcde'), 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
