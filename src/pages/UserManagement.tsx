import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { getRoleDisplayName } from '@/lib/auth';
import { useAdminUsers, useAdminUserDetail, useAdminRoles, useSetUserStatus, useAssignUserRole, useRemoveUserRole } from '@/hooks/admin/useAdmin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddUserDialog } from '@/components/admin/AddUserDialog';
import { typography } from '@/lib/typography';

/**
 * Session 14.1 — real User Management, replacing the sampleUsers
 * placeholder. Reads from /api/users (gated server-side by users.view);
 * status/role mutations gated by users.manage, both client-hidden here
 * AND independently enforced server-side (requirePermission).
 */
const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const canManage = hasPermission(currentUser, 'users.manage');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const { data: users, isLoading, isError } = useAdminUsers();
  const { data: roles } = useAdminRoles();
  const { data: expandedUserDetail } = useAdminUserDetail(expandedUserId);
  const setStatus = useSetUserStatus();
  const assignRole = useAssignUserRole();
  const removeRole = useRemoveUserRole();

  const filteredUsers = (users ?? []).filter((u) => {
    const term = searchTerm.toLowerCase();
    return !term || u.email.toLowerCase().includes(term) || (u.displayName ?? '').toLowerCase().includes(term);
  });

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern A, same recipe as CallLogs.tsx. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
            <Input
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              uiSize="sm"
              className="pl-7 border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>
          {canManage ? (
            <Button size="xs" onClick={() => setAddUserOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Add User
            </Button>
          ) : (
            <p className={typography.pageDescription}>View-only — your role doesn't include Manage Users.</p>
          )}
        </div>

        <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} roles={roles ?? []} />

        {isError && <p className="text-sm text-destructive flex-shrink-0">Could not load users.</p>}

        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-border text-left ${typography.tableHeader}`}>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role(s)</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" />
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr className="border-b border-border/60 last:border-0 hover:bg-card">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center text-xs font-semibold shrink-0">
                            {(u.displayName ?? u.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{u.displayName ?? '—'}</div>
                            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No roles assigned</span>
                          ) : (
                            u.roles.map((r) => (
                              <Badge key={r} variant="outline" className="text-xs whitespace-nowrap border-border text-foreground">
                                {getRoleDisplayName(r)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={`flex items-center gap-1.5 text-xs ${u.status === 'active' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                            {u.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                          {u.identityStatus === 'pending' && (
                            <span className="text-[11px] text-amber-500">Invited — pending sign-in</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                        >
                          {expandedUserId === u.id ? 'Close' : 'Manage'}
                        </Button>
                      </td>
                    </tr>
                    {expandedUserId === u.id && (
                      <tr className="border-b border-border/60 bg-card/40">
                        <td colSpan={4} className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Status:</span>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={!canManage || setStatus.isPending}
                                onClick={() => setStatus.mutate({ userId: u.id, status: u.status === 'active' ? 'inactive' : 'active' })}
                              >
                                {u.status === 'active' ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Assign role:</span>
                              <Select
                                disabled={!canManage || assignRole.isPending}
                                onValueChange={(roleCode) => assignRole.mutate({ userId: u.id, roleCode })}
                                value=""
                              >
                                <SelectTrigger uiSize="sm" className="w-40"><SelectValue placeholder="Add a role…" /></SelectTrigger>
                                <SelectContent>
                                  {(roles ?? [])
                                    .filter((r) => !u.roles.includes(r.code))
                                    .map((r) => (
                                      <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {u.roles.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground">Remove:</span>
                                {u.roles.map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    disabled={!canManage || removeRole.isPending}
                                    onClick={() => removeRole.mutate({ userId: u.id, roleCode: r })}
                                    className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                                  >
                                    {getRoleDisplayName(r)} ×
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {expandedUserDetail && expandedUserDetail.id === u.id && (
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              Data Scope (from assigned role{u.roles.length === 1 ? '' : 's'}): Agent Access —{' '}
                              {expandedUserDetail.dataScope.allAgents ? 'All agents' : `${expandedUserDetail.dataScope.agentIds.length} selected agent${expandedUserDetail.dataScope.agentIds.length === 1 ? '' : 's'}`}
                              {' · '}Customer Access —{' '}
                              {expandedUserDetail.dataScope.allCategories ? 'All categories' : `${expandedUserDetail.dataScope.categoryIds.length} selected categor${expandedUserDetail.dataScope.categoryIds.length === 1 ? 'y' : 'ies'}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default UserManagement;
