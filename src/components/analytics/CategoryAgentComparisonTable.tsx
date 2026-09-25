import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Classification } from '@/hooks/classification/useClassification';

interface Props {
  classification: Classification | undefined;
  /** agentId -> count. Session 7 §7/§8: built from the same classification mapping Session 6.2 already established — no Analytics-only category names. */
  countByAgentId: Map<string, number>;
  agentsById: Map<string, { agentId: string; displayName: string }>;
  countLabel: string;
}

/**
 * Session 7 §7/§8 — even an all-access user retains the organizational
 * structure (Domain -> Category -> Agent), never a flat comparison list.
 * Each row links into the existing Agent Detail page rather than
 * re-deriving FCR/AHT/quality here (plan §9 — Agent Detail stays the
 * single authoritative per-agent formula source).
 */
export const CategoryAgentComparisonTable: React.FC<Props> = ({ classification, countByAgentId, agentsById, countLabel }) => {
  if (!classification) return null;
  const categories = classification.categories.filter((c) => c.agentIds.some((id) => countByAgentId.has(id)));

  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No authorized categories with data in this scope.</p>;
  }

  return (
    <div className="border rounded-lg divide-y">
      <div className="px-3 py-2 bg-slate-50 text-sm font-semibold">{classification.domain}</div>
      {categories.map((cat) => (
        <div key={cat.id} className="px-3 py-2">
          <div className="text-sm font-medium text-gray-700 mb-1">{cat.name}</div>
          <div className="pl-3 space-y-1">
            {cat.agentIds
              .filter((id) => countByAgentId.has(id))
              .map((agentId) => (
                <Link
                  key={agentId}
                  to={`/ai-agents/${agentId}`}
                  className="flex items-center justify-between text-sm text-gray-600 hover:text-primary py-0.5"
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    {agentsById.get(agentId)?.displayName ?? agentId}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {countByAgentId.get(agentId)} {countLabel}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};
