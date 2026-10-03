
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Bot } from 'lucide-react';
import { CallConfiguration } from '@/types/initiateCall';
import { useAgents } from '@/hooks/agents/useAgents';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { InitiateCallButton } from './InitiateCallButton';
import { AgentContractInputs } from '@/components/agents/AgentContractInputs';
import type { CallAgentContract } from '@/types/campaign';

interface CallConfigurationFormProps {
  config: CallConfiguration;
  contract: CallAgentContract | null;
  onPhoneNumberChange: (value: string) => void;
  onAgentChange: (value: string) => void;
  onAgentInputChange: (fieldCode: string, value: unknown) => void;
  showValidation: boolean;
  onInitiateCall: () => void;
  isLoading: boolean;
  isDisabled: boolean;
}

export const CallConfigurationForm: React.FC<CallConfigurationFormProps> = ({
  config,
  contract,
  onPhoneNumberChange,
  onAgentChange,
  onAgentInputChange,
  showValidation,
  onInitiateCall,
  isLoading,
  isDisabled
}) => {
  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];
  return (
    <div className="space-y-3">
      {/* Session 13.3 §9 — compact side-by-side row instead of two full-
          width stacked fields, so the form doesn't grow taller than it
          needs to before Agent Inputs (which itself is only as tall as
          the selected contract requires). */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5 flex-1 min-w-[12rem]">
          <Label htmlFor="phoneNumber" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone Number
          </Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="+1234567890"
            value={config.phoneNumber}
            onChange={(e) => onPhoneNumberChange(e.target.value)}
            className={`h-9 ${
              config.phoneNumber && !validatePhoneNumber(config.phoneNumber)
                ? 'border-destructive focus-visible:ring-destructive'
                : ''
            }`}
          />
          {config.phoneNumber && !validatePhoneNumber(config.phoneNumber) && (
            <p className="text-xs text-destructive">
              Please enter a valid phone number (e.g., +1234567890)
            </p>
          )}
        </div>

        <div className="space-y-1.5 flex-1 min-w-[12rem]">
          <Label htmlFor="aiAgent" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            AI Agent
          </Label>
          <Select value={config.selectedAgent} onValueChange={onAgentChange}>
            <SelectTrigger id="aiAgent" className="h-9">
              <SelectValue placeholder={isAgentsLoading ? 'Loading agents…' : 'Select an AI Agent'} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.agentId} value={agent.agentId}>
                  {agent.displayName} ({agent.direction})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Session 13.3 — contract-driven, agent-agnostic. Renders nothing
          when the selected agent declares zero inputs (§11). */}
      <AgentContractInputs
        contract={contract}
        values={config.agentInputs}
        onChange={onAgentInputChange}
        showValidation={showValidation}
      />

      <InitiateCallButton
        onInitiateCall={onInitiateCall}
        isLoading={isLoading}
        isDisabled={isDisabled}
      />
    </div>
  );
};
