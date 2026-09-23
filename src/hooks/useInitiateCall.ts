import { useState } from 'react';
import { toast } from 'sonner';
import { CallConfiguration } from '@/types/initiateCall';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { useTriggerCall } from '@/hooks/calls/useTriggerCall';
import { useCallData } from '@/hooks/calls/useCallData';

/**
 * Session 2: replaces the Vapi fetch (src/utils/initiateCallApi.ts,
 * removed) with the live POST /api/calls/trigger mutation, and replaces
 * localStorage call history with the same live call-data query Call
 * Logs uses (small page size, no filters) — see the Session 2 plan §3
 * for why: history was never a real system of record, and a
 * just-triggered call now surfaces here naturally once the mutation
 * invalidates the calls list.
 */
export const useInitiateCall = () => {
  const [config, setConfig] = useState<CallConfiguration>({
    phoneNumber: '',
    selectedAgent: '',
  });

  const triggerCallMutation = useTriggerCall();
  const recentCalls = useCallData({ page_size: 5 });

  const updatePhoneNumber = (phoneNumber: string) => {
    setConfig((prev) => ({ ...prev, phoneNumber }));
  };

  const updateSelectedAgent = (selectedAgent: string) => {
    setConfig((prev) => ({ ...prev, selectedAgent }));
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

    try {
      const result = await triggerCallMutation.mutateAsync({
        to_phone_number: config.phoneNumber,
        agent_id: config.selectedAgent,
      });

      if (result.success) {
        toast.success(`Call initiated — status: ${result.status}`);
        setConfig((prev) => ({ ...prev, phoneNumber: '' }));
      } else {
        toast.error('Call was not accepted by the backend');
      }
    } catch (error) {
      console.error('Trigger call error:', error);
      const message = error instanceof Error ? error.message : 'Failed to initiate call';
      toast.error(message);
    }
  };

  const isInitiateCallDisabled =
    triggerCallMutation.isPending ||
    !config.phoneNumber ||
    !validatePhoneNumber(config.phoneNumber) ||
    !config.selectedAgent;

  return {
    config,
    isLoading: triggerCallMutation.isPending,
    callHistory: recentCalls.data?.interactions ?? [],
    isCallHistoryLoading: recentCalls.isLoading,
    updatePhoneNumber,
    updateSelectedAgent,
    initiateCall,
    isInitiateCallDisabled,
    /** Result of the most recent trigger, for the short-lived post-trigger poll (see InitiateCall.tsx). */
    lastTriggeredInteractionId: triggerCallMutation.data?.interactionId,
  };
};
