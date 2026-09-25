import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';

interface ChatInteractionHeaderProps {
  selectedAgentId: string;
  onAgentChange: (agentId: string) => void;
  sessionId: string | null;
  /** Locked once a session is bound — agent_id binds on the first message and the backend ignores it afterwards (Chat_Mode_API.docx). */
  isBound: boolean;
  boundAgentName: string | null;
  callerName: string;
  onCallerNameChange: (value: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (value: string) => void;
  customerIdInput: string;
  onCustomerIdInputChange: (value: string) => void;
  contactIdInput: string;
  onContactIdInputChange: (value: string) => void;
  /** Backend-returned customer_id/contact_id, once the first turn has succeeded — never fabricated. */
  resolvedCustomerId: string | null;
  resolvedContactId: string | null;
}

/**
 * Session 5.1 amendment: this header is now REAL, not structural-only.
 * Agent selector uses the live /agents roster and its selection is sent
 * as agent_id on the first Chat request; once a session is bound, the
 * selector locks and shows the backend-returned agent_name instead of
 * letting the operator switch agents mid-session (subsequent turns
 * reuse only session_id — Chat_Mode_API.docx). Customer/Contact/Phone
 * are plain operator-entered fields (this app has no other source of
 * customer/contact context to prefill from yet) sent on the first
 * request only; once the backend has responded, we show what IT
 * resolved (customer_id/contact_id), never the raw operator input again
 * — that avoids ever implying an unconfirmed guess is a confirmed
 * identity.
 */
export const ChatInteractionHeader: React.FC<ChatInteractionHeaderProps> = ({
  selectedAgentId,
  onAgentChange,
  sessionId,
  isBound,
  boundAgentName,
  callerName,
  onCallerNameChange,
  phoneNumber,
  onPhoneNumberChange,
  customerIdInput,
  onCustomerIdInputChange,
  contactIdInput,
  onContactIdInputChange,
  resolvedCustomerId,
  resolvedContactId,
}) => {
  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Agent</span>
            {isBound && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Bound to this session on the first message — the agent cannot be
                  changed mid-conversation. Start a new chat to pick a different agent.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {isBound ? (
            <div className="h-8 flex items-center text-sm font-medium truncate" title={boundAgentName ?? undefined}>
              {boundAgentName ?? selectedAgentId ?? '—'}
            </div>
          ) : (
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
          )}
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Customer ID</div>
          {isBound ? (
            <div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedCustomerId ?? undefined}>
              {resolvedCustomerId ?? '—'}
            </div>
          ) : (
            <Input
              value={customerIdInput}
              onChange={(e) => onCustomerIdInputChange(e.target.value)}
              placeholder="CIF (optional)"
              className="h-8 text-sm"
            />
          )}
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Contact ID</div>
          {isBound ? (
            <div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedContactId ?? undefined}>
              {resolvedContactId ?? '—'}
            </div>
          ) : (
            <Input
              value={contactIdInput}
              onChange={(e) => onContactIdInputChange(e.target.value)}
              placeholder="Optional"
              className="h-8 text-sm"
            />
          )}
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Caller Name / Phone</div>
          {isBound ? (
            <div className="h-8 flex items-center text-muted-foreground truncate" title={callerName || phoneNumber || undefined}>
              {callerName || phoneNumber || '—'}
            </div>
          ) : (
            <div className="flex gap-1">
              <Input
                value={callerName}
                onChange={(e) => onCallerNameChange(e.target.value)}
                placeholder="Name"
                className="h-8 text-sm"
              />
              <Input
                value={phoneNumber}
                onChange={(e) => onPhoneNumberChange(e.target.value)}
                placeholder="Phone"
                className="h-8 text-sm"
              />
            </div>
          )}
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
