
import React from 'react';
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
  /** Optional — when provided, each agent card becomes a keyboard/mouse-activatable
   * link (e.g. Dashboard navigating to Agent Detail). Omitted callers (Live View)
   * keep the existing non-interactive card exactly as before. */
  onAgentClick?: (agentId: string) => void;
  /**
   * Session 11.1A (VoiceForce Operational Grid & Density Standard): 'cards'
   * (default) is the original catalogue-card grid, used unchanged by Live
   * View. 'compact' is the dense "Agent Load" row treatment used by
   * Dashboard — name + active-call count only, one row per agent, no
   * direction/language/persona (full metadata remains available via
   * Agent Detail). Existing callers that don't pass `variant` are
   * completely unaffected.
   */
  variant?: 'cards' | 'compact';
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
  onAgentClick,
  variant = 'cards',
}) => {
  const activeCounts = countActiveCallsByAgent(activeInteractions);

  if (variant === 'compact') {
    return (
      <div className="rounded-md border border-border bg-card p-2.5 space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
          <Bot className="h-3.5 w-3.5" />
          {title}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No agents available.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {agents.map((agent) => {
              const activeCount = activeCounts.get(agent.agentId) ?? 0;
              const clickable = Boolean(onAgentClick);
              const Row = clickable ? 'button' : 'div';
              return (
                <Row
                  key={agent.agentId}
                  {...(clickable ? { type: 'button' as const } : {})}
                  className={`w-full flex items-center justify-between gap-2 py-1.5 px-1 text-left rounded-sm ${
                    clickable ? 'cursor-pointer hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400' : ''
                  }`}
                  {...(clickable
                    ? {
                        onClick: () => onAgentClick?.(agent.agentId),
                        'aria-label': `View ${agent.displayName} detail — ${activeCount} active call${activeCount === 1 ? '' : 's'}`,
                      }
                    : {})}
                >
                  <span className="text-sm text-foreground truncate">{agent.displayName}</span>
                  <span
                    className={`text-sm tabular-nums flex-shrink-0 ${activeCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                  >
                    {activeCount}
                  </span>
                </Row>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Bot className="h-3.5 w-3.5" />
        {title}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {agents.map((agent) => {
            const activeCount = activeCounts.get(agent.agentId) ?? 0;
            const clickable = Boolean(onAgentClick);
            return (
              <div
                key={agent.agentId}
                className={`min-w-0 border border-border rounded-md p-2.5 space-y-1.5 bg-background/40 ${
                  clickable ? 'cursor-pointer hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400' : ''
                }`}
                {...(clickable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onAgentClick?.(agent.agentId),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onAgentClick?.(agent.agentId);
                        }
                      },
                      'aria-label': `View ${agent.displayName} detail`,
                    }
                  : {})}
              >
                <h3 className="font-medium text-sm text-foreground break-words leading-snug">{agent.displayName}</h3>
                <Badge
                  variant={activeCount > 0 ? 'default' : 'outline'}
                  className="whitespace-nowrap text-xs"
                >
                  {activeCount} active call{activeCount === 1 ? '' : 's'}
                </Badge>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Direction: {agent.direction}</div>
                  {agent.language && <div>Language: {agent.language}</div>}
                  {agent.personaName && <div>Persona: {agent.personaName}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
