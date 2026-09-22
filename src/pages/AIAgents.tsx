import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AgentConfiguration } from '@/components/ai-agents/AgentConfiguration';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Settings, Play, Pause } from 'lucide-react';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';

const AIAgents: React.FC = () => {
  const { agents } = useIndustryData();
  const { getTerminology } = useIndustryTerminology();
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const handleConfigureAgent = (agent: any) => {
    setSelectedAgent(agent);
    setShowConfiguration(true);
  };

  const handleCreateAgent = () => {
    setSelectedAgent(null);
    setShowConfiguration(true);
  };

  // Convert industry agents to display format
  const displayAgents = agents.map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    intentCluster: agent.capabilities?.[0] || agent.description || 'General Support',
    status: index === 0 ? 'engaged' : index === 1 ? 'idle' : 'awaiting_input',
    successRate: (Math.random() * 0.2 + 0.8), // Random between 0.8-1.0
    totalCalls: Math.floor(Math.random() * 100) + 50,
    engagementTime: Math.floor(Math.random() * 300) + 60
  }));

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">AI Agents</h1>
            <p className="text-muted-foreground">
              Manage and configure your voice AI agents
            </p>
          </div>
          <Button onClick={handleCreateAgent}>
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Intent Cluster</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{agent.intentCluster}</TableCell>
                    <TableCell>
                      <Badge variant={agent.status === 'engaged' ? 'default' : 'secondary'}>
                        {agent.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{(agent.successRate * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleConfigureAgent(agent)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          {agent.status === 'engaged' ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AgentConfiguration
          isOpen={showConfiguration}
          onClose={() => setShowConfiguration(false)}
          agentId={selectedAgent?.id || ''}
          agentName={selectedAgent?.name || 'New Agent'}
        />
      </div>
    </Layout>
  );
};

export default AIAgents;
