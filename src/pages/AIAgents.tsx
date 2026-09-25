import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';
import { formatStatusLabel } from '@/lib/format';

/**
 * Real /api/v1/agents roster — replaces the previous entirely-mock page
 * (fake status by row index, Math.random() success rate/calls/engagement
 * time, no-op Create/Configure/Play/Pause controls; see
 * docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md §1/§2). The roster is
 * read-only (no documented create/update/delete API) — there is no
 * "Create Agent" action, and each row links to a real operational
 * AgentDetail view instead of a no-op configuration dialog.
 */
const AIAgents: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAgents();
  const agents = data?.agents ?? [];

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground">
            The live agent roster used across Voice, Chat, Customer 360 and Campaigns.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agent Roster</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <p className="text-sm text-destructive">Could not load the agent roster.</p>
            ) : agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Persona</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.agentId}>
                      <TableCell className="font-medium">
                        {agent.displayName}
                        {agent.isDefault && (
                          <Badge variant="outline" className="ml-2">
                            Default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{agent.personaName || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{formatStatusLabel(agent.direction)}</Badge>
                      </TableCell>
                      <TableCell>{agent.language || '—'}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/ai-agents/${agent.agentId}`)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AIAgents;
