import { FlowStatus, FlowChannel } from '@/types/orchestrator';

export interface FlowMetadata {
  id: string;
  name: string;
  description: string;
  status: FlowStatus;
  version: number;
  channels: FlowChannel[];
  industry: string;
  updatedAt: string;
  updatedBy: { name: string };
  metrics?: {
    starts: number;
    completions: number;
    dropOffRate: number;
    avgHandleTime: number;
  };
}

export const sampleFlows: FlowMetadata[] = [
  {
    id: '1',
    name: 'Balance & Mini-Statement',
    description: 'Voice flow for balance inquiry and transaction history via IVR',
    status: 'live',
    version: 3,
    channels: ['voice'],
    industry: 'banking',
    updatedAt: '2025-01-08T14:32:00Z',
    updatedBy: { name: 'John Doe' },
    metrics: {
      starts: 15420,
      completions: 14986,
      dropOffRate: 2.8,
      avgHandleTime: 45
    }
  },
  {
    id: '2',
    name: 'EMI Payment Flow',
    description: 'Automated EMI collection and payment confirmation for loan customers',
    status: 'live',
    version: 2,
    channels: ['voice', 'text'],
    industry: 'banking',
    updatedAt: '2025-01-07T09:15:00Z',
    updatedBy: { name: 'Jane Smith' },
    metrics: {
      starts: 8234,
      completions: 7891,
      dropOffRate: 4.2,
      avgHandleTime: 120
    }
  },
  {
    id: '3',
    name: 'Product Inquiry - E-commerce',
    description: 'WhatsApp chatbot for product search, availability, and order tracking',
    status: 'approved',
    version: 1,
    channels: ['whatsapp', 'text'],
    industry: 'retail',
    updatedAt: '2025-01-06T16:45:00Z',
    updatedBy: { name: 'Mike Johnson' }
  },
  {
    id: '4',
    name: 'Inbound Call Handling (Ava)',
    description: 'Comprehensive voice flow with Ava - warm, professional banking support',
    status: 'live',
    version: 2,
    channels: ['voice'],
    industry: 'banking',
    updatedAt: '2025-01-09T08:45:00Z',
    updatedBy: { name: 'Sarah Connor' },
    metrics: {
      starts: 2847,
      completions: 2654,
      dropOffRate: 6.8,
      avgHandleTime: 180
    }
  },
  {
    id: '5',
    name: 'Outbound - Transaction Verification',
    description: 'Fraud monitoring alert for suspicious card transactions',
    status: 'live',
    version: 1,
    channels: ['voice'],
    industry: 'banking',
    updatedAt: '2025-01-09T10:15:00Z',
    updatedBy: { name: 'Sarah Connor' },
    metrics: {
      starts: 1543,
      completions: 1487,
      dropOffRate: 3.6,
      avgHandleTime: 150
    }
  },
  {
    id: '6',
    name: 'Outbound - Credit Card Upgrade',
    description: 'Marketing call offering premium card upgrades to eligible customers',
    status: 'live',
    version: 1,
    channels: ['voice'],
    industry: 'banking',
    updatedAt: '2025-01-09T10:20:00Z',
    updatedBy: { name: 'Sarah Connor' },
    metrics: {
      starts: 892,
      completions: 734,
      dropOffRate: 17.7,
      avgHandleTime: 90
    }
  },
  {
    id: '7',
    name: 'Outbound - KYC Document Reminder',
    description: 'Follow-up call for pending loan application documents',
    status: 'live',
    version: 1,
    channels: ['voice'],
    industry: 'banking',
    updatedAt: '2025-01-09T10:25:00Z',
    updatedBy: { name: 'Sarah Connor' },
    metrics: {
      starts: 1267,
      completions: 1198,
      dropOffRate: 5.4,
      avgHandleTime: 120
    }
  }
];
