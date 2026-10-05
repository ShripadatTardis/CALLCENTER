import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAdminRoles, useAdminPermissions, useSetRolePermissions, useAdminCustomerCategories } from '@/hooks/admin/useAdmin';
import { useAgents } from '@/hooks/agents/useAgents';
import { RoleDataScopeEditor } from '@/components/admin/RoleDataScopeEditor';
import { typography } from '@/lib/typography';

/**
 * Session 14.1 — Role Management: role -> permission matrix, grouped by
 * product pillar. Reads /api/roles (roles.view); edits gated by
 * roles.manage, enforced server-side (requirePermission), never just a
 * hidden checkbox.
 *
 * Session 14.3 — each role card expands to a Data Scope editor (Agent
 * Access + Customer Access), the second authorization dimension
 * alongside the permission matrix: permissions answer WHAT a role may
 * do, Data Scope answers WHICH data it may see.
 */
const RoleManagement: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'roles.manage');
  const { data: roles, isLoading: rolesLoading } = useAdminRoles();
  const { data: permissions, isLoading: permissionsLoading } = useAdminPermissions();
  const { data: categories } = useAdminCustomerCategories();
  const { data: agentRoster } = useAgents();
  const setRolePermissions = useSetRolePermissions();
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const isLoading = rolesLoading || permissionsLoading;
  const agentOptions = (agentRoster?.agents ?? []).map((a) => ({ agentId: a.agentId, displayName: a.displayName }));

  const pillars = Array.from(new Set((permissions ?? []).map((p) => p.pillar)));

  const togglePermission = (roleCode: string, permissionKey: string, currentKeys: string[]) => {
    if (!canManage) return;
    const next = currentKeys.includes(permissionKey)
      ? currentKeys.filter((k) => k !== permissionKey)
      : [...currentKeys, permissionKey];
    setPendingCell(`${roleCode}:${permissionKey}`);
    setRolePermissions.mutate(
      { roleCode, permissionKeys: next },
      { onSettled: () => setPendingCell(null) },
    );
  };

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern A: root fills Layout's main height as a flex column; role
          cards + the optional expanded Data Scope editor are flex-shrink-0;
          the permission matrix alone is flex-1 min-h-0 overflow-auto. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex-shrink-0">
          <h1 className={typography.pageTitle}>Role Management</h1>
          <p className={`${typography.pageDescription} mt-0.5`}>
            {canManage
              ? 'Click a cell to grant or revoke a permission for a role.'
              : "View-only — your role doesn't include Manage Roles."}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="space-y-2 flex-shrink-0">
              <div className="flex flex-wrap gap-2">
                {(roles ?? []).map((r) => {
                  const isExpanded = expandedRole === r.code;
                  return (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setExpandedRole(isExpanded ? null : r.code)}
                      className="text-left rounded-md border border-border bg-card/40 hover:bg-card px-3 py-2 min-w-[11rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                    >
                      <div className="flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className={typography.cardTitle}>{r.label}</span>
                      </div>
                      <div className={`${typography.metadata} mt-0.5 pl-4`}>{r.userCount} user{r.userCount === 1 ? '' : 's'} · Data Scope</div>
                      {r.description && <div className={`${typography.metadata} mt-1 leading-snug pl-4`}>{r.description}</div>}
                    </button>
                  );
                })}
              </div>
              {expandedRole && (() => {
                const role = (roles ?? []).find((r) => r.code === expandedRole);
                if (!role) return null;
                return (
                  <RoleDataScopeEditor
                    role={role}
                    categories={categories ?? []}
                    agents={agentOptions}
                    canManage={canManage}
                  />
                );
              })()}
            </div>

            {/* VoiceForce design system (Phase 2C) — bg-card/40 tint
                matches the role cards above, so the matrix and the role
                cards read as one administration family rather than two
                differently-treated containers. */}
            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-card/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b border-border ${typography.tableHeader}`}>
                    <th className="text-left px-3 py-2 sticky left-0 bg-background">Permission</th>
                    {(roles ?? []).map((r) => (
                      <th key={r.code} className="text-center px-3 py-2 whitespace-nowrap">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pillars.map((pillar) => (
                    <React.Fragment key={pillar}>
                      <tr className="bg-card/60">
                        <td colSpan={(roles?.length ?? 0) + 1} className={`px-3 py-1 ${typography.subsectionTitle} sticky left-0 bg-card/60`}>
                          {pillar}
                        </td>
                      </tr>
                      {(permissions ?? [])
                        .filter((p) => p.pillar === pillar)
                        .map((p) => (
                          <tr key={p.key} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-1.5 text-foreground sticky left-0 bg-background" title={p.description ?? undefined}>
                              {p.label}
                            </td>
                            {(roles ?? []).map((r) => {
                              const granted = r.permissionKeys.includes(p.key);
                              const cellKey = `${r.code}:${p.key}`;
                              const isPending = pendingCell === cellKey;
                              return (
                                <td key={r.code} className="text-center py-1.5">
                                  <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() => togglePermission(r.code, p.key, r.permissionKeys)}
                                    aria-label={`${granted ? 'Revoke' : 'Grant'} ${p.label} for ${r.label}`}
                                    className="inline-flex items-center justify-center w-6 h-6 rounded disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                                  >
                                    {isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    ) : (
                                      <div className={`w-2 h-2 rounded-full ${granted ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RoleManagement;
