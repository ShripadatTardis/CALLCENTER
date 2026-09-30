import type { CampaignRepository } from './campaignRepository.js';
import type { TriggerCallRequestDto, TriggerCallResponseDto } from '../../types/api/calls.js';
import type { CallAgentContract, CampaignAgentInputMapping } from './types.js';
import { buildTriggerCallPayload } from './triggerCallPayload.js';

/**
 * Plain, invokable, stateless batch function (plan §16) — zero
 * dependency on Vercel, Cron, or any specific scheduler. Deployment
 * invokes it via an admin-token-gated action on api/campaigns.ts,
 * manually today, optionally wired to any scheduler later.
 */

export interface CallBackendAdapter {
  triggerCall(payload: TriggerCallRequestDto, idempotencyKey: string): Promise<TriggerCallResponseDto>;
}

/**
 * Session 12.4 — classifies a Trigger Call failure precisely enough that
 * an ambiguous response can never accidentally be read as "safe to try
 * again" or, worse, as success. Per the currently documented contract:
 * - 409 with idempotency_key_conflict: the SAME key was reused with a
 *   DIFFERENT request body — a real bug (our own key derivation is
 *   wrong) or a genuine duplicate-body collision; never treated as
 *   success, never silently retried with a new key from inside this
 *   function (that would be "generating a fresh key merely because a
 *   request was retried", exactly what's prohibited).
 * - 409 with request_in_progress: a call with this exact key is already
 *   being processed — also never treated as success; the eventual
 *   correct outcome will be reconciled the normal way once the original
 *   attempt completes.
 * - 503: the documented "nothing was dialled, key not consumed" case —
 *   safe to retry later (e.g. via the existing retryTarget action, which
 *   creates a NEW execution row and therefore a genuinely new key), but
 *   this function does not itself retry.
 * - Any other non-2xx (400/401/403/422/...): the existing pre-dial
 *   validation-rejection path (unknown/inactive agent_id, missing
 *   required input, wrong type/format, undeclared input) — unchanged in
 *   spirit from before this session, now just labeled more precisely.
 */
function classifyTriggerCallFailure(status: number, body: unknown, text: string): string {
  const bodyStr = typeof body === 'object' ? JSON.stringify(body) : text;
  if (status === 409) {
    const code = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : undefined;
    if (code === 'idempotency_key_conflict') {
      return `Trigger Call idempotency conflict: the same Idempotency-Key was reused with a different request body — no call was placed. ${bodyStr}`;
    }
    if (code === 'request_in_progress') {
      return `Trigger Call idempotency conflict: a request with this Idempotency-Key is already in progress — no additional call was placed. ${bodyStr}`;
    }
    return `Trigger Call idempotency conflict (409): ${bodyStr}`;
  }
  if (status === 503) {
    return `Trigger Call failed: 503 (Voice Gateway unavailable — nothing was dialled, safe to retry via retryTarget) ${bodyStr}`;
  }
  return `Trigger Call failed: ${status} ${bodyStr}`;
}

/**
 * Deliberately does NOT import api/_voicebot.ts — that file's helpers
 * are coupled to VercelRequest/VercelResponse, a transport-layer
 * concern this domain-layer file must not depend on, mirroring
 * voiceAgentInteractionSource.ts's own rule.
 */
export const voiceAgentCallBackend: CallBackendAdapter = {
  async triggerCall(payload, idempotencyKey) {
    const baseUrl = process.env.VOICEBOT_BASE_URL;
    const apiKey = process.env.VOICEBOT_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
    }
    const res = await fetch(`${baseUrl}/api/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new Error(classifyTriggerCallFailure(res.status, body, text));
    }
    // Documented gotcha (plan §17/Session 1): upstream can return HTTP 200
    // with {error: ...} in the body on a gateway failure.
    if (body && typeof body === 'object' && 'error' in body) {
      throw new Error(`Trigger Call gateway error: ${JSON.stringify(body)}`);
    }
    return body as TriggerCallResponseDto;
  },
};

export interface RunBatchResult {
  processed: number;
  triggered: number;
  failed: number;
}

export async function runCampaignBatch(
  repo: CampaignRepository,
  backend: CallBackendAdapter,
  batchSize: number,
): Promise<RunBatchResult> {
  const targets = await repo.selectRunnableTargets(batchSize);
  const now = new Date().toISOString();

  // Session 9.1 Phase 2/5 — each target's campaign carries its own
  // immutable agent-contract snapshot and input mappings; cache per
  // campaignId across this batch pass rather than refetching per target.
  const campaignCache = new Map<string, { contract: CallAgentContract | null; mappings: CampaignAgentInputMapping[] }>();
  async function getCampaignContract(campaignId: string) {
    const cached = campaignCache.get(campaignId);
    if (cached) return cached;
    const campaign = await repo.getCampaign(campaignId);
    const entry = { contract: campaign?.agentContractSnapshot ?? null, mappings: campaign?.mappings ?? [] };
    campaignCache.set(campaignId, entry);
    return entry;
  }

  let triggered = 0;
  let failed = 0;

  for (const target of targets) {
    const { contract, mappings } = await getCampaignContract(target.campaignId);
    const built = buildTriggerCallPayload(target, contract, mappings);
    const execution = await repo.createExecution(target.id, now, built.request as unknown as Record<string, unknown>);

    // Session 12.4 §7 — a target missing a required mapped value must
    // not be dialled. This is deliberately the SAME check
    // triggerCallPayload.ts already computes (unresolvedRequiredFieldCodes),
    // enforced here as a hard gate before any network call — never
    // fabricated, never guessed; the execution row already exists (for
    // history/audit) but is marked failed without ever reaching
    // backend.triggerCall.
    if (built.unresolvedRequiredFieldCodes.length > 0) {
      await repo.markExecutionFailed(
        execution.id,
        `Not dialled — missing required agent input value(s): ${built.unresolvedRequiredFieldCodes.join(', ')}`,
      );
      failed++;
      continue;
    }

    // Session 12.4 §3 — the Idempotency-Key is the execution row's own
    // id: stable and deterministic for this exact attempt (a transport
    // retry of the SAME triggerCall call reuses the same execution.id,
    // hence the same key, automatically — no separate key-tracking state
    // needed), and guaranteed to be a genuinely NEW value whenever a NEW
    // attempt is created (a fresh createExecution call above, e.g. via
    // retryTarget's next runBatch pass, always produces a new row id).
    try {
      const result = await backend.triggerCall(built.request, execution.id);
      await repo.markExecutionTriggered(execution.id, result.call_sid, new Date().toISOString());
      triggered++;
    } catch (err) {
      await repo.markExecutionFailed(execution.id, err instanceof Error ? err.message : 'Trigger Call failed');
      failed++;
    }
  }

  return { processed: targets.length, triggered, failed };
}
