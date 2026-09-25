import type { Classification } from '@/hooks/classification/useClassification';

/**
 * Session 6.2 — pure grouping over already-authorized, already-fetched
 * interactions. This function NEVER decides what a role may see (that's
 * enforced server-side, before rows ever reach the client — see
 * api/calls/data.ts / api/chat/logs.ts / api/agents/index.ts's
 * `classification` action). It only decides how to PRESENT rows the
 * server already authorized: Domain -> Category -> Agent -> Channel,
 * with real counts. See docs/CALL_CENTRE_SESSION6_2_INTERACTION_CLASSIFICATION_PLAN.md
 * §1 for the security-vs-classification distinction this preserves.
 */

export type GroupableChannel = 'voice' | 'chat';

export interface GroupableItem {
  agentId: string | null;
  channel: GroupableChannel;
}

export interface ChannelGroup {
  channel: GroupableChannel;
  count: number;
}

export interface AgentGroup {
  agentId: string;
  agentName: string;
  channels: ChannelGroup[];
  total: number;
}

export interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  agents: AgentGroup[];
  total: number;
}

export interface DomainGroup {
  domain: string;
  categories: CategoryGroup[];
  /** Items whose agentId has no category mapping yet — surfaced, never hidden or silently dropped. */
  unclassifiedCount: number;
  total: number;
}

/**
 * `countsAreExhaustive` should be false whenever `items` is only the
 * current page of a paginated/bounded fetch (e.g. Call Logs' 50-row
 * page, or the chat-sessions page) — plan §17: a group count must never
 * be presented as a true global total when it's only counted over a
 * fetched page. The UI is responsible for labeling accordingly; this
 * function only carries the flag through unchanged.
 */
export function groupInteractions(
  items: GroupableItem[],
  classification: Classification | undefined,
  agentsById: Map<string, { agentId: string; displayName: string }>,
): DomainGroup {
  const domain = classification?.domain ?? 'Banking & Financial Services';
  const categories = classification?.categories ?? [];

  const agentToCategory = new Map<string, { id: string; name: string }>();
  for (const cat of categories) {
    for (const agentId of cat.agentIds) {
      agentToCategory.set(agentId, { id: cat.id, name: cat.name });
    }
  }

  // categoryId -> agentId -> channel -> count
  const buckets = new Map<string, Map<string, Map<GroupableChannel, number>>>();
  let unclassifiedCount = 0;

  for (const item of items) {
    if (!item.agentId) {
      unclassifiedCount += 1;
      continue;
    }
    const cat = agentToCategory.get(item.agentId);
    if (!cat) {
      unclassifiedCount += 1;
      continue;
    }
    if (!buckets.has(cat.id)) buckets.set(cat.id, new Map());
    const byAgent = buckets.get(cat.id)!;
    if (!byAgent.has(item.agentId)) byAgent.set(item.agentId, new Map());
    const byChannel = byAgent.get(item.agentId)!;
    byChannel.set(item.channel, (byChannel.get(item.channel) ?? 0) + 1);
  }

  const categoryGroups: CategoryGroup[] = categories
    .map((cat) => {
      const byAgent = buckets.get(cat.id);
      if (!byAgent || byAgent.size === 0) return null;
      const agentGroups: AgentGroup[] = Array.from(byAgent.entries()).map(([agentId, byChannel]) => {
        const channels = Array.from(byChannel.entries()).map(([channel, count]) => ({ channel, count }));
        return {
          agentId,
          agentName: agentsById.get(agentId)?.displayName ?? agentId,
          channels,
          total: channels.reduce((a, c) => a + c.count, 0),
        };
      });
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        agents: agentGroups,
        total: agentGroups.reduce((a, g) => a + g.total, 0),
      };
    })
    .filter((g): g is CategoryGroup => g !== null);

  return {
    domain,
    categories: categoryGroups,
    unclassifiedCount,
    total: categoryGroups.reduce((a, c) => a + c.total, 0) + unclassifiedCount,
  };
}
