/**
 * POST /api/v1/chat — confirmed contract, per Chat_Mode_API.docx
 * (Session 5.1). agent_id binds on the first message and is ignored
 * afterwards; session_id is mandatory from the second message onward.
 */

export interface ChatRequestDto {
  message: string;
  session_id?: string;
  agent_id?: string;
  customer_id?: string;
  contact_id?: string;
  caller_name?: string;
  phone_number?: string;
}

export type ChatDataSource = 'tool' | 'rag' | 'auth' | 'direct' | 'guidance' | 'llm' | 'cancelled';

export interface ChatResponseDto {
  success: boolean;
  response: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  customer_id: string | null;
  contact_id: string | null;
  data_source: ChatDataSource;
  authenticated: boolean;
  intent: string | null;
  confidence: number | null;
  detection_method: string | null;
  latency_ms: number | null;
}

/** Stable error codes documented on POST /api/v1/chat (Chat_Mode_API.docx "Error responses"). */
export type ChatErrorCode =
  | 'invalid_agent'
  | 'invalid_session'
  | 'customer_not_found'
  | 'contact_not_found'
  | 'invalid_request'
  | 'backend_unavailable'
  | 'processing_failed';

export type ChatSessionStatus = 'active' | 'completed';

/** One row of GET /api/v1/chat/sessions (Chat_Sessions_API.docx). */
export interface ChatSessionListRowDto {
  session_id: string;
  agent_id: string;
  agent_name: string;
  customer_id: string | null;
  contact_id: string | null;
  caller_name: string | null;
  phone_number: string | null;
  is_bank_customer: boolean;
  channel: string;
  status: ChatSessionStatus;
  authenticated: boolean;
  message_count: number;
  history_doc_id: string | null;
  intent: string | null;
  confidence: number | null;
  data_source: string | null;
  detection_method: string | null;
  latency_ms: number | null;
  started_at: string;
  updated_at: string;
}

export interface ChatSessionsListResponseDto {
  success: boolean;
  data: {
    sessions: ChatSessionListRowDto[];
    pagination: { page: number; page_size: number; total_records: number; total_pages: number };
  };
}

export interface ChatTranscriptMessageDto {
  number: number;
  role: 'customer' | 'assistant';
  message: string;
  timestamp: string;
}

/** GET /api/v1/chat/sessions/{session_id} (Chat_Transcript_API.docx) — session fields identical to the list row, plus ordered messages. */
export interface ChatSessionDetailResponseDto {
  success: boolean;
  data: ChatSessionListRowDto & { messages: ChatTranscriptMessageDto[] };
}
