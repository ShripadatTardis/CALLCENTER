import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, readReqQuery, withErrorBoundary } from '../_voicebot.js';
import { getRatioSummary, getRatioTrend, getRatioBreakdown, getRatioDrivers, getRatioInteractions } from '../../src/server/analytics/ratioService.js';
import type { RatioFilterState } from '../../src/types/ratio.js';

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
      const result = await getRatioTrend(ratioId);
      res.status(200).json(result);
      return;
    }
    case 'breakdown': {
      const by = queryStr(req, 'by');
      if (!by) {
        res.status(400).json({ detail: 'by (breakdown dimension) is required for view=breakdown' });
        return;
      }
      const result = await getRatioBreakdown(ratioId, by);
      res.status(200).json(result);
      return;
    }
    case 'drivers': {
      const result = await getRatioDrivers(ratioId);
      res.status(200).json(result);
      return;
    }
    case 'interactions': {
      const result = await getRatioInteractions(ratioId);
      res.status(200).json(result);
      return;
    }
    default:
      res.status(400).json({ detail: 'Unknown view — use summary, trend, breakdown, drivers, or interactions' });
  }
}
