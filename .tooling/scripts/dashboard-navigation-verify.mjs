import {
  DASHBOARD_PERFORMANCE_RATIO_IDS,
  DASHBOARD_AHT_RATIO_ID,
  buildDashboardRatioLink,
  buildDashboardAgentDetailLink,
  buildDashboardLiveViewLink,
} from '../tmp/dashboardNavigation.mjs';
import { resolveDetailOrigin, AGENT_DETAIL_FALLBACK_ORIGIN } from '../tmp/detailOrigin.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// Dashboard -> ratio ID deep-link uses the stable ratio ID, never display text.
assert('buildDashboardRatioLink uses stable ratio id in path', buildDashboardRatioLink('fcr'), {
  path: '/ratios/fcr',
  state: { origin: 'dashboard' },
});
assert('buildDashboardRatioLink never derives path from a label-like string', buildDashboardRatioLink('escalation_rate').path, '/ratios/escalation_rate');

assert('buildDashboardAgentDetailLink', buildDashboardAgentDetailLink('agent-123'), {
  path: '/ai-agents/agent-123',
  state: { origin: 'dashboard' },
});

assert('buildDashboardLiveViewLink', buildDashboardLiveViewLink(), {
  path: '/live-view',
  state: { origin: 'dashboard' },
});

// Performance Ratios set — exactly the 5 confirmed `direct` ratios minus AHT (shown once, in Live Operations).
assert('DASHBOARD_PERFORMANCE_RATIO_IDS is the confirmed 5-ratio set', DASHBOARD_PERFORMANCE_RATIO_IDS, [
  'fcr',
  'escalation_rate',
  'resolution_rate',
  'successful_resolution_time',
  'authentication_success_rate',
]);
assert('AHT is not duplicated into Performance Ratios', DASHBOARD_PERFORMANCE_RATIO_IDS.includes(DASHBOARD_AHT_RATIO_ID), false);
assert('DASHBOARD_AHT_RATIO_ID is the real aht ratio id', DASHBOARD_AHT_RATIO_ID, 'aht');

// detailOrigin.ts's existing mechanism — Dashboard-origin resolution + safe fallback.
assert('resolveDetailOrigin resolves dashboard origin', resolveDetailOrigin('dashboard'), { path: '/dashboard', label: 'Dashboard' });
assert('resolveDetailOrigin resolves ai-agents origin', resolveDetailOrigin('ai-agents'), { path: '/ai-agents', label: 'AI Agents' });
assert('resolveDetailOrigin resolves chat-logs origin', resolveDetailOrigin('chat-logs'), { path: '/chat-logs', label: 'Chat Logs' });
assert(
  'resolveDetailOrigin falls back safely on invalid origin',
  resolveDetailOrigin('not-a-real-origin'),
  { path: '/ai-agents', label: 'AI Agents' },
);
assert('resolveDetailOrigin falls back safely on missing origin', resolveDetailOrigin(undefined), { path: '/ai-agents', label: 'AI Agents' });
assert(
  'resolveDetailOrigin honors a custom fallback override',
  resolveDetailOrigin(undefined, 'dashboard'),
  { path: '/dashboard', label: 'Dashboard' },
);
assert('AGENT_DETAIL_FALLBACK_ORIGIN is ai-agents', AGENT_DETAIL_FALLBACK_ORIGIN, 'ai-agents');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
