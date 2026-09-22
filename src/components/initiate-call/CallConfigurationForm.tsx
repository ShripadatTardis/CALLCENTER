
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Bot } from 'lucide-react';
import { CallConfiguration } from '@/types/initiateCall';
import { useIndustryData } from '@/hooks/useIndustryData';
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
  const { agents } = useIndustryData();
  return (
    <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-lg">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Phone className="h-5 w-5 text-blue-600" />
          Call Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phoneNumber" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Phone className="h-4 w-4 text-blue-600" />
            Phone Number
          </Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="+1234567890"
            value={config.phoneNumber}
            onChange={(e) => onPhoneNumberChange(e.target.value)}
            className={`text-base h-10 ${
              config.phoneNumber && !validatePhoneNumber(config.phoneNumber) 
                ? 'border-red-500 focus:border-red-500' 
                : 'border-blue-300 focus:border-blue-500'
            }`}
          />
          {config.phoneNumber && !validatePhoneNumber(config.phoneNumber) && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
              Please enter a valid phone number (e.g., +1234567890)
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="aiAgent" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-600" />
            AI Agent
          </Label>
          <Select value={config.selectedAgent} onValueChange={onAgentChange}>
            <SelectTrigger className="h-10 text-base border-blue-300 focus:border-blue-500">
              <SelectValue placeholder="Select an AI Agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id} className="text-base py-2">
                  {agent.name}
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
      </CardContent>
    </Card>
  );
};
