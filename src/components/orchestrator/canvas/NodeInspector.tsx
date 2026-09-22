import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Plus, X } from 'lucide-react';

interface NodeInspectorProps {
  selectedNodeId: string | null;
  nodes: Node[];
  onUpdateNode: (nodeId: string, data: any) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ selectedNodeId, nodes, onUpdateNode }) => {
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const [localData, setLocalData] = useState<any>(selectedNode?.data || {});

  useEffect(() => {
    setLocalData(selectedNode?.data || {});
  }, [selectedNode]);

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Settings className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-medium text-foreground mb-2">No Node Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a node on the canvas to view and edit its properties
          </p>
        </div>
      </div>
    );
  }

  const handleUpdate = (field: string, value: any) => {
    const newData = { ...localData, [field]: value };
    setLocalData(newData);
    onUpdateNode(selectedNode.id, newData);
  };

  const handleConfigUpdate = (configField: string, value: any) => {
    const newConfig = { ...(localData.config || {}), [configField]: value };
    handleUpdate('config', newConfig);
  };

  const addIntent = () => {
    const intents = localData.config?.intents || [];
    handleConfigUpdate('intents', [...intents, `Intent ${intents.length + 1}`]);
  };

  const removeIntent = (index: number) => {
    const intents = localData.config?.intents || [];
    handleConfigUpdate('intents', intents.filter((_: any, i: number) => i !== index));
  };

  const updateIntent = (index: number, value: string) => {
    const intents = [...(localData.config?.intents || [])];
    intents[index] = value;
    handleConfigUpdate('intents', intents);
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Node Inspector</h2>
        <p className="text-sm text-muted-foreground">Configure selected node</p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{localData.label}</CardTitle>
            <Badge variant="outline" className={localData.hasError ? 'border-destructive text-destructive' : 'badge-green'}>
              {localData.hasError ? 'Invalid' : 'Valid'}
            </Badge>
          </div>
          <Badge variant="outline" className="w-fit mt-1">{selectedNode.type}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input 
              id="node-name" 
              value={localData.label || ''} 
              onChange={(e) => handleUpdate('label', e.target.value)}
              placeholder="Enter node name" 
            />
          </div>

          {selectedNode.type === 'intent_router' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Intents</Label>
                <Button size="sm" variant="outline" onClick={addIntent}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {(localData.config?.intents || []).map((intent: string, idx: number) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={intent}
                      onChange={(e) => updateIntent(idx, e.target.value)}
                      placeholder={`Intent ${idx + 1}`}
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeIntent(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode.type === 'api_call' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint</Label>
                <Input
                  id="endpoint"
                  value={localData.config?.endpoint || ''}
                  onChange={(e) => handleConfigUpdate('endpoint', e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="method">Method</Label>
                <Select 
                  value={localData.config?.method || 'GET'}
                  onValueChange={(value) => handleConfigUpdate('method', value)}
                >
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {(selectedNode.type === 'compose_reply' || selectedNode.type === 'listen') && (
            <div className="space-y-2">
              <Label htmlFor="message">Message Template</Label>
              <Textarea
                id="message"
                value={localData.config?.message || ''}
                onChange={(e) => handleConfigUpdate('message', e.target.value)}
                placeholder="Enter message template..."
                className="min-h-24"
              />
            </div>
          )}

          {selectedNode.type === 'condition' && (
            <div className="space-y-2">
              <Label htmlFor="expression">Condition Expression</Label>
              <Input
                id="expression"
                value={localData.config?.expression || ''}
                onChange={(e) => handleConfigUpdate('expression', e.target.value)}
                placeholder="e.g., balance > 1000"
              />
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Logging</Label>
              <p className="text-xs text-muted-foreground">Log all interactions at this node</p>
            </div>
            <Switch 
              checked={localData.config?.logging || false}
              onCheckedChange={(checked) => handleConfigUpdate('logging', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Hits</span>
            <span className="text-sm font-medium text-foreground">1,234</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Avg Latency</span>
            <span className="text-sm font-medium text-foreground">45ms</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Error Rate</span>
            <span className="text-sm font-medium text-foreground">0.2%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
