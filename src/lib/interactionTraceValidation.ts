/**
 * Shared validation for the Interaction Trace API's `interaction_id` path
 * parameter (Interaction_Trace_API.docx — "1-128 letters, digits, - or
 * _"). Used server-side (api/calls/data.ts, api/chat/logs.ts) to return a
 * clean 422 before ever calling the upstream backend, rather than
 * forwarding an obviously-invalid id and relaying whatever the backend
 * happens to do with it.
 */
export const INTERACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidInteractionId(id: string): boolean {
  return INTERACTION_ID_PATTERN.test(id);
}
