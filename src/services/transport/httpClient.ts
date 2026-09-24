import { normalizeApiError, type ApiError } from './errors';

/**
 * Base path for our own same-origin proxy. The frontend never
 * constructs a URL containing the real backend host — that hostname
 * and the X-API-Key live only inside /api/*.ts serverless functions.
 */
const PROXY_BASE_PATH = '/api';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  /** Extra headers merged on top of the default Content-Type. Used e.g. by the customers service to attach the client-supplied role signal (see docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.1 for why this is advisory, not a security boundary). */
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${PROXY_BASE_PATH}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + url.search;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Thin fetch wrapper for the calls/agents proxy routes. Always resolves
 * to the typed success payload, or rejects with a normalized ApiError.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal, headers } = options;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkError) {
    const err: ApiError = {
      status: 0,
      message: networkError instanceof Error ? networkError.message : 'Network error',
      raw: networkError,
    };
    throw err;
  }

  const parsed = await parseBody(res);

  if (!res.ok) {
    throw normalizeApiError(res.status, parsed);
  }

  return parsed as T;
}
