
import { User } from '@/types/auth';

export const getRoleDisplayName = (role: string): string => {
  const roleMap: Record<string, string> = {
    'call_center_head': 'Call Center Head',
    'qa_reviewer': 'QA Reviewer',
    'product_manager': 'Product Manager',
    'ai_operations_specialist': 'AI Operations Specialist'
  };
  return roleMap[role] || role;
};

export const hasPermission = (user: User | null, permission: string): boolean => {
  return user?.permissions?.includes(permission) || false;
};

// Re-export types and data for backward compatibility
export type { User, Call, AIAgent, CallLog } from '@/types/auth';
export { sampleUsers } from '@/data/sampleUsers';
export { sampleCalls } from '@/data/sampleCalls';
export { sampleAIAgents } from '@/data/sampleAIAgents';
export { sampleCallLogs } from '@/data/sampleCallLogs';
