
import { User } from '@/types/auth';

/** Session 14.1 role codes — see supabase/migrations/..._user_management_rbac_audit_foundation.sql. */
export const getRoleDisplayName = (role: string): string => {
  const roleMap: Record<string, string> = {
    administrator: 'Administrator',
    supervisor: 'Supervisor',
    operator: 'Operator',
    analyst: 'Analyst',
    qa_reviewer: 'QA Reviewer',
    read_only: 'Read Only',
  };
  return roleMap[role] || role;
};

export const hasPermission = (user: User | null, permission: string): boolean => {
  return user?.permissions?.includes(permission) || false;
};

// Re-export types and data for backward compatibility
export type { User, Call, AIAgent, CallLog } from '@/types/auth';
export { sampleCalls } from '@/data/sampleCalls';
export { sampleAIAgents } from '@/data/sampleAIAgents';
export { sampleCallLogs } from '@/data/sampleCallLogs';
