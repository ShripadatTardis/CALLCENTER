// src/lib/legacyRole.ts
var LEGACY_ROLE_PRIORITY = ["administrator", "supervisor", "operator", "analyst", "qa_reviewer", "read_only"];
function deriveLegacyRole(roles) {
  for (const candidate of LEGACY_ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? "unauthenticated";
}
export {
  LEGACY_ROLE_PRIORITY,
  deriveLegacyRole
};
