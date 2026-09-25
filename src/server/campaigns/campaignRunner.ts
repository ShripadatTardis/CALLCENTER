import type { CampaignRepository } from './campaignRepository.js';
import type { TriggerCallRequestDto, TriggerCallResponseDto } from '../../types/api/calls.js';

/**
 * Plain, invokable, stateless batch function (plan §16) — zero
 * dependency on Vercel, Cron, or any specific scheduler. Deployment
 * invokes it via an admin-token-gated action on api/campaigns.ts,
 * manually today, optionally wired to any scheduler later.
 */

export interface CallBackendAdapter {
  triggerCall(payload: TriggerCallRequestDto): Promise<TriggerCallResponseDto>;
}

/**
 * Deliberately does NOT import api/_voicebot.ts — that file's helpers
 * are coupled to VercelRequest/VercelResponse, a transport-layer
 * concern this domain-layer file must not depend on, mirroring
 * voiceAgentInteractionSource.ts's own rule.
 */
export const voiceAgentCallBackend: CallBackendAdapter = {
  async triggerCall(payload) {
    const baseUrl = process.env.VOICEBOT_BASE_URL;
    const apiKey = process.env.VOICEBOT_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
    }
    const res = await fetch(`${baseUrl}/api/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new Error(`Trigger Call failed: ${res.status} ${typeof body === 'object' ? JSON.stringify(body) : text}`);
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

  let triggered = 0;
  let failed = 0;

  for (const target of targets) {
    const execution = await repo.createExecution(target.id, now);
    try {
      const result = await backend.triggerCall({
        to_phone_number: target.contactRawValue,
        agent_id: target.campaignAgentId,
        // Never fabricated — only populated when Customer 360 already has
        // a sourceCustomerRef for this customer (plan §17).
        customer_id: target.sourceCustomerRef ?? undefined,
      });
      await repo.markExecutionTriggered(execution.id, result.call_sid, new Date().toISOString());
      triggered++;
    } catch (err) {
      await repo.markExecutionFailed(execution.id, err instanceof Error ? err.message : 'Trigger Call failed');
      failed++;
    }
  }

  return { processed: targets.length, triggered, failed };
}
