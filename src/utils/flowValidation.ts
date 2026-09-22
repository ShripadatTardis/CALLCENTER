import { Node, Edge } from 'reactflow';

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  severity: 'error' | 'warning';
}

export const validateFlow = (nodes: Node[], edges: Edge[]): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check for start node
  const startNodes = nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push({
      message: 'Flow must have at least one Start node',
      severity: 'error',
    });
  } else if (startNodes.length > 1) {
    errors.push({
      message: 'Flow should have only one Start node',
      severity: 'warning',
    });
  }

  // Check for end node
  const endNodes = nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    errors.push({
      message: 'Flow must have at least one End node',
      severity: 'error',
    });
  }

  // Check for orphaned nodes (no connections)
  nodes.forEach(node => {
    if (node.type === 'start' || node.type === 'end') return;
    
    const hasIncoming = edges.some(e => e.target === node.id);
    const hasOutgoing = edges.some(e => e.source === node.id);
    
    if (!hasIncoming && !hasOutgoing) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.data.label}" is not connected`,
        severity: 'warning',
      });
    }
  });

  // Check for nodes with required configuration
  nodes.forEach(node => {
    if (node.type === 'intent_router' && !node.data.config?.intents?.length) {
      errors.push({
        nodeId: node.id,
        message: `Intent Router "${node.data.label}" needs intents configured`,
        severity: 'error',
      });
    }
    
    if (node.type === 'api_call' && !node.data.config?.endpoint) {
      errors.push({
        nodeId: node.id,
        message: `API Call "${node.data.label}" needs endpoint configured`,
        severity: 'error',
      });
    }
  });

  return errors;
};
