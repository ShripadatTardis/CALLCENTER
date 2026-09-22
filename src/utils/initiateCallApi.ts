
import { CallPayload } from '@/types/initiateCall';

export const generateCallPayload = (phoneNumber: string, selectedAgent: string): CallPayload => {
  return {
    assistantId: selectedAgent,
    phoneNumberId: "4c2cf29b-8394-461e-97ed-9622c47391ae",
    customer: {
      number: phoneNumber
    }
  };
};

export const makeApiCall = async (payload: string): Promise<Response> => {
  return fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 240f0732-01bd-4cbb-bb65-8aa8cc25fcd1'
    },
    body: payload
  });
};
