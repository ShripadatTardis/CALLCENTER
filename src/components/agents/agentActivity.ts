import type { Interaction } from '@/types/interaction';

export function countActiveCallsByAgent(interactions: Interaction[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const interaction of interactions) {
    if (!interaction.agentId) continue;
    counts.set(interaction.agentId, (counts.get(interaction.agentId) ?? 0) + 1);
  }
  return counts;
}
