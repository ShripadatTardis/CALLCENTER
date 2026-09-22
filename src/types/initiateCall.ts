export interface AIAgent {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  capabilities?: string[];
}

export interface CallConfiguration {
  phoneNumber: string;
  selectedAgent: string;
}

export interface CallPayload {
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
  };
}

export interface InitiatedCall {
  id: string;
  phoneNumber: string;
  agentName: string;
  agentId: string;
  timestamp: Date;
  status: 'initiated' | 'completed' | 'failed';
}
