import type { DetailNavigationState } from './detailOrigin';

/**
 * Dashboard Information Architecture session — the one place Dashboard's
 * outbound navigation is defined, so every drill-in link (Performance
 * Ratios, Live Operations' AHT, Agent Load) is built the same way rather
 * than each call site hand-assembling a path + state object. Reuses
 * `src/lib/detailOrigin.ts`'s existing navigation-state mechanism
 * (already established for Agent/Customer/Campaign Detail) — this is not
 * a second/competing navigation-context system.
 */
export const DASHBOARD_ORIGIN_STATE: DetailNavigationState = { origin: 'dashboard' };

/** A ratio deep-link always uses the real, stable ratio ID from the registry — never display text, never a generic /ratios landing. */
export function buildDashboardRatioLink(ratioId: string): { path: string; state: DetailNavigationState } {
  return { path: `/ratios/${ratioId}`, state: DASHBOARD_ORIGIN_STATE };
}

export function buildDashboardAgentDetailLink(agentId: string): { path: string; state: DetailNavigationState } {
  return { path: `/ai-agents/${agentId}`, state: DASHBOARD_ORIGIN_STATE };
}

export function buildDashboardLiveViewLink(): { path: string; state: DetailNavigationState } {
  return { path: '/live-view', state: DASHBOARD_ORIGIN_STATE };
}

/**
 * The compact "Performance Ratios" set (§4/§22 of the Dashboard IA
 * brief) — only genuinely `direct` ratios per the live registry
 * (confirmed against src/server/analytics/ratioRegistry.ts /
 * src/server/analytics/ratioService.ts's IMPLEMENTED_RATIOS before
 * writing this list — these 5 plus `aht` are the complete direct set),
 * explicitly excluding AHT (shown once, in Live Operations, per §22's
 * "do not show the same metric prominently twice") and excluding every
 * partial/backend_gap/awaiting_telemetry ratio (never surfaced here as
 * if it were a live KPI). Deliberately just IDs, not a second
 * label/name list — each card resolves its own display name from
 * `getFrontendRatioDefinition(ratioId)` (the same registry Ratio
 * Explorer itself reads), so there is exactly one place a ratio's name
 * is spelled out, not two that could drift apart.
 */
export const DASHBOARD_PERFORMANCE_RATIO_IDS: string[] = [
  'fcr',
  'escalation_rate',
  'resolution_rate',
  'successful_resolution_time',
  'authentication_success_rate',
];

/** Live Operations' "Avg Handle Time" tile is the SAME aht ratio Ratio Explorer computes — one semantic source, not a second Dashboard-local calculation (§5). */
export const DASHBOARD_AHT_RATIO_ID = 'aht';
