/**
 * Normalized error type for every call through the transport layer.
 *
 * The Voice Agent backend's documented API responses use two different
 * error shapes depending on the failure type (confirmed in the Trigger
 * Call, Session Transcript and Call Data reference docs' own "Error
 * Responses" sections):
 *
 *   (a) auth failures (401 / 403) return an object:
 *       { success: false, error: string, message: string }
 *
 *   (b) not-found / upstream failures (404 / 502 / etc.) return a plain
 *       string under `detail`:
 *       { detail: string }
 *
 * Every domain service and hook consumes only `ApiError` below — nothing
 * outside this file needs to know which upstream shape produced it.
 */
export interface ApiError {
  /** HTTP status returned by our own /api/* proxy route. */
  status: number;
  /** The upstream `error` code, when shape (a) applied. */
  code?: string;
  /** Unified, human-readable message. */
  message: string;
  /** The original parsed body, kept for debugging/logging only. */
  raw: unknown;
}

interface AuthShapeBody {
  success?: boolean;
  error?: string;
  message?: string;
}

interface DetailShapeBody {
  detail?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Builds a normalized ApiError from an HTTP status and a parsed (or
 * unparsable) response body. Handles both documented upstream shapes and
 * falls back gracefully for anything unexpected (e.g. a network error
 * with no body at all, or a future upstream change).
 */
export function normalizeApiError(status: number, body: unknown): ApiError {
  if (isRecord(body)) {
    const detailBody = body as DetailShapeBody;
    if (typeof detailBody.detail === 'string') {
      return { status, message: detailBody.detail, raw: body };
    }

    const authBody = body as AuthShapeBody;
    if (typeof authBody.message === 'string' || typeof authBody.error === 'string') {
      return {
        status,
        code: authBody.error,
        message: authBody.message ?? authBody.error ?? 'Request failed',
        raw: body,
      };
    }
  }

  return {
    status,
    message: 'Unexpected error',
    raw: body,
  };
}

export function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.status === 'number' && typeof value.message === 'string';
}
