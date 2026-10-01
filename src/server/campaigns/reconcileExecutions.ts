import type { CampaignRepository } from './campaignRepository.js';
import type { CampaignResultRule, PendingReconciliation } from './types.js';
import type { CallDataEntryDto, CallDataResponseDto } from '../../types/api/calls.js';
import { deriveCampaignResult } from './resultRules.js';

/**
 * Reconciliation (plan §14/§18) — processes campaign_executions rows
 * with reconciliation_status = 'pending' after some minimum age.
 *
 * Attempts ONLY the authoritative lookup available once one of plan
 * §14's two backend paths is confirmed:
 *  (a) preferred — a `client_reference`/`campaign_execution_id` set on
 *      Trigger Call and echoed back on the call-data row
 *      (CORRELATION_MODE=client_reference)
 *  (b) alternative — confirmed call_sid === call_id equivalence
 *      (CORRELATION_MODE=call_sid_equals_call_id)
 *
 * Neither is confirmed as of Session 5 (plan §26 item 1) — with no
 * CAMPAIGN_RECONCILIATION_CORRELATION_MODE env var set, this function
 * has nothing authoritative to attempt and every processed execution
 * moves from 'pending' to 'unresolved' after its retry budget. This is
 * the honest, intended behavior (plan §14 point 5), not a bug to work
 * around with a phone/time-window fallback promoted to authoritative.
 *
 * A phone+time-window candidate may additionally be computed and stored
 * in reconciliation_candidate purely for diagnostic display (plan §14
 * point 3) — entirely separate from the authoritative attempt and never
 * influencing reconciliation_status, reconciled_interaction_id, or
 * whether a campaign_results row gets created.
 */

const MIN_AGE_MS = 2 * 60 * 1000;
const UNRESOLVED_AFTER_MS = 30 * 60 * 1000;
const CANDIDATE_WINDOW_MS = 10 * 60 * 1000;

type CorrelationMode = 'client_reference' | 'call_sid_equals_call_id' | null;

function getCorrelationMode(): CorrelationMode {
  const raw = process.env.CAMPAIGN_RECONCILIATION_CORRELATION_MODE;
  if (raw === 'client_reference' || raw === 'call_sid_equals_call_id') return raw;
  return null;
}

async function fetchCallData(query: Record<string, string>): Promise<CallDataResponseDto> {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${baseUrl}/api/v1/call-data${search ? `?${search}` : ''}`, { headers: { 'X-API-Key': apiKey } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`call-data request failed: ${res.status} ${typeof body === 'object' ? JSON.stringify(body) : text}`);
  }
  return body as CallDataResponseDto;
}

async function tryAuthoritativeMatch(execution: PendingReconciliation, mode: CorrelationMode): Promise<CallDataEntryDto | null> {
  if (!mode || !execution.callSid) return null;

  if (mode === 'call_sid_equals_call_id') {
    // Session 12.2B — VERIFICATION-BLOCKING DEFECT FIX. The backend's
    // `search` query param does NOT match against call_id (confirmed
    // live: searching call-data with search=<a real call_id> returns
    // zero results, while search=<caller name> correctly returns
    // matches, including that exact call by its call_id in the
    // results). The previous `{ search: execution.callSid }` query
    // therefore could never find a match, even though
    // call_sid_equals_call_id was independently, empirically proven
    // true for two separate controlled test calls the same session
    // (Session 12.2A: Initiate Call; Session 12.2B: campaign-triggered).
    //
    // Fix: date-window the candidate set the same way
    // findDiagnosticCandidate() below already does (a proven-working
    // pattern already in this file), then find the EXACT call_id match
    // from that page. This remains authoritative exact-identifier
    // matching, not phone/time correlation promoted to authoritative —
    // the date window only bounds which page we ask the backend for;
    // the match itself is still `call_id === execution.callSid`.
    if (!execution.triggeredAt) return null;
    const triggeredAt = new Date(execution.triggeredAt).getTime();
    const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dto = await fetchCallData({ date_from: dateFrom, date_to: dateTo, page_size: '25' });
    return dto.data.calls.find((c) => c.call_id === execution.callSid) ?? null;
  }

  // client_reference: not yet a real backend field to search on — this
  // branch is a placeholder for when the backend confirms one, per plan
  // §14's preferred path. No fallback substitution here.
  return null;
}

async function findDiagnosticCandidate(execution: PendingReconciliation): Promise<CallDataEntryDto | null> {
  const phoneNumber = execution.contactRawValue;
  if (!execution.triggeredAt) return null;
  const triggeredAt = new Date(execution.triggeredAt).getTime();
  const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  try {
    const dto = await fetchCallData({ search: phoneNumber, date_from: dateFrom, date_to: dateTo, page_size: '5' });
    return dto.data.calls[0] ?? null;
  } catch {
    return null;
  }
}

export interface ReconcileResult {
  processed: number;
  reconciled: number;
  unresolved: number;
  stillPending: number;
  errors: number;
}

export async function reconcilePendingExecutions(repo: CampaignRepository, limit = 25): Promise<ReconcileResult> {
  const mode = getCorrelationMode();
  const pending = await repo.listPendingReconciliations(limit);
  const now = Date.now();

  const campaignByCampaign = new Map<string, { rules: CampaignResultRule[]; agentId: string | null; agentName: string | null }>();
  async function getCampaignInfo(campaignId: string) {
    const cached = campaignByCampaign.get(campaignId);
    if (cached) return cached;
    const campaign = await repo.getCampaign(campaignId);
    const entry = { rules: campaign?.rules ?? [], agentId: campaign?.agentId ?? null, agentName: campaign?.agentName ?? null };
    campaignByCampaign.set(campaignId, entry);
    return entry;
  }

  let reconciled = 0;
  let unresolved = 0;
  let stillPending = 0;
  let errors = 0;

  for (const execution of pending) {
    const triggeredAt = execution.triggeredAt ? new Date(execution.triggeredAt).getTime() : now;
    if (now - triggeredAt < MIN_AGE_MS) {
      stillPending++;
      continue;
    }

    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      const candidateEntry = await findDiagnosticCandidate(execution);
      const candidate = candidateEntry
        ? { callId: candidateEntry.call_id, startTime: candidateEntry.start_time, phone: candidateEntry.caller_number }
        : null;

      if (match) {
        const { rules, agentId, agentName } = await getCampaignInfo(execution.campaignId);
        // Session 12.5 — deriveCampaignResult now reads
        // actual_outcome_code/actual_outcome_name/structured_outputs
        // straight off `match` itself (the authoritatively matched
        // call-data row — never the diagnostic `candidate`), so no
        // override is needed here; a historical/legacy match with all
        // three null produces the same null result it always did.
        const derivedBase = deriveCampaignResult(match, rules);
        const derived = { ...derivedBase, agentId, agentName };
        await repo.updateReconciliationStatus(execution.id, 'reconciled', match.call_id, candidate, new Date().toISOString(), derived);
        reconciled++;
        continue;
      }

      if (now - triggeredAt >= UNRESOLVED_AFTER_MS) {
        await repo.updateReconciliationStatus(execution.id, 'unresolved', null, candidate, new Date().toISOString(), null);
        unresolved++;
      } else {
        if (candidate) {
          await repo.updateReconciliationStatus(execution.id, 'pending', null, candidate, new Date().toISOString(), null);
        }
        stillPending++;
      }
    } catch (err) {
      await repo.updateReconciliationStatus(
        execution.id,
        'error',
        null,
        null,
        new Date().toISOString(),
        null,
      ).catch(() => undefined);
      errors++;
      void err;
    }
  }

  return { processed: pending.length, reconciled, unresolved, stillPending, errors };
}

export interface EnrichActualOutcomeResult {
  processed: number;
  enriched: number;
  noActualOutcomeYet: number;
  skipped: number;
  errors: number;
}

/**
 * Session 12.5 §7 — the idempotent enrichment path for an execution
 * that was already authoritatively reconciled (call_sid == call_id
 * already proven, campaign_results row already exists) back when the
 * matched call-data row's actual_outcome_code/structured_outputs were
 * still null — and the backend has since started populating them.
 *
 * Deliberately separate from reconcilePendingExecutions above, not a
 * variant of it: the candidate set
 * (repo.listReconciledMissingActualOutcome) is disjoint from
 * listPendingReconciliations, re-uses the SAME authoritative
 * call_sid == call_id matching (tryAuthoritativeMatch, not a
 * reimplementation), and never creates an execution, never calls a
 * CallBackendAdapter, and never touches reconciliation_status or the
 * generic call_status/call_outcome/campaignResultCode/isSuccess
 * already recorded. repo.enrichActualOutcome's own UPDATE-only, only-
 * when-currently-null guard (see the migration) is what makes this
 * safe to invoke repeatedly — this function adds no additional
 * idempotency logic on top of that guard, by design, to avoid two
 * independent sources of truth for "has this already been enriched."
 */
export async function enrichReconciledExecutionsWithActualOutcome(
  repo: CampaignRepository,
  limit = 25,
): Promise<EnrichActualOutcomeResult> {
  const mode = getCorrelationMode();
  const candidates = await repo.listReconciledMissingActualOutcome(limit);

  let enriched = 0;
  let noActualOutcomeYet = 0;
  let skipped = 0;
  let errors = 0;

  for (const execution of candidates) {
    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      if (!match || !match.actual_outcome_code) {
        noActualOutcomeYet++;
        continue;
      }
      const outcome = await repo.enrichActualOutcome(
        execution.id,
        match.actual_outcome_code,
        match.actual_outcome_name ?? null,
        match.structured_outputs ?? null,
        new Date().toISOString(),
      );
      if (outcome.enriched) {
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      void err;
    }
  }

  return { processed: candidates.length, enriched, noActualOutcomeYet, skipped, errors };
}
