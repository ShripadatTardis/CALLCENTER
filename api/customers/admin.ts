import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, requireAdminToken, readIntQuery } from '../_customer360.js';
import { getBackendConfig } from '../_voicebot.js';
import { getServiceRoleClient } from '../_auth.js';
import { runBackfillBatch } from '../../src/server/customer360/backfillJob.js';
import { runReconciliation } from '../../src/server/customer360/reconcileJob.js';
import { chatInteractionSource } from '../../src/server/customer360/chatInteractionSource.js';
import { runCmaBackfillBatch } from '../../src/server/cma/cmaBackfill.js';
import { runCmaPollingTick, CMA_POLLING_ROLLING_WINDOW_MS } from '../../src/server/cma/cmaPolling.js';
import { syncCallWindow, syncChatWindow } from '../../src/server/cma/cmaSync.js';
import { runCmaCallIdReconciliation, runCmaChatIdReconciliation } from '../../src/server/cma/cmaIdReconciliation.js';
import { computeInclusiveDateWindowBounds } from '../../src/server/cma/interactionReconciliation.js';
import type { AgentsResponseDto } from '../../src/types/api/agents.js';

/**
 * POST /api/customers/admin?action=backfill|reconcile|seedCategories —
 * consolidated internal/admin Customer 360 jobs (plan §5/§6/§16/§17).
 *
 * Originally three separate route files (backfill.ts, reconcile.ts,
 * seedCategories.ts). Merged into one during Session 4.5's
 * implementation after discovering the Vercel Hobby plan's 12-
 * serverless-function-per-deployment limit — Session 4 alone already
 * used exactly 12, leaving zero headroom for Session 4.5's new Chat
 * routes. These three are the lowest-traffic, most mechanically similar
 * routes (all POST, admin-token-gated, rarely invoked), so consolidating
 * them was the smallest-blast-radius way to free capacity without
 * touching anything Session 1-3.5 built. No behavior changed — same
 * three jobs, same admin-token gate, same request/response shapes, just
 * one fewer physical function file. Callers now pass `?action=...`.
 */
async function handleBackfill(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cursor = readIntQuery(req, 'cursor', 1);
  const batchSize = readIntQuery(req, 'batchSize', 5);
  const result = await runBackfillBatch(repo, source, cursor, batchSize);
  res.status(200).json(result);
}

async function handleReconcile(req: VercelRequest, res: VercelResponse): Promise<void> {
  const maxPages = readIntQuery(req, 'maxPages', 2);
  const result = await runReconciliation(repo, source, maxPages);
  res.status(200).json(result);
}

/**
 * Session 5.1 — bounded/idempotent Chat ingestion (prompt item 6), reusing
 * runReconciliation UNCHANGED against chatInteractionSource instead of
 * the voice source, with its own checkpoint ('chat', never 'voice' — see
 * reconcileJob.ts's checkpointSource param). One chat session = one
 * customer_interactions row, never one per message, by construction
 * (chatInteractionSource maps one SourceInteraction per session).
 * Plain invokable admin action — no scheduler wired to this one in
 * Session 5.1 (unlike ?action=reconcile, which Vercel Cron drives via
 * the CRON_SECRET path below); manual/admin invocation only for now.
 */
async function handleReconcileChat(req: VercelRequest, res: VercelResponse): Promise<void> {
  const maxPages = readIntQuery(req, 'maxPages', 2);
  const result = await runReconciliation(repo, chatInteractionSource, maxPages, 'chat');
  res.status(200).json(result);
}

function queryStr(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Session CMA-1B — manual/admin-triggered CMA Base Facts jobs, added to
 * this same consolidated admin route for the identical reason the
 * original three (backfill/reconcile/seedCategories) were consolidated
 * here in Session 4.5: this project is already at the Vercel Hobby
 * plan's 12-serverless-function ceiling (confirmed: exactly 12 real
 * route files under api/**, excluding underscore-prefixed shared
 * helpers which don't count) — a new top-level route file is not an
 * option. Reuses the EXACT SAME `requireAdminToken` gate every other
 * action on this route already requires (brief §6/§9: "restricted to
 * authorized execution," "server-side only") — no new permission, no
 * new migration-backed grant, nothing beyond what this route already
 * enforces for every other admin job.
 *
 * None of these actions is wired into vercel.json's `crons` — brief §4/
 * §9 explicitly require production scheduling to stay disabled until
 * separately approved. They are reachable ONLY via an authenticated
 * manual POST (the existing X-Admin-Token path), identical in spirit to
 * how `?action=backfill`/`reconcileChat` already work for Customer 360.
 */
async function handleCmaBackfill(req: VercelRequest, res: VercelResponse, adapter: typeof source): Promise<void> {
  const cursor = readIntQuery(req, 'cursor', 1);
  const batchSize = readIntQuery(req, 'batchSize', 5);
  const supabase = getServiceRoleClient();
  const result = await runCmaBackfillBatch(supabase, adapter, cursor, batchSize);
  res.status(200).json(result);
}

/**
 * CMA-1B.1 correction — a poll tick is now window-based (rolling
 * `[now - rollingWindowHours, now)`), covering both Call and Chat in one
 * call, never a page-order-dependent "re-sync page 1" — see
 * cmaPolling.ts's `runCmaPollingTick`. `rollingWindowHours` lets a
 * manual trigger widen/narrow the lookback for verification purposes;
 * the default matches `CMA_POLLING_ROLLING_WINDOW_MS`.
 */
async function handleCmaPoll(req: VercelRequest, res: VercelResponse): Promise<void> {
  const rollingWindowHours = readIntQuery(req, 'rollingWindowHours', CMA_POLLING_ROLLING_WINDOW_MS / (60 * 60 * 1000));
  const supabase = getServiceRoleClient();
  const result = await runCmaPollingTick(supabase, rollingWindowHours * 60 * 60 * 1000);
  res.status(200).json(result);
}

/**
 * CMA-1B.1 — explicit `[from, to)` windowed sync, manually triggerable,
 * for an on-demand resync of a specific historical period (e.g. after a
 * reconciliation pass reports drift for that window). Uses the SAME
 * window-based primitives as polling — `syncCallWindow`/`syncChatWindow`
 * — never a separate page-order-dependent path.
 */
async function handleCmaSyncCallsWindow(req: VercelRequest, res: VercelResponse): Promise<void> {
  const dateFrom = queryStr(req, 'dateFrom');
  const dateTo = queryStr(req, 'dateTo');
  if (!dateFrom || !dateTo) {
    res.status(422).json({ detail: 'dateFrom and dateTo (YYYY-MM-DD) are required' });
    return;
  }
  const { startedFrom, startedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);
  const supabase = getServiceRoleClient();
  const result = await syncCallWindow(supabase, dateFrom, dateTo, startedFrom, startedTo);
  res.status(200).json(result);
}

async function handleCmaSyncChatsWindow(req: VercelRequest, res: VercelResponse): Promise<void> {
  const dateFrom = queryStr(req, 'dateFrom');
  const dateTo = queryStr(req, 'dateTo');
  if (!dateFrom || !dateTo) {
    res.status(422).json({ detail: 'dateFrom and dateTo (YYYY-MM-DD) are required' });
    return;
  }
  const { startedFrom, startedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);
  const supabase = getServiceRoleClient();
  const result = await syncChatWindow(supabase, startedFrom, startedTo);
  res.status(200).json(result);
}

async function handleCmaReconcileCalls(req: VercelRequest, res: VercelResponse): Promise<void> {
  const dateFrom = queryStr(req, 'dateFrom');
  const dateTo = queryStr(req, 'dateTo');
  if (!dateFrom || !dateTo) {
    res.status(422).json({ detail: 'dateFrom and dateTo (YYYY-MM-DD) are required' });
    return;
  }
  const { startedFrom, startedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);
  const supabase = getServiceRoleClient();
  const result = await runCmaCallIdReconciliation(supabase, dateFrom, dateTo, startedFrom, startedTo);
  res.status(200).json(result);
}

async function handleCmaReconcileChats(req: VercelRequest, res: VercelResponse): Promise<void> {
  const dateFrom = queryStr(req, 'dateFrom');
  const dateTo = queryStr(req, 'dateTo');
  if (!dateFrom || !dateTo) {
    res.status(422).json({ detail: 'dateFrom and dateTo (YYYY-MM-DD) are required' });
    return;
  }
  const { startedFrom, startedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);
  const maxPages = readIntQuery(req, 'maxPages', 10);
  const supabase = getServiceRoleClient();
  const result = await runCmaChatIdReconciliation(supabase, startedFrom, startedTo, maxPages);
  res.status(200).json(result);
}

async function handleSeedCategories(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const { baseUrl, apiKey } = getBackendConfig();
  const upstream = await fetch(`${baseUrl}/api/v1/agents`, { headers: { 'X-API-Key': apiKey } });
  const text = await upstream.text();
  if (!upstream.ok) {
    res.status(502).json({ detail: `Upstream /agents request failed: ${upstream.status} ${text}` });
    return;
  }
  const dto = JSON.parse(text) as AgentsResponseDto;

  const created: string[] = [];
  const skipped: string[] = [];
  const existingMap = await repo.getCategoryAgentMap();

  for (const agent of dto.agents) {
    if (existingMap.has(agent.agent_id)) {
      skipped.push(agent.agent_id);
      continue;
    }
    await repo.upsertCategoryForAgent(agent.agent_id, agent.display_name);
    created.push(agent.agent_id);
  }

  res.status(200).json({ created, skipped, totalAgents: dto.agents.length });
}

/**
 * Vercel Cron only ever issues a GET request and cannot set custom
 * headers — it can't drive the normal POST + X-Admin-Token admin path
 * above. Vercel's own documented mechanism for authenticating its own
 * Cron requests is a `CRON_SECRET` env var: when set, Vercel
 * automatically attaches `Authorization: Bearer <CRON_SECRET>` to every
 * Cron invocation of this deployment. This check accepts ONLY that,
 * ONLY for GET, and ONLY for action=reconcile — the one job safe/cheap
 * enough to run unattended on a schedule (see vercel.json's `crons`
 * entry). Manual/admin invocation of any action, including reconcile,
 * still requires the existing POST + X-Admin-Token path — this is a
 * narrow, additive authentication path for the scheduler adapter only,
 * not a replacement for it.
 */
function isAuthorizedCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  const action = (Array.isArray(req.query.action) ? req.query.action[0] : req.query.action) ?? '';

  if (req.method === 'GET' && action === 'reconcile') {
    if (!isAuthorizedCronRequest(req)) {
      res.status(401).json({ detail: 'Invalid or missing cron authorization' });
      return;
    }
    noStore(res);
    await handleReconcile(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  if (!requireAdminToken(req, res)) return;

  noStore(res);

  switch (action) {
    case 'backfill':
      await handleBackfill(req, res);
      return;
    case 'reconcile':
      await handleReconcile(req, res);
      return;
    case 'reconcileChat':
      await handleReconcileChat(req, res);
      return;
    case 'cmaBackfillCalls':
      await handleCmaBackfill(req, res, source);
      return;
    case 'cmaBackfillChats':
      await handleCmaBackfill(req, res, chatInteractionSource);
      return;
    case 'cmaPoll':
      await handleCmaPoll(req, res);
      return;
    case 'cmaSyncCallsWindow':
      await handleCmaSyncCallsWindow(req, res);
      return;
    case 'cmaSyncChatsWindow':
      await handleCmaSyncChatsWindow(req, res);
      return;
    case 'cmaReconcileCalls':
      await handleCmaReconcileCalls(req, res);
      return;
    case 'cmaReconcileChats':
      await handleCmaReconcileChats(req, res);
      return;
    case 'seedCategories':
      await handleSeedCategories(req, res);
      return;
    default:
      res.status(400).json({
        detail:
          'Unknown or missing ?action= — use backfill, reconcile, reconcileChat, seedCategories, ' +
          'cmaBackfillCalls, cmaBackfillChats, cmaPoll, cmaSyncCallsWindow, cmaSyncChatsWindow, ' +
          'cmaReconcileCalls, or cmaReconcileChats',
      });
  }
});
