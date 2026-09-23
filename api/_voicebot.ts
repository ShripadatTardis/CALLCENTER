import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Shared helpers for the /api/calls/* and /api/agents/* proxy routes.
 * Server-side only — never imported from src/.
 */

export function getBackendConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  return { baseUrl, apiKey };
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ detail: `Method not allowed. Use ${allowed.join(' or ')}.` });
}

export function noStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
}

/**
 * Forwards a request to the Voice Agent backend, attaching X-API-Key
 * server-side, and relays the upstream status/body back to the client
 * as-is UNLESS the caller supplies a body inspector (used by
 * calls/trigger.ts for the documented "200 with {error: ...}" gotcha).
 */
export async function proxyRequest(
  res: VercelResponse,
  url: string,
  init: RequestInit,
  onBody?: (status: number, body: unknown) => { status: number; body: unknown },
): Promise<void> {
  const { apiKey } = getBackendConfig();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'X-API-Key': apiKey,
      },
    });
  } catch (err) {
    res.status(502).json({ detail: `Upstream request failed: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  const text = await upstream.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // leave as raw text if not JSON
  }

  noStore(res);

  if (onBody) {
    const remapped = onBody(upstream.status, body);
    res.status(remapped.status).json(remapped.body);
    return;
  }

  res.status(upstream.status).json(body);
}

export function readReqQuery(req: VercelRequest): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      query[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      query[key] = value[0];
    }
  }
  return query;
}
