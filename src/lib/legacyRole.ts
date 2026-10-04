/**
 * Session 14.1 — legacy-compatibility only (plan amendment #7 / scope
 * boundary): derives a single role string from a user's real assigned
 * roles, so the ~30 existing hooks/pages that do
 * `user?.role ?? 'unauthenticated'` purely to forward it as the
 * advisory `x-user-role` header keep working unchanged. Never used for
 * any new authorization decision — highest-priority assigned role wins.
 * Pure function, deliberately kept out of AuthContext.tsx so it's
 * directly unit-testable without a React/JSX bundling environment.
 */
export const LEGACY_ROLE_PRIORITY = ['administrator', 'supervisor', 'operator', 'analyst', 'qa_reviewer', 'read_only'];

export function deriveLegacyRole(roles: string[]): string {
  for (const candidate of LEGACY_ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? 'unauthenticated';
}
