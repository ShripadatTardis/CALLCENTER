import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, noStore, proxyRequest, readReqQuery, withErrorBoundary } from '../_voicebot.js';
import { resolveAccessForAuthenticatedUser } from '../_auth.js';
import type { CallDataEntryDto, CallDataResponseDto } from '../../src/types/api/calls.js';
import type { CallMetricsResponseDto } from '../../src/types/api/callMetrics.js';
import { filterCallMetricsRowsByAuthorizedAgents } from '../../src/lib/callMetricsCorrelation.js';

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
 *
 * Session 15.4 — `?resource=metrics` dispatches the new Call Metrics
 * integration (GET {VOICEBOT_BASE_URL}/api/v1/analytics/call-metrics)
 * from this SAME file rather than a new top-level route, to stay within
 * the Vercel Hobby-plan 12-serverless-function ceiling this project is
 * already at (confirmed via `find api -name "*.ts" -not -name "_*"`) —
 * same established dispatch-via-existing-file convention api/admin.ts
 * and api/campaigns.ts already use. See handleCallMetrics below.
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  if (readReqQuery(req).resource === 'metrics') {
    await handleCallMetrics(req, res);
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

/**
 * GET /api/calls/data?resource=metrics -> GET {VOICEBOT_BASE_URL}/api/v1/analytics/call-metrics
 *
 * Passes through every documented query param as-is (date_from, date_to,
 * direction, search, sort, sort_dir, page, page_size; `resource` itself
 * is stripped before forwarding).
 *
 * Authorization: a call-metrics row carries `agent` as a display string
 * only, never a stable agent id, so it cannot be authorized the way the
 * call-data branch above authorizes rows directly. Instead this
 * correlates each row to its governing call-data record by the proven
 * call_sid === call_id identity (src/types/api/callMetrics.ts header),
 * reads that record's real agent_id, and applies the SAME Agent Scope
 * check used above — never a role-name check, and never trusting an
 * unauthorized-or-unresolvable row for a scoped caller (fail-closed: a
 * row that can't be correlated to an authorized call-data record is
 * dropped, not passed through). All-access roles skip the correlation
 * entirely (no benefit, matches the call-data branch's identical
 * shortcut).
 *
 * date_from/date_to are always resolved to explicit values (defaulting
 * to "today" in Asia/Kolkata, the same default the upstream endpoint
 * itself documents) before being used for BOTH the metrics request and
 * the correlating call-data fetch, so the two always search the same
 * window — relying on two endpoints' independent "defaults to today"
 * behavior to silently agree would be fragile.
 */
function todayInDisplayTimezone(): string {
  // Asia/Kolkata is this project's documented display timezone default
  // (POSTGRES_TIMEZONE) — see the Call Metrics API doc's date_from/
  // date_to description. en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

async function fetchCallDataForAuthorization(
  baseUrl: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  direction: string | undefined,
): Promise<CallDataEntryDto[]> {
  const query: Record<string, string> = { status: 'inactive', date_from: dateFrom, date_to: dateTo, page_size: '100' };
  if (direction === 'inbound' || direction === 'outbound') query.direction = direction;
  const all: CallDataEntryDto[] = [];
  // Bounded loop, same 30-page/100-row-per-page cap
  // src/server/analytics/callPopulationFetcher.ts already establishes
  // elsewhere in this codebase — this is an authorization lookup, not a
  // user-facing population fetch, so it stays silent about any cap
  // rather than surfacing a "capped" flag.
  for (let page = 1; page <= 30; page++) {
    const search = new URLSearchParams({ ...query, page: String(page) }).toString();
    const res = await fetch(`${baseUrl}/api/v1/call-data?${search}`, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) break;
    const body = (await res.json()) as CallDataResponseDto;
    all.push(...(body.data.calls ?? []));
    const totalPages = body.data.pagination?.total_pages ?? page;
    if (page >= totalPages) break;
  }
  return all;
}

async function handleCallMetrics(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { baseUrl, apiKey } = getBackendConfig();
  const { resource: _resource, ...query } = readReqQuery(req);

  const dateFrom = query.date_from || todayInDisplayTimezone();
  const dateTo = query.date_to || todayInDisplayTimezone();
  const resolvedQuery: Record<string, string> = { ...query, date_from: dateFrom, date_to: dateTo };

  // Session 14.3 — Agent Scope, from the verified authenticated user.
  const access = await resolveAccessForAuthenticatedUser(req, 'agent');

  const search = new URLSearchParams(resolvedQuery).toString();
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/v1/analytics/call-metrics?${search}`, { headers: { 'X-API-Key': apiKey } });
  } catch (err) {
    res.status(502).json({ detail: `Upstream request failed: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  noStore(res);

  if (upstream.status !== 200 || typeof body !== 'object' || body === null) {
    res.status(upstream.status).json(body);
    return;
  }

  const dto = body as CallMetricsResponseDto;

  if (access.allCategories || access.authorizedAgentIds === 'all') {
    res.status(200).json(dto);
    return;
  }

  const correlationPool = await fetchCallDataForAuthorization(baseUrl, apiKey, dateFrom, dateTo, resolvedQuery.direction);
  const agentIdByCallId = new Map(correlationPool.map((c) => [c.call_id, c.agent_id]));
  const rows = filterCallMetricsRowsByAuthorizedAgents(
    dto.data.rows,
    agentIdByCallId,
    access.authorizedAgentIds as string[],
  );

  res.status(200).json({
    ...dto,
    data: {
      ...dto.data,
      rows,
      total: rows.length,
      total_pages: 1,
    },
  });
}
