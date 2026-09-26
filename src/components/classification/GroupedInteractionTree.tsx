import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Phone, MessageCircle } from 'lucide-react';
import type { DomainGroup, GroupableChannel } from '@/lib/interactionGrouping';

export interface SelectedGroup {
  agentId: string;
  channel: GroupableChannel;
}

interface GroupedInteractionTreeProps {
  group: DomainGroup;
  selected: SelectedGroup | null;
  onSelect: (selection: SelectedGroup | null) => void;
  /** False when `group`'s counts are only over a fetched page, not a true global total (plan §17). */
  countsAreExhaustive: boolean;
}

/**
 * Session 6.2 — the always-visible Domain -> Category -> Agent -> Channel
 * hierarchy. Per plan §11 ("grouping is not just a filter"): this tree
 * is shown in full at all times, including when nothing is selected —
 * it is never replaced by a flat list + dropdown filters. Selecting a
 * channel leaf narrows the list rendered below it (owned by the caller);
 * selecting again clears the narrowing without hiding the tree itself.
 */
export const GroupedInteractionTree: React.FC<GroupedInteractionTreeProps> = ({
  group,
  selected,
  onSelect,
  countsAreExhaustive,
}) => {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(group.categories.map((c) => c.categoryId)));
  const [openAgents, setOpenAgents] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAgent = (id: string) =>
    setOpenAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (group.categories.length === 0 && group.unclassifiedCount === 0) {
    return <p className="text-sm text-muted-foreground py-4">No authorized interactions to group.</p>;
  }

  return (
    <div className="border rounded-lg divide-y">
      <div className="px-3 py-2 bg-muted text-sm font-semibold flex items-center justify-between">
        <span>{group.domain}</span>
        <span className="text-muted-foreground font-normal">
          {group.total} interaction{group.total === 1 ? '' : 's'}
          {!countsAreExhaustive && <span className="ml-1">(current page)</span>}
        </span>
      </div>

      {group.categories.map((cat) => {
        const catOpen = openCategories.has(cat.categoryId);
        return (
          <div key={cat.categoryId}>
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted"
              onClick={() => toggleCategory(cat.categoryId)}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {catOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {cat.categoryName}
              </span>
              <span className="text-muted-foreground text-xs">{cat.total}</span>
            </button>

            {catOpen &&
              cat.agents.map((agent) => {
                const agentOpen = openAgents.has(agent.agentId);
                return (
                  <div key={agent.agentId} className="pl-5">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted"
                      onClick={() => toggleAgent(agent.agentId)}
                    >
                      <span className="flex items-center gap-1.5 text-foreground">
                        {agentOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {agent.agentName}
                      </span>
                      <span className="text-muted-foreground text-xs">{agent.total}</span>
                    </button>

                    {agentOpen && (
                      <div className="pl-5 pb-1">
                        {agent.channels.map((ch) => {
                          const isSelected = selected?.agentId === agent.agentId && selected?.channel === ch.channel;
                          return (
                            <button
                              key={ch.channel}
                              type="button"
                              className={`w-full flex items-center justify-between px-3 py-1 text-xs rounded ${
                                isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
                              }`}
                              onClick={() => onSelect(isSelected ? null : { agentId: agent.agentId, channel: ch.channel })}
                            >
                              <span className="flex items-center gap-1.5 capitalize">
                                {ch.channel === 'voice' ? <Phone className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                                {ch.channel}
                              </span>
                              <span>{ch.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}

      {group.unclassifiedCount > 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {group.unclassifiedCount} interaction{group.unclassifiedCount === 1 ? '' : 's'} without a category/agent mapping
        </div>
      )}
    </div>
  );
};
