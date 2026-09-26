import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div className="text-xs text-muted-foreground px-1">
          Live agent roster — used across Voice, Chat, Customer 360 and Campaigns.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400 px-1">Could not load the agent roster.</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No agents available.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Name', 'Persona', 'Direction', 'Language', ''].map((h) => (
                    <TableHead key={h} className="text-muted-foreground text-xs">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow
                    key={agent.agentId}
                    className="cursor-pointer border-border/60 hover:bg-card focus-within:bg-card"
                  >
                    <TableCell className="font-medium text-foreground">
                      {agent.displayName}
                      {agent.isDefault && (
                        <Badge variant="outline" className="ml-2 text-xs border-slate-600 text-foreground">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground">{agent.personaName || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{formatStatusLabel(agent.direction)}</Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{agent.language || '—'}</TableCell>
                    <TableCell className="text-right pr-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-muted"
                        onClick={() => navigate(`/ai-agents/${agent.agentId}`)}
                      >
                        View →
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AIAgents;
