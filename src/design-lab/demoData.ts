/**
 * SESSION 10.0 DESIGN LAB — DEMO DATA ONLY.
 *
 * Everything in this file is static, representative, design-demo data.
 * It corresponds to real VoiceForce domain concepts (campaigns, Call
 * Agents, Agent Contracts, target counts, outcome policy rules) but is
 * NOT fetched from Supabase or the Partner API, and nothing in the
 * Design Lab writes to real hooks/services. This file must never be
 * imported from production pages — it exists only to render the three
 * isolated prototype directions for visual comparison.
 */

export const PILLARS = [
  {
    key: 'observe',
    label: 'Observe',
    items: ['Dashboard', 'Live View', 'Call Logs', 'Chat Logs', 'Customers'],
  },
  {
    key: 'control',
    label: 'Control',
    items: ['Initiate Call', 'Chat'],
  },
  {
    key: 'operationalize',
    label: 'Operationalize',
    items: ['Outbound Campaigns', 'NPS Campaigns'],
    active: true,
  },
  {
    key: 'integrate',
    label: 'Integrate',
    items: ['WhatsApp Hub', 'Formatting Hub', 'AI Orchestrator'],
  },
  {
    key: 'improve',
    label: 'Improve',
    items: ['AI Agents', 'Interaction Quality'],
  },
  {
    key: 'measure',
    label: 'Measure',
    items: ['Analytics'],
  },
  {
    key: 'govern',
    label: 'Govern',
    items: ['User Mgmt', 'Settings'],
  },
] as const;

export type DemoCampaign = {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  agentName: string;
  agentDirection: 'inbound' | 'outbound';
  targetCount: number;
  attempted: number;
  reconciled: number;
  unclassified: number;
  successRate: number | null; // null = not enough classified targets yet
};

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: 'c1',
    name: 'October EMI Reminders',
    status: 'running',
    agentName: 'EMI Reminder',
    agentDirection: 'outbound',
    targetCount: 240,
    attempted: 168,
    reconciled: 52,
    unclassified: 116,
    successRate: null,
  },
  {
    id: 'c2',
    name: 'Forex Rate Alert — Q4',
    status: 'draft',
    agentName: 'Forex Transaction',
    agentDirection: 'outbound',
    targetCount: 85,
    attempted: 0,
    reconciled: 0,
    unclassified: 0,
    successRate: null,
  },
  {
    id: 'c3',
    name: 'September Credit Card Upgrade',
    status: 'completed',
    agentName: 'Inbound Banking Assistant',
    agentDirection: 'outbound',
    targetCount: 60,
    attempted: 60,
    reconciled: 60,
    unclassified: 4,
    successRate: 0.63,
  },
  {
    id: 'c4',
    name: 'August EMI Sweep',
    status: 'paused',
    agentName: 'EMI Reminder',
    agentDirection: 'outbound',
    targetCount: 400,
    attempted: 210,
    reconciled: 190,
    unclassified: 12,
    successRate: 0.41,
  },
];

export const CREATE_STEPS = [
  'Basic Info',
  'Call Agent',
  'Agent Contract',
  'Audience',
  'Input Mapping',
  'Outcome Policy',
  'Review & Launch',
] as const;

export const DEMO_AGENT_CONTRACT = {
  agentId: 'emi-reminder-agent',
  agentName: 'EMI Reminder',
  contractSource: 'legacy' as const,
  contractCompleteness: 'partial' as const,
  expectedInputFields: [] as string[],
  expectedOutcomes: [] as string[],
  outputFields: [] as string[],
};

export const DEMO_OUTCOME_RULES = [
  {
    priority: 10,
    matchField: 'escalation_trigger',
    matchValue: 'escalated',
    resultLabel: 'Needs manual review',
    isSuccess: false,
  },
  {
    priority: 20,
    matchField: 'outcome',
    matchValue: 'resolved',
    resultLabel: 'Resolved',
    isSuccess: true,
  },
];
