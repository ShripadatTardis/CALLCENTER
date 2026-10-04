import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, readReqQuery, withErrorBoundary } from '../_voicebot.js';
import { resolveAccessForAuthenticatedUser } from '../_auth.js';

/**
 * GET /api/calls/data -> GET {VOICEBOT_BASE_URL}/api/v1/call-data
 *
 * Passes through pagination/filter query params as-is (status,
 * direction, outcome, date_from, date_to, search, min_duration,
 * max_duration, page, page_size) — no renaming at this layer; renaming
 * happens in the frontend mapper (src/services/calls/callsMapper.ts).
 *
 * Session 6.2: applies the SAME category/role authorization already
 * proven in Customer 360, now derived from the verified authenticated
 * user (resolveAccessForAuthenticatedUser, Session 14.3 — replaces the
 * advisory x-user-role header this route used before) —
 * rows whose ai_agent_id/agent_id isn't in the caller's authorized set
 * are removed server-side before the response leaves this route. This
 * closes the gap audited in docs/CALL_CENTRE_SESSION6_2_INTERACTION_CLASSIFICATION_PLAN.md
 * §5 (Call Logs previously had zero category enforcement, server- or
 * client-side). `summary` is recomputed over the filtered rows only and
 * flagged `scoped: true` so the frontend never presents a filtered
 * page's arithmetic as a true global total — the backend has no
 * authorized-aggregate endpoint for call-data, only per-row filtering,
 * so a scoped summary is honestly page-scoped, not global (plan §17).
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const { baseUrl } = getBackendConfig();
  const query = readReqQuery(req);
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/call-data${search ? `?${search}` : ''}`;

  // Session 14.3 — Agent Scope, from the verified authenticated user.
  const access = await resolveAccessForAuthenticatedUser(req, 'agent');

  await proxyRequest(res, url, { method: 'GET' }, (status, body) => {
    if (access.allCategories || access.authorizedAgentIds === 'all' || status !== 200 || typeof body !== 'object' || body === null) {
      return { status, body };
    }
    const b = body as { success?: boolean; data?: { calls?: Array<Record<string, unknown>>; summary?: Record<string, unknown>; pagination?: Record<string, unknown> } };
    if (!b.data?.calls) return { status, body };

    const authorized = new Set(access.authorizedAgentIds);
    const calls = b.data.calls.filter((c) => {
      const agentId = (c.ai_agent_id as string | undefined) || (c.agent_id as string | undefined) || null;
      return agentId !== null && authorized.has(agentId);
    });

    const resolvedCount = calls.filter((c) => c.outcome === 'resolved').length;
    const escalatedCount = calls.filter((c) => c.outcome === 'escalated').length;
    const totalCalls = calls.length;
    const durations = calls.map((c) => Number(c.duration_seconds ?? c.aht_seconds ?? 0)).filter((n) => Number.isFinite(n));
    const intentAccuracies = calls.map((c) => Number(c.intent_accuracy)).filter((n) => Number.isFinite(n));
    const avg = (nums: number[]) => (nums.length ? nums.reduce((a, n) => a + n, 0) / nums.length : 0);

    const scopedSummary = {
      ...(b.data.summary ?? {}),
      total_calls: totalCalls,
      resolved_count: resolvedCount,
      escalated_count: escalatedCount,
      fcr_rate: totalCalls ? (calls.filter((c) => c.fcr === true).length / totalCalls) * 100 : 0,
      escalation_rate: totalCalls ? (escalatedCount / totalCalls) * 100 : 0,
      avg_aht_seconds: Math.round(avg(durations)),
      avg_intent_accuracy: avg(intentAccuracies),
      scoped: true,
    };

    return {
      status,
      body: { ...b, data: { ...b.data, calls, summary: scopedSummary, pagination: b.data.pagination } },
    };
  });
});
