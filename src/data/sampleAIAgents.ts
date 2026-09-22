
import { AIAgent } from '@/types/auth';

export const sampleAIAgents: AIAgent[] = [
  {
    id: 'agent_001',
    name: 'TARDIS-Alpha',
    status: 'engaged',
    currentCallId: 'call_001',
    engagementTime: 245,
    intentCluster: 'Billing & Payments',
    totalCalls: 127,
    successRate: 0.89
  },
  {
    id: 'agent_002',
    name: 'TARDIS-Beta',
    status: 'idle',
    engagementTime: 0,
    intentCluster: 'Loan Services',
    totalCalls: 98,
    successRate: 0.92
  },
  {
    id: 'agent_003',
    name: 'TARDIS-Gamma',
    status: 'escalation_triggered',
    currentCallId: 'call_003',
    engagementTime: 420,
    intentCluster: 'Technical Support',
    totalCalls: 76,
    successRate: 0.76
  },
  {
    id: 'agent_004',
    name: 'TARDIS-Delta',
    status: 'awaiting_input',
    engagementTime: 30,
    intentCluster: 'General Inquiries',
    totalCalls: 156,
    successRate: 0.94
  }
];
