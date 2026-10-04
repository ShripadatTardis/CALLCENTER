/**
 * Session 11.1 XYZ — origin-aware detail navigation (see
 * docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md "Detail Navigation
 * Standard"). A detail page's "Back" control must return to the
 * workspace the operator actually came from, not a hardcoded fixed
 * destination mislabeled as "Back".
 *
 * Deliberately NOT `navigate(-1)`/browser-history back — history can
 * contain an external site, a login step, an unrelated screen, or a
 * stale chain. Origin is instead passed explicitly via React Router
 * navigation state, restricted to a small typed/trusted set of known
 * internal routes — never an arbitrary URL string.
 */

export type DetailOrigin = 'dashboard' | 'ai-agents' | 'live-view' | 'customers' | 'outbound-campaigns' | 'chat-logs' | 'action-required';

interface OriginDestination {
  path: string;
  label: string;
}

const ORIGIN_DESTINATIONS: Record<DetailOrigin, OriginDestination> = {
  dashboard: { path: '/dashboard', label: 'Dashboard' },
  'ai-agents': { path: '/ai-agents', label: 'AI Agents' },
  'live-view': { path: '/live-view', label: 'Live View' },
  customers: { path: '/customers', label: 'Customers' },
  'outbound-campaigns': { path: '/outbound-campaigns', label: 'Campaigns' },
  'chat-logs': { path: '/chat-logs', label: 'Chat Logs' },
  'action-required': { path: '/action-required', label: 'Action Required' },
};

/** Canonical safe fallback for detail pages reached with no (or an
 * unrecognized) origin — e.g. direct URL entry, bookmark, or a hard
 * refresh under a router whose in-memory `location.state` doesn't
 * survive it. */
export const AGENT_DETAIL_FALLBACK_ORIGIN: DetailOrigin = 'ai-agents';

export interface DetailNavigationState {
  origin?: DetailOrigin;
}

/** Resolve an arbitrary (possibly absent/untrusted) value from
 * `location.state` into a known-safe { path, label } pair. Never
 * trusts a raw string as a route — only a recognized DetailOrigin key
 * resolves to anything other than the fallback. */
export function resolveDetailOrigin(
  origin: unknown,
  fallback: DetailOrigin = AGENT_DETAIL_FALLBACK_ORIGIN,
): OriginDestination {
  if (typeof origin === 'string' && Object.prototype.hasOwnProperty.call(ORIGIN_DESTINATIONS, origin)) {
    return ORIGIN_DESTINATIONS[origin as DetailOrigin];
  }
  return ORIGIN_DESTINATIONS[fallback];
}
