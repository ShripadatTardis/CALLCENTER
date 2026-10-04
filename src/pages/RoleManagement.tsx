import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Loader2 } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAdminRoles, useAdminPermissions, useSetRolePermissions } from '@/hooks/admin/useAdmin';

/**
 * Session 14.1 — Role Management: role -> permission matrix, grouped by
 * product pillar. Reads /api/roles (roles.view); edits gated by
 * roles.manage, enforced server-side (requirePermission), never just a
 * hidden checkbox.
 */
const RoleManagement: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'roles.manage');
  const { data: roles, isLoading: rolesLoading } = useAdminRoles();
  const { data: permissions, isLoading: permissionsLoading } = useAdminPermissions();
  const setRolePermissions = useSetRolePermissions();
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const isLoading = rolesLoading || permissionsLoading;

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
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">Role Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
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
          <>
            <div className="flex flex-wrap gap-2">
              {(roles ?? []).map((r) => (
                <div key={r.code} className="rounded-md border border-border bg-card/40 px-3 py-2 min-w-[11rem]">
                  <div className="text-sm font-medium text-foreground">{r.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{r.userCount} user{r.userCount === 1 ? '' : 's'}</div>
                  {r.description && <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{r.description}</div>}
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium sticky left-0 bg-background">Permission</th>
                    {(roles ?? []).map((r) => (
                      <th key={r.code} className="text-center px-3 py-2 font-medium whitespace-nowrap">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pillars.map((pillar) => (
                    <React.Fragment key={pillar}>
                      <tr className="bg-card/60">
                        <td colSpan={(roles?.length ?? 0) + 1} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky left-0 bg-card/60">
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
          </>
        )}
      </div>
    </Layout>
  );
};

export default RoleManagement;
