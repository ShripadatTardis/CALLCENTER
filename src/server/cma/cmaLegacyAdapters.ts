// Session 10 — CMA_LEGACY_ADAPTER resolvers: normalize an existing
// upstream/legacy calculation through CMA's response shape, without
// reimplementing it. Each function here wraps a REAL existing source —
// never a new formula.

import type { EvaluationScopeAccess } from './cmaEvaluation.js';
import type { CmaMeasureValue } from './cmaEvaluationTypes.js';

/** Reads VOICEBOT_BASE_URL/VOICEBOT_API_KEY directly rather than importing
 *  api/_voicebot.ts's getBackendConfig() — src/server must not depend on
 *  api/ (the reverse dependency direction every other src/server/cma
 *  module already follows; see cmaEvaluation.ts's own header comment). */
function readBackendConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  return { baseUrl, apiKey };
}

/**
 * CANON-AVG-INTENT-ACC — wraps GET /api/v1/analytics/metrics'
 * avg_intent_accuracy field. That endpoint has a documented, pre-
 * existing gap: it enforces no Agent Scope at all (see the header
 * comment on api/analytics/metrics.ts, Session 14.3). This adapter does
 * not fix that gap — fixing the query layer itself is out of this
 * session's proportion, same reasoning Session 14.3 already recorded —
 * but it does not let a scoped caller silently receive an unscoped
 * global number through a NEW CMA-badged path either: only a caller
 * with unrestricted Agent Scope (every real provisioned role today, per
 * that same comment) gets the real value; a scoped caller gets an
 * honest unavailable result instead.
 */
export async function resolveAvgIntentAccuracy(
  access: EvaluationScopeAccess,
  window: { from: string; to: string },
): Promise<CmaMeasureValue & { dataQualityWarning?: string }> {
  if (!(access.allCategories || access.authorizedAgentIds === 'all')) {
    return {
      kind: 'unsupported',
      reason: 'The upstream VoiceForce analytics endpoint this measure is sourced from does not support Agent-Scope-restricted queries (a documented, pre-existing gap — see api/analytics/metrics.ts). Only unrestricted viewers can see this legacy-adapted value.',
    };
  }
  try {
    const { baseUrl, apiKey } = readBackendConfig();
    // The upstream endpoint expects date-only (YYYY-MM-DD), not a full ISO timestamp —
    // confirmed by a live 400 response when the full CMA window string was sent as-is.
    const search = new URLSearchParams({ date_from: window.from.slice(0, 10), date_to: window.to.slice(0, 10) }).toString();
    const response = await fetch(`${baseUrl}/api/v1/analytics/metrics?${search}`, { headers: { 'X-API-Key': apiKey } });
    if (!response.ok) {
      return { kind: 'unsupported', reason: `Upstream analytics endpoint returned ${response.status}.` };
    }
    const body = (await response.json()) as { metrics?: { avg_intent_accuracy?: number } };
    const raw = body.metrics?.avg_intent_accuracy;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { kind: 'zero_denominator', displayAs: 'null' };
    }
    return { kind: 'value', value: Math.round(raw * 10) / 10, unit: 'percent' };
  } catch (err) {
    return { kind: 'unsupported', reason: err instanceof Error ? err.message : 'Upstream analytics fetch failed.' };
  }
}
