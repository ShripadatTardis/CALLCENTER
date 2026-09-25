import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';

interface ChatInteractionHeaderProps {
  selectedAgentId: string;
  onAgentChange: (agentId: string) => void;
  sessionId: string | null;
}

/**
 * Structural readiness only — plan amendment: the Chat Console should
 * carry the same interaction-identity fields as Initiate Call
 * (Agent/Customer/Contact/Session ID) even though POST /api/v1/chat
 * doesn't accept agent_id or customer identity yet (plan §2/§13).
 *
 * Agent uses the real GET /agents roster (useAgents, same hook Initiate
 * Call uses) — but the selection is NEVER sent to /api/chat (see
 * src/services/chat/chatService.ts: sendChatMessage only ever sends
 * {message, session_id}). This is intentionally cosmetic/structural
 * until the backend adds agent_id support — the tooltip below says so
 * explicitly so nobody mistakes the dropdown for live agent routing.
 *
 * Customer/Contact are always "—": the backend has no customer/contact
 * identity field in /chat at all (plan §2), so there is nothing to
 * select or fetch — showing a value here would be fabrication.
 *
 * Session ID is the real upstream session_id, populated only after the
 * first successful turn — never a placeholder/guessed value.
 */
export const ChatInteractionHeader: React.FC<ChatInteractionHeaderProps> = ({
  selectedAgentId,
  onAgentChange,
  sessionId,
}) => {
  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Agent</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Not yet sent to the AI — the current Chat API does not accept an agent
                selection. This selection does not control which agent responds.
              </TooltipContent>
            </Tooltip>
          </div>
          <Select value={selectedAgentId} onValueChange={onAgentChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={isAgentsLoading ? 'Loading…' : 'Select agent'} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.agentId} value={agent.agentId} className="text-sm">
                  {agent.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Customer</div>
          <div className="h-8 flex items-center text-muted-foreground">—</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Contact / Phone</div>
          <div className="h-8 flex items-center text-muted-foreground">—</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Session ID</div>
          <div className="h-8 flex items-center font-mono text-xs truncate" title={sessionId ?? undefined}>
            {sessionId ?? <span className="text-muted-foreground font-sans">Not started</span>}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
