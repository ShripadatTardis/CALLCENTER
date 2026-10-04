import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { AdminRole, AdminCustomerCategory } from '@/services/admin/adminService';
import { useSetRoleAgentScope, useSetRoleCustomerCategoryScope } from '@/hooks/admin/useAdmin';

interface AgentOption {
  agentId: string;
  displayName: string;
}

interface RoleDataScopeEditorProps {
  role: AdminRole;
  categories: AdminCustomerCategory[];
  agents: AgentOption[];
  canManage: boolean;
}

/**
 * Session 14.3 — Business Data Scope: two independent dimensions,
 * deliberately presented as separate controls (Agent Access never
 * derived from Customer Access, even though today's data happens to be
 * 1:1). Real category names and real agent display names only — no
 * database implementation terminology (category_id/agent_id) surfaced
 * to the Administrator.
 */
export const RoleDataScopeEditor: React.FC<RoleDataScopeEditorProps> = ({ role, categories, agents, canManage }) => {
  const setAgentScope = useSetRoleAgentScope();
  const setCategoryScope = useSetRoleCustomerCategoryScope();

  const toggleAllAgents = (allAgents: boolean) => {
    if (!canManage) return;
    setAgentScope.mutate({ roleCode: role.code, allAgents, agentIds: allAgents ? [] : role.agentIds });
  };
  const toggleAgent = (agentId: string) => {
    if (!canManage || role.allAgents) return;
    const next = role.agentIds.includes(agentId) ? role.agentIds.filter((a) => a !== agentId) : [...role.agentIds, agentId];
    setAgentScope.mutate({ roleCode: role.code, allAgents: false, agentIds: next });
  };

  const toggleAllCategories = (allCategories: boolean) => {
    if (!canManage) return;
    setCategoryScope.mutate({ roleCode: role.code, allCategories, categoryIds: allCategories ? [] : role.categoryIds });
  };
  const toggleCategory = (categoryId: string) => {
    if (!canManage || role.allCategories) return;
    const next = role.categoryIds.includes(categoryId) ? role.categoryIds.filter((c) => c !== categoryId) : [...role.categoryIds, categoryId];
    setCategoryScope.mutate({ roleCode: role.code, allCategories: false, categoryIds: next });
  };

  return (
    <div className="space-y-3 p-3 rounded-md border border-border bg-card/30">
      {!role.allAgents && (
        <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Row-level screens (Calls, Chat, Campaigns, Customers) are correctly restricted to this Agent Access selection.
            Analytics and Ratio Explorer aggregate numbers are <strong>not yet scope-aware</strong> — a user with only this role may
            still see organization-wide totals there until a future session closes that gap.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Agent Access</span>
          {setAgentScope.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-[11px] text-muted-foreground">Which AI agents' calls, chats, and campaigns this role can operate on.</p>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" name={`agent-scope-${role.code}`} disabled={!canManage} checked={role.allAgents} onChange={() => toggleAllAgents(true)} />
          All agents
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" name={`agent-scope-${role.code}`} disabled={!canManage} checked={!role.allAgents} onChange={() => toggleAllAgents(false)} />
          Selected agents
        </label>
        {!role.allAgents && (
          <div className="pl-5 space-y-1 pt-1">
            {agents.map((a) => (
              <label key={a.agentId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" disabled={!canManage} checked={role.agentIds.includes(a.agentId)} onChange={() => toggleAgent(a.agentId)} />
                {a.displayName}
              </label>
            ))}
            {agents.length === 0 && <span className="text-[11px] text-muted-foreground">No agents available.</span>}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Customer Access</span>
          {setCategoryScope.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-[11px] text-muted-foreground">Which customer categories this role can view in Customer 360.</p>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" name={`category-scope-${role.code}`} disabled={!canManage} checked={role.allCategories} onChange={() => toggleAllCategories(true)} />
          All customer categories
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="radio" name={`category-scope-${role.code}`} disabled={!canManage} checked={!role.allCategories} onChange={() => toggleAllCategories(false)} />
          Selected categories
        </label>
        {!role.allCategories && (
          <div className="pl-5 space-y-1 pt-1">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" disabled={!canManage} checked={role.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                {c.name}
              </label>
            ))}
            {categories.length === 0 && <span className="text-[11px] text-muted-foreground">No categories available.</span>}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
