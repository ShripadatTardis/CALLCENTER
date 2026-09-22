import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  PlayCircle, 
  Mic, 
  GitBranch, 
  BookOpen, 
  Package, 
  Lock,
  Globe,
  MessageSquare,
  Phone,
  Users,
  StopCircle,
  Split
} from 'lucide-react';

const nodeCategories = [
  {
    category: 'Core',
    nodes: [
      { type: 'start', label: 'Start', icon: PlayCircle, description: 'Flow entry point' },
      { type: 'end', label: 'End', icon: StopCircle, description: 'Graceful termination' },
    ]
  },
  {
    category: 'Input & Understanding',
    nodes: [
      { type: 'listen', label: 'Listen (NLU)', icon: Mic, description: 'Capture user input' },
      { type: 'intent_router', label: 'Intent Router', icon: GitBranch, description: 'Branch by intent' },
      { type: 'collect_dtmf', label: 'Collect DTMF', icon: Phone, description: 'Collect keypad input' },
    ]
  },
  {
    category: 'Knowledge & Data',
    nodes: [
      { type: 'kb_answer', label: 'KB Answer', icon: BookOpen, description: 'Query knowledge base' },
      { type: 'product_lookup', label: 'Product Lookup', icon: Package, description: 'Query product catalog' },
      { type: 'api_call', label: 'API Call', icon: Globe, description: 'External API integration' },
    ]
  },
  {
    category: 'Logic & Flow',
    nodes: [
      { type: 'condition', label: 'Condition', icon: Split, description: 'If/Else branching' },
      { type: 'authentication', label: 'Authentication', icon: Lock, description: 'Verify customer' },
    ]
  },
  {
    category: 'Output & Actions',
    nodes: [
      { type: 'compose_reply', label: 'Compose Reply', icon: MessageSquare, description: 'Build response' },
      { type: 'human_escalation', label: 'Escalation', icon: Users, description: 'Transfer to human' },
    ]
  }
];

export const NodePalette: React.FC = () => {
  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Node Palette</h2>
        <p className="text-sm text-muted-foreground">Drag nodes to canvas</p>
      </div>

      {nodeCategories.map((category) => (
        <div key={category.category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{category.category}</h3>
          <div className="space-y-2">
            {category.nodes.map((node) => {
              const Icon = node.icon;
              return (
                <Card
                  key={node.type}
                  className="cursor-grab active:cursor-grabbing hover:shadow-soft-md transition-shadow"
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Icon className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground">{node.label}</div>
                        <div className="text-xs text-muted-foreground">{node.description}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
