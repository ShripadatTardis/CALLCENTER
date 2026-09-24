
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Loader2 } from 'lucide-react';
import type { AgentSummary } from '@/services/agents/agentsMapper';
import type { Interaction } from '@/types/interaction';
import { countActiveCallsByAgent } from './agentActivity';

interface AgentActivityPanelProps {
  agents: AgentSummary[];
  activeInteractions: Interaction[];
  isLoading?: boolean;
  title?: string;
}

/**
 * Replaces the previous fake "AI Agent Status" treatment (Engaged /
 * Idle / Awaiting Input / Escalation Triggered — none of which the
 * backend supports as a per-agent state, per the Session 3 product
 * decision). Shows only backend-supported or safely-derived fields:
 * agent identity/direction/language (from GET /api/v1/agents) and a
 * current active-call count derived by grouping live
 * call-data?status=active rows by agent_id. No status label is shown
 * for an agent with zero active calls — "0 active calls" is a fact,
 * not an inferred "Idle" state.
 *
 * Session 3.5: name and count badge are on separate rows (not a
 * cramped flex-justify-between) — the default shadcn Badge is
 * rounded-full, and squeezing "N active calls" next to a long agent
 * name wrapped it into an overlapping circular blob at narrower card
 * widths. whitespace-nowrap + its own row fixes this regardless of
 * name length or viewport width.
 */
export const AgentActivityPanel: React.FC<AgentActivityPanelProps> = ({
  agents,
  activeInteractions,
  isLoading,
  title = 'AI Agent Roster',
}) => {
  const activeCounts = countActiveCallsByAgent(activeInteractions);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {agents.map((agent) => {
              const activeCount = activeCounts.get(agent.agentId) ?? 0;
              return (
                <div key={agent.agentId} className="min-w-0 border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold break-words leading-snug">{agent.displayName}</h3>
                  <Badge
                    variant={activeCount > 0 ? 'default' : 'outline'}
                    className="whitespace-nowrap"
                  >
                    {activeCount} active call{activeCount === 1 ? '' : 's'}
                  </Badge>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <div>Direction: {agent.direction}</div>
                    {agent.language && <div>Language: {agent.language}</div>}
                    {agent.personaName && <div>Persona: {agent.personaName}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
