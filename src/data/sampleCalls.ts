
import { Call } from '@/types/auth';

export const sampleCalls: Call[] = [
  {
    id: 'call_001',
    callerNumber: '+1-555-0123',
    callerName: 'John Smith',
    intent: 'Billing Inquiry',
    stage: 'in-progress',
    duration: 245,
    channel: 'voice',
    sentimentScore: 0.7,
    aiAgentId: 'agent_001',
    startTime: new Date(Date.now() - 245000)
  },
  {
    id: 'call_002',
    callerNumber: '+1-555-0456',
    callerName: 'Maria Garcia',
    intent: 'Loan Status',
    stage: 'complete',
    duration: 180,
    channel: 'text',
    sentimentScore: 0.9,
    csatScore: 5,
    csatRating: 'excellent',
    csatFeedback: 'Very helpful and quick response',
    aiAgentId: 'agent_002',
    startTime: new Date(Date.now() - 300000),
    endTime: new Date(Date.now() - 120000)
  },
  {
    id: 'call_003',
    callerNumber: '+1-555-0789',
    callerName: 'David Wilson',
    intent: 'Technical Support',
    stage: 'escalated',
    duration: 420,
    channel: 'voice',
    sentimentScore: 0.3,
    csatScore: 2,
    csatRating: 'fair',
    csatFeedback: 'Issue not resolved, had to escalate',
    aiAgentId: 'agent_003',
    startTime: new Date(Date.now() - 420000),
    escalationTrigger: 'Complex technical issue requiring human intervention'
  },
  {
    id: 'call_004',
    callerNumber: '+1-555-0321',
    callerName: 'Lisa Brown',
    intent: 'Account Creation',
    stage: 'in-progress',
    duration: 95,
    channel: 'voice',
    sentimentScore: 0.8,
    aiAgentId: 'agent_001',
    startTime: new Date(Date.now() - 95000)
  }
];
