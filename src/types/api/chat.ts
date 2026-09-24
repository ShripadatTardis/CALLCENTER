/**
 * POST /api/v1/chat — confirmed contract, per
 * docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md §2 and
 * docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §1. Not yet live-verified
 * (demo backend down during this session) — see the plan's §19 deferred
 * runtime checks.
 */

export interface ChatRequestDto {
  message: string;
  session_id?: string;
}

export type ChatDataSource = 'tool' | 'rag' | 'auth' | 'direct' | 'guidance' | 'llm' | 'cancelled';

export interface ChatResponseDto {
  success: boolean;
  response: string;
  session_id: string;
  data_source: ChatDataSource;
  authenticated: boolean;
  intent: string | null;
  confidence: number | null;
  detection_method: string | null;
  latency_ms: number | null;
}
