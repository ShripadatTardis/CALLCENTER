import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Shared helpers for the /api/calls/* and /api/agents/* proxy routes.
 * Server-side only — never imported from src/.
 *
 * IMPORTANT: this file's name starts with `_`, which is the correct,
 * Vercel-documented convention for a utility file inside `/api` that
 * must NOT become its own route (see "Adding utility files to the /api
 * directory" in Vercel's docs). That part is not the issue — don't move
 * this file out of `/api`.
 *
 * What DOES matter: this project's package.json has "type": "module",
 * so every compiled /api/*.js file runs under Node's native ESM loader
 * at runtime. Unlike CommonJS `require`, ESM `import` requires relative
 * specifiers to include their file extension. Vercel's Node.js runtime
 * type-checks/transpiles each /api/*.ts file individually (bundling
 * that inlines cross-file imports is currently Next.js-only) — it does
 * NOT rewrite import specifiers, so any relative import of this file
 * MUST be written with an explicit `.js` extension in the SOURCE .ts
 * file, e.g. `from '../_voicebot.js'`, even though the actual source
 * file is `_voicebot.ts`. TypeScript's bundler/NodeNext module
 * resolution correctly type-checks this against the sibling .ts file
 * while preserving the .js specifier in the emitted output, which is
 * what Node's ESM loader then needs to find the compiled sibling file.
 * Omitting the extension compiles fine locally but fails at runtime on
 * Vercel with `ERR_MODULE_NOT_FOUND` — this exact bug was hit and fixed
 * after Session 1's first real deployment; keep the extension on any
 * new relative import added here or in any file that imports this one.
 */

export function getBackendConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  return { baseUrl, apiKey };
}

/**
 * Wraps a route handler so any synchronous/async throw (e.g. missing
 * env config from getBackendConfig()) becomes a clean 500 JSON response
 * instead of an uncaught exception. Found during Session 1's first real
 * deployment: an uncaught throw from getBackendConfig() crashed the
 * entire `vercel dev` process outright rather than just failing one
 * request — this is a defensive-robustness fix, not a change to the
 * proxy's request/response contract or business logic.
 */
export function withErrorBoundary(
  fn: (req: VercelRequest, res: VercelResponse) => Promise<void> | void,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      res.status(500).json({
        detail: err instanceof Error ? err.message : 'Internal server error',
      });
    }
  };
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
