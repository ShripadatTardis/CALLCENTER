
import { Call, AIAgent } from '@/types/auth';

export const liveViewCalls: Call[] = [
  {
    id: 'live_call_001',
    callerNumber: '+1-555-0101',
    callerName: 'Jennifer Adams',
    intent: 'Account Balance',
    stage: 'in-progress',
    duration: 125,
    channel: 'voice',
    sentimentScore: 0.8,
    aiAgentId: 'agent_001',
    startTime: new Date(Date.now() - 125000)
  },
  {
    id: 'live_call_002',
    callerNumber: '+1-555-0102',
    callerName: 'Michael Torres',
    intent: 'Payment Issue',
    stage: 'connecting',
    duration: 15,
    channel: 'text',
    sentimentScore: 0.6,
    aiAgentId: 'agent_002',
    startTime: new Date(Date.now() - 15000)
  },
  {
    id: 'live_call_003',
    callerNumber: '+1-555-0103',
    callerName: 'Sarah Williams',
    intent: 'Loan Application',
    stage: 'in-progress',
    duration: 380,
    channel: 'voice',
    sentimentScore: 0.9,
    aiAgentId: 'agent_003',
    startTime: new Date(Date.now() - 380000)
  },
  {
    id: 'live_call_004',
    callerNumber: '+1-555-0104',
    callerName: 'Robert Johnson',
    intent: 'Technical Support',
    stage: 'escalated',
    duration: 520,
    channel: 'voice',
    sentimentScore: 0.3,
    aiAgentId: 'agent_004',
    startTime: new Date(Date.now() - 520000),
    escalationTrigger: 'Customer requesting supervisor for complex technical issue'
  },
  {
    id: 'live_call_005',
    callerNumber: '+1-555-0105',
    callerName: 'Lisa Chen',
    intent: 'Card Replacement',
    stage: 'in-progress',
    duration: 95,
    channel: 'text',
    sentimentScore: 0.7,
    aiAgentId: 'agent_001',
    startTime: new Date(Date.now() - 95000)
  },
  // Adding 95 more entries to reach 100
  ...Array.from({ length: 95 }, (_, i) => ({
    id: `live_call_${String(i + 6).padStart(3, '0')}`,
    callerNumber: `+1-555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    callerName: [
      'Alex Thompson', 'Maria Rodriguez', 'David Kim', 'Rachel Green', 'James Wilson',
      'Amanda Davis', 'Kevin Brown', 'Jessica Taylor', 'Brian Miller', 'Nicole Anderson',
      'Christopher Lee', 'Ashley White', 'Matthew Garcia', 'Lauren Martinez', 'Daniel Clark',
      'Stephanie Lewis', 'Ryan Walker', 'Melissa Hall', 'Brandon Young', 'Heather Allen',
      'Justin King', 'Kimberly Scott', 'Andrew Wright', 'Christina Lopez', 'Tyler Hill',
      'Samantha Adams', 'Nathan Baker', 'Michelle Gonzalez', 'Jacob Nelson', 'Rebecca Carter',
      'Anthony Mitchell', 'Angela Perez', 'Joshua Roberts', 'Vanessa Turner', 'William Phillips',
      'Brittany Campbell', 'Alexander Parker', 'Danielle Evans', 'Jonathan Edwards', 'Tiffany Collins',
      'Nicholas Stewart', 'Monica Sanchez', 'Aaron Morris', 'Crystal Rogers', 'Jordan Reed',
      'Jasmine Cook', 'Marcus Bailey', 'Sierra Cooper', 'Eric Richardson', 'Destiny Cox',
      'Gregory Ward', 'Alexis Torres', 'Carl Peterson', 'Katrina Gray', 'Sean Ramirez',
      'Amber James', 'Kyle Watson', 'Paige Brooks', 'Isaiah Kelly', 'Sydney Sanders',
      'Derek Price', 'Brooke Bennett', 'Trevor Wood', 'Mariah Barnes', 'Caleb Ross',
      'Jenna Henderson', 'Louis Coleman', 'Mackenzie Jenkins', 'Hunter Perry', 'Gabrielle Powell',
      'Garrett Long', 'Natalie Patterson', 'Ian Hughes', 'Chloe Flores', 'Mason Washington',
      'Trinity Butler', 'Evan Simmons', 'Kayla Foster', 'Lucas Gonzales', 'Savannah Bryant',
      'Blake Alexander', 'Madeline Russell', 'Cole Griffin', 'Hailey Diaz', 'Landon Hayes',
      'Zoe Myers', 'Connor Ford', 'Leah Hamilton', 'Wyatt Graham', 'Abigail Sullivan',
      'Owen Wallace', 'Megan Woods', 'Ashton Cole', 'Grace West', 'Colton Jordan'
    ][Math.floor(Math.random() * 95)],
    intent: [
      'Account Balance', 'Payment Issue', 'Loan Application', 'Technical Support', 'Card Replacement',
      'Billing Inquiry', 'Password Reset', 'Fraud Alert', 'Account Closure', 'Credit Inquiry',
      'Transfer Request', 'Statement Question', 'ATM Issue', 'Overdraft Fee', 'Interest Rate',
      'Direct Deposit', 'Check Order', 'Mobile Banking', 'Investment Info', 'Insurance Claim'
    ][Math.floor(Math.random() * 20)],
    stage: ['connecting', 'in-progress', 'complete', 'escalated'][Math.floor(Math.random() * 4)] as 'connecting' | 'in-progress' | 'complete' | 'escalated',
    duration: Math.floor(Math.random() * 600) + 30,
    channel: Math.random() > 0.3 ? 'voice' : 'text' as 'voice' | 'text',
    sentimentScore: Math.round((Math.random() * 0.8 + 0.2) * 100) / 100,
    aiAgentId: `agent_${String(Math.floor(Math.random() * 8) + 1).padStart(3, '0')}`,
    startTime: new Date(Date.now() - Math.floor(Math.random() * 600000)),
    ...(Math.random() > 0.85 && {
      escalationTrigger: [
        'Customer requesting supervisor',
        'Complex technical issue requiring specialist',
        'Fraud investigation needed',
        'High-value transaction requires approval',
        'Customer dissatisfaction with resolution'
      ][Math.floor(Math.random() * 5)]
    })
  }))
];

export const liveViewAgents: AIAgent[] = [
  {
    id: 'agent_001',
    name: 'TARDIS-Alpha',
    status: 'engaged',
    currentCallId: 'live_call_001',
    engagementTime: 125,
    intentCluster: 'Banking & Payments',
    totalCalls: 245,
    successRate: 0.91
  },
  {
    id: 'agent_002',
    name: 'TARDIS-Beta',
    status: 'engaged',
    currentCallId: 'live_call_002',
    engagementTime: 15,
    intentCluster: 'Technical Support',
    totalCalls: 189,
    successRate: 0.87
  },
  {
    id: 'agent_003',
    name: 'TARDIS-Gamma',
    status: 'engaged',
    currentCallId: 'live_call_003',
    engagementTime: 380,
    intentCluster: 'Loans & Credit',
    totalCalls: 156,
    successRate: 0.94
  },
  {
    id: 'agent_004',
    name: 'TARDIS-Delta',
    status: 'escalation_triggered',
    currentCallId: 'live_call_004',
    engagementTime: 520,
    intentCluster: 'Customer Service',
    totalCalls: 201,
    successRate: 0.82
  },
  {
    id: 'agent_005',
    name: 'TARDIS-Epsilon',
    status: 'idle',
    engagementTime: 0,
    intentCluster: 'Account Management',
    totalCalls: 178,
    successRate: 0.89
  },
  {
    id: 'agent_006',
    name: 'TARDIS-Zeta',
    status: 'awaiting_input',
    engagementTime: 45,
    intentCluster: 'Security & Fraud',
    totalCalls: 134,
    successRate: 0.93
  },
  {
    id: 'agent_007',
    name: 'TARDIS-Eta',
    status: 'engaged',
    currentCallId: 'live_call_025',
    engagementTime: 210,
    intentCluster: 'Investment Services',
    totalCalls: 98,
    successRate: 0.96
  },
  {
    id: 'agent_008',
    name: 'TARDIS-Theta',
    status: 'idle',
    engagementTime: 0,
    intentCluster: 'General Inquiries',
    totalCalls: 267,
    successRate: 0.85
  }
];
