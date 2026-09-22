import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CallConfiguration, InitiatedCall } from '@/types/initiateCall';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { generateCallPayload, makeApiCall } from '@/utils/initiateCallApi';
import { initiateCallAgents } from '@/data/initiateCallAgents';
import { useAuth } from '@/contexts/AuthContext';

const CALL_HISTORY_KEY = 'tardis_call_history';

export const useInitiateCall = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<CallConfiguration>({
    phoneNumber: '',
    selectedAgent: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [callHistory, setCallHistory] = useState<InitiatedCall[]>([]);

  // Load call history on mount
  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem(`${CALL_HISTORY_KEY}_${user.id}`);
      if (savedHistory) {
        setCallHistory(JSON.parse(savedHistory));
      }
    }
  }, [user]);

  // Clear call history on user change (logout)
  useEffect(() => {
    if (!user) {
      setCallHistory([]);
      // Clean up all call history from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CALL_HISTORY_KEY)) {
          localStorage.removeItem(key);
        }
      });
    }
  }, [user]);

  const updatePhoneNumber = (phoneNumber: string) => {
    setConfig(prev => ({ ...prev, phoneNumber }));
  };

  const updateSelectedAgent = (selectedAgent: string) => {
    setConfig(prev => ({ ...prev, selectedAgent }));
  };

  const addToCallHistory = (call: InitiatedCall) => {
    const newHistory = [call, ...callHistory];
    setCallHistory(newHistory);
    if (user) {
      localStorage.setItem(`${CALL_HISTORY_KEY}_${user.id}`, JSON.stringify(newHistory));
    }
  };

  const initiateCall = async () => {
    if (!config.phoneNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    if (!validatePhoneNumber(config.phoneNumber)) {
      toast.error('Please enter a valid phone number');
      return;
    }

    if (!config.selectedAgent) {
      toast.error('Please select an AI agent');
      return;
    }

    setIsLoading(true);

    try {
      // Generate JSON payload
      const payload = generateCallPayload(config.phoneNumber, config.selectedAgent);
      const jsonPayload = JSON.stringify(payload);

      // Make the API call
      const response = await makeApiCall(jsonPayload);

      if (response.ok) {
        const selectedAgentName = initiateCallAgents.find(agent => agent.id === config.selectedAgent)?.name || 'Unknown Agent';
        
        // Add to call history
        const newCall: InitiatedCall = {
          id: Date.now().toString(),
          phoneNumber: config.phoneNumber,
          agentName: selectedAgentName,
          agentId: config.selectedAgent,
          timestamp: new Date(),
          status: 'initiated'
        };
        
        addToCallHistory(newCall);
        
        toast.success('Call initiated successfully!');
        // Reset phone number but keep agent selection
        setConfig(prev => ({ ...prev, phoneNumber: '' }));
      } else {
        toast.error(`Call failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('API call error:', error);
      toast.error('Failed to initiate call. Please check your network connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const isInitiateCallDisabled = isLoading || !config.phoneNumber || !validatePhoneNumber(config.phoneNumber) || !config.selectedAgent;

  return {
    config,
    isLoading,
    callHistory,
    updatePhoneNumber,
    updateSelectedAgent,
    initiateCall,
    isInitiateCallDisabled
  };
};
