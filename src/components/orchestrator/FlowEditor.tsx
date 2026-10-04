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
    // App-wide viewport-framing correction (follow-up to Session 15): this
    // already had the right internal flex-1/overflow structure, it was
    // just sized against the browser viewport (h-screen) instead of
    // Layout's own <main> region — h-screen here stacked on top of the
    // outer h-screen shell, which is the "double full-viewport" variant
    // of the same bug the rest of this correction fixes.
    <div className="h-full min-h-0 flex flex-col bg-background">
      {/* Toolbar — flex-wrap so all controls stay reachable at narrow
          widths instead of running off-screen (found during Session
          10.5B's responsive survey: this row has no wrap/scroll handling
          and is wider than a 390px viewport as a single line). */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-40 sm:w-64 font-semibold"
              placeholder="Flow name"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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

      {/* Main Editor. RESPONSIVE VIEWING / LIMITED EDITING at narrow
          widths (Session 10.5B classification, presentation-only fix,
          engine untouched): the palette and inspector are fixed-width
          (256px + 320px = 576px) panels that cannot fit alongside a usable
          canvas below the `lg` breakpoint, so they are hidden there —
          the canvas gets the full viewport and remains visible/pannable,
          but dragging new nodes from the palette or editing a selected
          node's properties requires a tablet/desktop-width viewport. This
          is an honest limitation, not a fake mobile-editing experience;
          closing it fully (e.g. temporary drawers for both panels) is
          deferred as documented follow-up, not attempted here given this
          is the highest-regression-risk surface in the app. */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node Palette */}
        <div className="hidden lg:block w-64 border-r border-border bg-card overflow-y-auto">
          <NodePalette />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 relative bg-background min-w-0">
          <Canvas
            zoom={zoom}
            onNodeSelect={setSelectedNodeId}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            flowId={flowId}
          />
        </div>

        {/* Right Panel - Inspector */}
        <div className="hidden lg:block w-80 border-l border-border bg-card overflow-y-auto">
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
