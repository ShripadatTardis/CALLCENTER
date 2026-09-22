// AI Conversation Orchestrator Types

export type FlowStatus = 'draft' | 'approved' | 'live' | 'archived';
export type FlowChannel = 'voice' | 'text' | 'whatsapp';
export type IntegrationType = 'kb' | 'product' | 'api';
export type RunType = 'simulate' | 'live';
export type RunOutcome = 'success' | 'failure' | 'timeout' | 'escalated';

export type NodeType =
  | 'start'
  | 'listen'
  | 'intent_router'
  | 'kb_answer'
  | 'product_lookup'
  | 'authentication'
  | 'api_call'
  | 'condition'
  | 'compose_reply'
  | 'collect_dtmf'
  | 'human_escalation'
  | 'end';

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodePort {
  id: string;
  label: string;
}

export interface NodeConfig {
  [key: string]: any;
}

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  position: NodePosition;
  config: NodeConfig;
  inputs?: NodePort[];
  outputs?: NodePort[];
}

export interface Edge {
  id: string;
  from: {
    nodeId: string;
    port: string;
  };
  to: {
    nodeId: string;
    port: string;
  };
  guard?: string; // expression
}

export interface FlowSettings {
  localeDefault: string;
  maxTurns?: number;
  piiRedaction: boolean;
  escalationConfidence?: number;
  timeouts: {
    listenMs: number;
    apiMs: number;
  };
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
}

export interface ApprovalEvent {
  id: string;
  reviewer: UserRef;
  action: 'approved' | 'requested_changes' | 'rejected';
  comment?: string;
  createdAt: string;
}

export interface ChangeEntry {
  timestamp: string;
  user: UserRef;
  summary: string;
  diff?: any;
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  status: FlowStatus;
  version: number;
  industry: string;
  channels: FlowChannel[];
  tags?: string[];
  nodes: Node[];
  edges: Edge[];
  settings: FlowSettings;
  createdBy: UserRef;
  updatedBy: UserRef;
  createdAt: string;
  updatedAt: string;
  approvals?: ApprovalEvent[];
  changelog?: ChangeEntry[];
}

export interface FlowVersion {
  id: string;
  flowId: string;
  version: number;
  flowJson: Flow;
  statusAtVersion: FlowStatus;
  approvedBy?: UserRef;
  approvedAt?: string;
  publishedBy?: UserRef;
  publishedAt?: string;
  changelog?: string;
  createdAt: string;
}

export interface Snippet {
  id: string;
  name: string;
  tags: string[];
  snippetJson: {
    nodes: Node[];
    edges: Edge[];
  };
  owner: UserRef;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  env: 'dev' | 'stage' | 'prod';
  config: {
    baseUrl?: string;
    authMethod?: string;
    schema?: any;
    [key: string]: any;
  };
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failure';
  createdBy: UserRef;
  updatedBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionTrace {
  nodeId: string;
  nodeName: string;
  timestamp: string;
  inputs?: any;
  outputs?: any;
  duration?: number;
  error?: string;
}

export interface SimulationRun {
  id: string;
  flowId: string;
  version: number;
  runType: RunType;
  input?: any;
  trace?: ExecutionTrace[];
  outcome?: RunOutcome;
  durationMs?: number;
  createdBy?: UserRef;
  createdAt: string;
}

export interface FlowMetrics {
  starts: number;
  completions: number;
  dropOffRate: number;
  avgHandleTime: number;
  avgTurns: number;
  errorRate: number;
}
