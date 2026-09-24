import { useState } from 'react';
import { toast } from 'sonner';
import { CallConfiguration } from '@/types/initiateCall';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { useTriggerCall } from '@/hooks/calls/useTriggerCall';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { isApiError } from '@/services/transport/errors';

export interface LastTriggeredCall {
  interactionId: string;
  phoneNumber: string;
  agentId: string;
  agentDisplayName: string;
  initialStatus: string;
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return 'Failed to initiate call';
}

/**
 * Session 2 built the live trigger-call mutation and the reusable
 * post-trigger polling hook (useInteractionTranscript with poll: true),
 * but never actually wired the polling into this hook's return value or
 * into InitiateCall.tsx — closing that gap here per Session 3.5 §3.
 */
export const useInitiateCall = () => {
  const [config, setConfig] = useState<CallConfiguration>({
    phoneNumber: '',
    selectedAgent: '',
  });
  const [lastTriggeredCall, setLastTriggeredCall] = useState<LastTriggeredCall | null>(null);

  const triggerCallMutation = useTriggerCall();
  const recentCalls = useCallData({ page_size: 5 });
  const agents = useAgents();

  const statusPoll = useInteractionTranscript(lastTriggeredCall?.interactionId, {
    enabled: Boolean(lastTriggeredCall),
    poll: Boolean(lastTriggeredCall),
  });

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

    const agentDisplayName =
      agents.data?.agents.find((a) => a.agentId === config.selectedAgent)?.displayName ?? config.selectedAgent;
    const phoneNumber = config.phoneNumber;

    try {
      const result = await triggerCallMutation.mutateAsync({
        to_phone_number: phoneNumber,
        agent_id: config.selectedAgent,
      });

      if (result.success) {
        setLastTriggeredCall({
          interactionId: result.interactionId,
          phoneNumber,
          agentId: config.selectedAgent,
          agentDisplayName,
          initialStatus: result.status,
        });
        toast.success(`Call initiated to ${phoneNumber} — status: ${result.status}`);
        setConfig((prev) => ({ ...prev, phoneNumber: '' }));
      } else {
        toast.error('Call was not accepted by the backend');
      }
    } catch (error) {
      console.error('Trigger call error:', error);
      toast.error(errorMessage(error));
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
    callHistoryError: recentCalls.isError ? recentCalls.error : null,
    refetchCallHistory: recentCalls.refetch,
    updatePhoneNumber,
    updateSelectedAgent,
    initiateCall,
    isInitiateCallDisabled,
    // Post-trigger status feedback (Session 3.5 §3).
    lastTriggeredCall,
    dismissLastTriggeredCall: () => setLastTriggeredCall(null),
    triggerError: triggerCallMutation.isError ? errorMessage(triggerCallMutation.error) : null,
    postTriggerStatus: statusPoll.data?.status,
    isPostTriggerPollCapped: statusPoll.isPollingCapped,
    isPostTriggerPolling: statusPoll.isFetching,
    refetchPostTriggerStatus: statusPoll.refetch,
  };
};
