export interface User {
  id: string;
  email: string;
  name: string;
  role: 'call_center_head' | 'qa_reviewer' | 'product_manager' | 'ai_operations_specialist';
  avatar?: string;
  permissions: string[];
}

export interface Call {
  id: string;
  callerNumber: string;
  callerName: string;
  intent: string;
  stage: 'connecting' | 'in-progress' | 'complete' | 'escalated';
  duration: number;
  channel: 'voice' | 'text';
  sentimentScore: number;
  csatScore?: number;
  csatRating?: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';
  csatFeedback?: string;
  aiAgentId: string;
  startTime: Date;
  endTime?: Date;
  escalationTrigger?: string;
}

export interface AIAgent {
  id: string;
  name: string;
  status: 'idle' | 'engaged' | 'awaiting_input' | 'escalation_triggered';
  currentCallId?: string;
  engagementTime: number;
  intentCluster: string;
  totalCalls: number;
  successRate: number;
}

export interface TranscriptEntry {
  timestamp: string;
  speaker: 'customer' | 'ai' | 'agent';
  text: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
}

export interface CallLog {
  id: string;
  callId: string;
  transcript: string;
  recording: string;
  tags: string[];
  outcome: 'resolved' | 'escalated' | 'dropped' | 'callback_scheduled';
  fcr: boolean;
  aht: number;
  intentAccuracy: number;
  csatScore?: number;
  csatRating?: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';
  csatFeedback?: string;
  callerName?: string;
  callerNumber?: string;
  detailedTranscript?: TranscriptEntry[];
}

export interface OutboundCampaign {
  id: string;
  name: string;
  campaignType: 'loan_emi_reminder' | 'overdue_loan_followup' | 'document_reminder' | 'cross_sell' | 'welcome_call';
  description: string;
  createdBy: string;
  launchDate: Date;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  totalContacts: number;
  callsMade: number;
  successRate: number;
  lastRunTimestamp?: Date;
  targetLanguage: string;
  scriptId: string;
  retryLogic: {
    enabled: boolean;
    maxAttempts: number;
  };
  triggerType: 'manual' | 'scheduled';
  scheduledTime?: Date;
  channel: 'voice' | 'whatsapp' | 'sms';
}

export interface CampaignContact {
  id: string;
  campaignId: string;
  name: string;
  mobileNumber: string;
  loanType?: string;
  emiAmount?: number;
  dueDate?: Date;
  language: string;
  accountId: string;
  status: 'pending' | 'called' | 'not_answered' | 'completed' | 'failed';
  callDisposition?: 'answered' | 'not_answered' | 'escalated';
  actionTaken?: 'payment_link_sent' | 'callback_requested' | 'ignored' | 'escalated';
  callTimestamp?: Date;
  callDuration?: number;
  transcriptId?: string;
  recordingId?: string;
  aiSummary?: string;
  csatScore?: number;
  csatRating?: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';
  csatFeedback?: string;
}

export interface CallScript {
  id: string;
  name: string;
  campaignType: string;
  content: string;
  language: string;
  version: string;
  placeholders: string[];
}

export interface CampaignMetrics {
  campaignId: string;
  totalCalls: number;
  answeredCalls: number;
  completedCalls: number;
  escalatedCalls: number;
  averageDuration: number;
  successRate: number;
  actionDistribution: {
    payment_link_sent: number;
    callback_requested: number;
    ignored: number;
    escalated: number;
  };
}

export interface NPSCampaign {
  id: string;
  name: string;
  description: string;
  campaignType: 'nps_survey';
  createdBy: string;
  launchDate: Date;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  targetChannel: 'voice' | 'whatsapp' | 'sms' | 'email';
  totalContacts: number;
  responseCount: number;
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  lastRunTimestamp?: Date;
  targetLanguage: string;
  scriptId: string;
  retryLogic: {
    enabled: boolean;
    maxAttempts: number;
  };
  triggerType: 'manual' | 'scheduled';
  scheduledTime?: Date;
}

export interface NPSResponse {
  id: string;
  campaignId: string;
  contactId: string;
  name: string;
  mobileNumber?: string;
  email?: string;
  npsScore: number;
  category: 'detractor' | 'passive' | 'promoter';
  feedback?: string;
  responseTimestamp: Date;
  channel: 'voice' | 'whatsapp' | 'sms' | 'email';
  callDuration?: number;
  transcriptId?: string;
  recordingId?: string;
  escalated?: boolean;
  vipTagged?: boolean;
}

export interface NPSContact {
  id: string;
  campaignId: string;
  name: string;
  mobileNumber?: string;
  email?: string;
  language: string;
  accountId: string;
  status: 'pending' | 'contacted' | 'responded' | 'failed';
  npsScore?: number;
  category?: 'detractor' | 'passive' | 'promoter';
  feedback?: string;
  contactTimestamp?: Date;
  responseTimestamp?: Date;
}

export interface NPSScript {
  id: string;
  name: string;
  type: 'voice' | 'whatsapp' | 'sms' | 'email';
  content: string;
  language: string;
  version: string;
  placeholders: string[];
}

export interface NPSMetrics {
  campaignId?: string;
  totalResponses: number;
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  promoterPercentage: number;
  passivePercentage: number;
  detractorPercentage: number;
  averageScore: number;
  responseRate: number;
}
