/**
 * Session 14.1 — tiny module-level holder for the current Supabase Auth
 * access token, set by AuthContext on every auth-state change and read
 * by httpClient.ts to attach `Authorization: Bearer <token>` to every
 * request. Avoids a circular import between the context and the
 * transport layer (httpClient has no business importing React context).
 */
let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}
