import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, readReqQuery, withErrorBoundary } from '../_voicebot.js';
import { readIntQuery } from '../_customer360.js';
import { getRatioSummary, getRatioTrend, getRatioBreakdown, getRatioDrivers, getRatioInteractions } from '../../src/server/analytics/ratioService.js';
import type { RatioFilterState } from '../../src/types/ratio.js';

/**
 * Session 14.3 Phase 2 — KNOWN, DOCUMENTED GAP (not silently left, see
 * docs/SESSION_14_3_BUSINESS_DATA_SCOPE_AUTHORIZATION.md): Analytics and
 * Ratio Explorer's query layer (ratioService.ts and the upstream
 * analytics/metrics proxy) has no concept of Agent Scope at all.
 * Threading multi-agent filtering through every ratio/population query
 * is real query-layer work, confirmed during discovery to be a larger
 * lift than every other module closed this session, and deliberately
 * out of scope here.
 *
 * A response-shape-compatible "honest unavailable" gate was deliberately
 * NOT added here: AnalyticsMetricsResponseDto's `metrics` field is
 * required and strictly typed, consumed by real screens (Analytics.tsx,
 * AgentDetail.tsx) that assume it's always present — returning a
 * differently-shaped response for a restricted caller would be an
 * untested contract break for whichever screen hits it, which is worse
 * than the current gap. Real fix requires updating the DTO/consumers
 * together with the query-layer scoping, not a quick patch here.
 *
 * Current risk: ZERO for every real user today — every provisioned role
 * has allAgents=true (the Session 14.3 migration default; confirmed live
 * for both Administrator and Operator). This becomes a real exposure
 * only once an Administrator deliberately narrows a role's Agent Scope
 * via the new Role Management UI — RoleDataScopeEditor.tsx shows an
 * explicit warning when that happens, so the gap is surfaced to the
 * person taking the action, not hidden.
 */

/**
 * GET /api/analytics/metrics -> GET {VOICEBOT_BASE_URL}/api/v1/analytics/metrics
 *
 * Date-ranged-only (date_from/date_to), aggregates over completed calls.
 * No active-call count here — Active Calls stays sourced from call-data.
 *
 * Session R1 — this file ALSO dispatches the generic Ratio Explorer API
 * family (docs/CALL_CENTRE_RATIO_EXPLORER_UX_AND_RATIO_REGISTRY_v1.1.docx
 * §17.3) via `?resource=ratios&ratioId=...&view=...`. Extending this
 * existing endpoint — rather than adding a new api/analytics/ratios.ts
 * file — keeps the Vercel function count at its current 11 (Hobby-plan
 * ceiling), following the same dispatcher-by-query-param convention
 * already used by api/campaigns.ts/api/chat/index.ts. The DEFAULT
 * behavior above (no `resource` param) is completely unchanged — this is
 * additive only, never a redefinition of the existing metrics proxy
 * contract that Analytics.tsx already depends on.
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const query = readReqQuery(req);

  if (query.resource === 'ratios') {
    await handleRatiosResource(req, res, query);
    return;
  }

  const { baseUrl } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/analytics/metrics${search ? `?${search}` : ''}`;

  await proxyRequest(res, url, { method: 'GET' });
});

function queryStr(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

async function handleRatiosResource(req: VercelRequest, res: VercelResponse, query: Record<string, string>): Promise<void> {
  const ratioId = query.ratioId;
  const view = query.view ?? 'summary';
  if (!ratioId) {
    res.status(400).json({ detail: 'ratioId is required' });
    return;
  }

  const filters: RatioFilterState = {
    range: (query.range as RatioFilterState['range']) || undefined,
    direction: (query.direction as RatioFilterState['direction']) || undefined,
    channel: (query.channel as RatioFilterState['channel']) || undefined,
    domain: query.domain || undefined,
    campaign: query.campaign || undefined,
    agent: query.agent || undefined,
    intent: query.intent || undefined,
    breakdown: (query.breakdown as RatioFilterState['breakdown']) || undefined,
    breakdownValue: query.breakdownValue || undefined,
    driver: query.driver || undefined,
  };

  switch (view) {
    case 'summary': {
      const result = await getRatioSummary(ratioId, filters);
      res.status(200).json(result);
      return;
    }
    case 'trend': {
      const result = await getRatioTrend(ratioId, filters);
      res.status(200).json(result);
      return;
    }
    case 'breakdown': {
      const by = queryStr(req, 'by');
      if (!by) {
        res.status(400).json({ detail: 'by (breakdown dimension) is required for view=breakdown' });
        return;
      }
      const result = await getRatioBreakdown(ratioId, by, filters);
      res.status(200).json(result);
      return;
    }
    case 'drivers': {
      const result = await getRatioDrivers(ratioId, filters);
      res.status(200).json(result);
      return;
    }
    case 'interactions': {
      const page = readIntQuery(req, 'page', 1);
      const pageSize = readIntQuery(req, 'pageSize', 25);
      const result = await getRatioInteractions(ratioId, filters, page, pageSize);
      res.status(200).json(result);
      return;
    }
    default:
      res.status(400).json({ detail: 'Unknown view — use summary, trend, breakdown, drivers, or interactions' });
  }
}
