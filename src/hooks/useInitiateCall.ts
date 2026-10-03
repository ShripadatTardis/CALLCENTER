import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CallConfiguration } from '@/types/initiateCall';
import { validatePhoneNumber } from '@/utils/initiateCallValidation';
import { useTriggerCall } from '@/hooks/calls/useTriggerCall';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { buildDeclaredAgentInputs, validateAgentContractInputs } from '@/lib/agentContractInputs';
import { isApiError } from '@/services/transport/errors';
import type { CallAgentContract } from '@/types/campaign';

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
 *
 * Session 13.3 — Initiate Call is now Agent-Contract-aware (DEC-AGENT-01
 * amendment). The selected agent's real contract (the same
 * `buildAgentContractFromRoster` shape Campaign Configuration and Agent
 * Detail already use) drives a dynamic Agent Inputs section; its
 * declared, non-empty values are sent as `agent_inputs` on the Trigger
 * Call request, using the exact same "never send an undeclared field,
 * omit entirely when nothing applies" discipline as the Campaign Runner
 * (src/lib/agentContractInputs.ts mirrors
 * src/server/campaigns/triggerCallPayload.ts on purpose).
 */
export const useInitiateCall = () => {
  const [config, setConfig] = useState<CallConfiguration>({
    phoneNumber: '',
    selectedAgent: '',
    agentInputs: {},
  });
  const [showValidation, setShowValidation] = useState(false);
  const [lastTriggeredCall, setLastTriggeredCall] = useState<LastTriggeredCall | null>(null);
  // Tracks which fields the operator has actually typed into, so a later
  // customer-prefill resolution never clobbers real operator input (§5).
  const touchedInputFields = useRef<Set<string>>(new Set());

  const triggerCallMutation = useTriggerCall();
  const recentCalls = useCallData({ page_size: 5 });
  const agents = useAgents();

  const selectedAgentSummary = agents.data?.agents.find((a) => a.agentId === config.selectedAgent) ?? null;
  const contract: CallAgentContract | null = selectedAgentSummary ? buildAgentContractFromRoster(selectedAgentSummary) : null;

  const statusPoll = useInteractionTranscript(lastTriggeredCall?.interactionId, {
    enabled: Boolean(lastTriggeredCall),
    poll: Boolean(lastTriggeredCall),
  });

  // Session 13.3 §5/§6 — customer-aware prefill. Resolves the entered
  // phone number to an existing Customer360 record through the existing,
  // already-authoritative customer search path (the same one Customers.tsx
  // uses) — never a new lookup mechanism. Only fires once the phone looks
  // valid, to avoid a search-per-keystroke against a partial number.
  const customerLookup = useCustomers(
    validatePhoneNumber(config.phoneNumber) ? config.phoneNumber : undefined,
    1,
  );
  const resolvedCustomer = customerLookup.data?.data.length === 1 ? customerLookup.data.data[0] : null;

  useEffect(() => {
    // Only ever prefill `customer_name`, and only when: the contract
    // genuinely declares that field, Customer360 resolved exactly one
    // match with a genuine (non-null) displayName, and the operator has
    // not already typed into that field themselves. No other field is
    // ever prefilled — EMI/loan attributes have no Customer360 source
    // (§5) and are never guessed by field-name similarity.
    if (!contract) return;
    const nameField = contract.expectedInputFields.find((f) => f.fieldCode === 'customer_name');
    if (!nameField) return;
    if (!resolvedCustomer?.displayName) return;
    if (touchedInputFields.current.has('customer_name')) return;
    setConfig((prev) =>
      prev.agentInputs.customer_name === resolvedCustomer.displayName
        ? prev
        : { ...prev, agentInputs: { ...prev.agentInputs, customer_name: resolvedCustomer.displayName } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.agentId, resolvedCustomer?.id, resolvedCustomer?.displayName]);

  const updatePhoneNumber = (phoneNumber: string) => {
    setConfig((prev) => ({ ...prev, phoneNumber }));
  };

  const updateSelectedAgent = (selectedAgent: string) => {
    // §10 — a full reset on agent change: correctness over clever
    // per-field retention. A value typed for one agent's contract has
    // no guaranteed meaning under a different agent's contract, even if
    // a field code happens to match.
    touchedInputFields.current = new Set();
    setShowValidation(false);
    setConfig((prev) => ({ ...prev, selectedAgent, agentInputs: {} }));
  };

  const updateAgentInput = (fieldCode: string, value: unknown) => {
    touchedInputFields.current.add(fieldCode);
    setConfig((prev) => ({ ...prev, agentInputs: { ...prev.agentInputs, [fieldCode]: value } }));
  };

  const inputValidation = useMemo(() => validateAgentContractInputs(contract, config.agentInputs), [contract, config.agentInputs]);

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

    if (!inputValidation.isValid) {
      setShowValidation(true);
      toast.error('Please fill in the required Agent Inputs');
      return;
    }

    const agentDisplayName = selectedAgentSummary?.displayName ?? config.selectedAgent;
    const phoneNumber = config.phoneNumber;
    // §7 — the same declared-field-filtering discipline the Campaign
    // Runner's triggerCallPayload.ts already uses; never a second,
    // incompatible interpretation of `agent_inputs`.
    const agentInputs = buildDeclaredAgentInputs(contract, config.agentInputs);

    try {
      const result = await triggerCallMutation.mutateAsync({
        to_phone_number: phoneNumber,
        agent_id: config.selectedAgent,
        ...(agentInputs ? { agent_inputs: agentInputs } : {}),
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
        touchedInputFields.current = new Set();
        setShowValidation(false);
        setConfig((prev) => ({ ...prev, phoneNumber: '', agentInputs: {} }));
      } else {
        toast.error('Call was not accepted by the backend');
      }
    } catch (error) {
      console.error('Trigger call error:', error);
      // §8 — backend remains authoritative; its real error message is
      // surfaced as-is, never replaced by a generic client-side message.
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
    contract,
    isLoading: triggerCallMutation.isPending,
    callHistory: recentCalls.data?.interactions ?? [],
    isCallHistoryLoading: recentCalls.isLoading,
    callHistoryError: recentCalls.isError ? recentCalls.error : null,
    refetchCallHistory: recentCalls.refetch,
    updatePhoneNumber,
    updateSelectedAgent,
    updateAgentInput,
    showValidation,
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
