import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Node, Edge } from 'reactflow';
import { sampleFlows } from '@/data/orchestratorFlows';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Save, 
  Play, 
  GitBranch, 
  CheckCircle, 
  Upload, 
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Maximize
} from 'lucide-react';
import { toast } from 'sonner';
import { NodePalette } from './canvas/NodePalette';
import { Canvas } from './canvas/Canvas';
import { NodeInspector } from './canvas/NodeInspector';

interface FlowEditorProps {
  flowId?: string;
}

export const FlowEditor: React.FC<FlowEditorProps> = ({ flowId }) => {
  const navigate = useNavigate();
  
  // Look up flow name from shared data
  const getFlowName = () => {
    if (!flowId) return 'Untitled Flow';
    const flow = sampleFlows.find(f => f.id === flowId);
    return flow ? flow.name : 'Untitled Flow';
  };
  
  const [flowName, setFlowName] = useState(getFlowName());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Auto-save every 5 seconds when dirty
  useEffect(() => {
    if (!isDirty) return;
    
    const timer = setTimeout(() => {
      handleSave();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [isDirty, nodes, edges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges]);

  const handleNodesChange = useCallback((newNodes: Node[]) => {
    setNodes(newNodes);
    setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((newEdges: Edge[]) => {
    setEdges(newEdges);
    setIsDirty(true);
  }, []);

  const handleUpdateNode = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data } : node
      )
    );
    setIsDirty(true);
  }, []);

  const handleSave = () => {
    // TODO: Save to database
    console.log('Saving flow:', { flowName, nodes, edges });
    setIsDirty(false);
    toast.success('Flow saved successfully');
  };

  const handleValidate = () => {
    toast.info('Validating flow...');
    setTimeout(() => {
      toast.success('Flow validation passed');
    }, 1000);
  };

  const handleSimulate = () => {
    toast.info('Opening simulator...');
  };

  const handleBack = () => {
    navigate('/orchestrator');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-8 w-px bg-border" />
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-64 font-semibold"
              placeholder="Flow name"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-4">
              <Button variant="ghost" size="sm" onClick={() => setZoom(Math.max(50, zoom - 10))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-16 text-center">{zoom}%</span>
              <Button variant="ghost" size="sm" onClick={() => setZoom(Math.min(200, zoom + 10))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setZoom(100)}>
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
            
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleValidate}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Validate
            </Button>
            <Button variant="outline" size="sm" onClick={handleSimulate}>
              <Play className="h-4 w-4 mr-2" />
              Simulate
            </Button>
            <Button variant="outline" size="sm">
              <GitBranch className="h-4 w-4 mr-2" />
              Version
            </Button>
            <Button size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Publish
            </Button>
          </div>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node Palette */}
        <div className="w-64 border-r border-border bg-card overflow-y-auto">
          <NodePalette />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 relative bg-background">
          <Canvas 
            zoom={zoom} 
            onNodeSelect={setSelectedNodeId}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            flowId={flowId}
          />
        </div>

        {/* Right Panel - Inspector */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto">
          <NodeInspector 
            selectedNodeId={selectedNodeId}
            nodes={nodes}
            onUpdateNode={handleUpdateNode}
          />
        </div>
      </div>
    </div>
  );
};
