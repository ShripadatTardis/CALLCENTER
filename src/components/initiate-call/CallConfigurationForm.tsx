
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Bot } from 'lucide-react';
import { CallConfiguration } from '@/types/initiateCall';
import { useAgents } from '@/hooks/agents/useAgents';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { InitiateCallButton } from './InitiateCallButton';

interface CallConfigurationFormProps {
  config: CallConfiguration;
  onPhoneNumberChange: (value: string) => void;
  onAgentChange: (value: string) => void;
  onInitiateCall: () => void;
  isLoading: boolean;
  isDisabled: boolean;
}

export const CallConfigurationForm: React.FC<CallConfigurationFormProps> = ({
  config,
  onPhoneNumberChange,
  onAgentChange,
  onInitiateCall,
  isLoading,
  isDisabled
}) => {
  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
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

      <div className="space-y-1.5">
        <Label htmlFor="aiAgent" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          AI Agent
        </Label>
        <Select value={config.selectedAgent} onValueChange={onAgentChange}>
          <SelectTrigger className="h-9">
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

      <InitiateCallButton
        onInitiateCall={onInitiateCall}
        isLoading={isLoading}
        isDisabled={isDisabled}
      />
    </div>
  );
};
