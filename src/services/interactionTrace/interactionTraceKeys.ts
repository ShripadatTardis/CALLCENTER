import type { InteractionTraceChannel } from '@/types/api/interactionTrace';

export const interactionTraceKeys = {
  all: ['interaction-trace'] as const,
  detail: (interactionId: string, channel: InteractionTraceChannel) =>
    [...interactionTraceKeys.all, channel, interactionId] as const,
};
