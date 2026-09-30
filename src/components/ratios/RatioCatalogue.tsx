import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RatioAvailabilityBadge } from './RatioAvailabilityBadge';
import { RATIO_CATALOGUE_ORDER, RATIO_FAMILY_LABELS, RATIO_FAMILY_ORDER, FRONTEND_RATIO_REGISTRY } from '@/lib/ratios/ratioFrontendRegistry';
import { useRatioCatalogueUIState, type RatioStatusFilter } from '@/lib/ratios/useRatioCatalogueUIState';
import type { RatioAvailability } from '@/types/ratio';

const STATUS_FILTERS: { value: RatioStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'direct', label: 'Direct' },
  { value: 'partial', label: 'Partial' },
  // Session R6.3A — Conversation Quality's first 6 ratios only.
  { value: 'awaiting_telemetry', label: 'Awaiting Trace API' },
  { value: 'backend_gap', label: 'Not yet instrumented' },
];

/**
 * /ratios — spec §11 "Ratio Catalogue UI", refined in Session R4.2 per
 * the UX Refinement / In-Place Drill-Down prompt: collapsible families
 * (item 1), a lightweight All/Direct/Partial/Not-yet status filter
 * (item 2), and fully clickable rows with no separate View button
 * (item 3, already true since R1 — unchanged). Availability shown here
 * is the frontend registry's static `declaredAvailability` snapshot,
 * not a live fetch — deliberately: fetching all 21 live summaries just
 * to render a list would be wasteful, and the single-ratio Explorer
 * view (which IS the source of truth) fetches the real live value the
 * moment a ratio is opened, per spec's "DIRECT/DERIVED ratios do not
 * need to be fully calculated in R1".
 */
export const RatioCatalogue: React.FC = () => {
  const navigate = useNavigate();
  const { expandedFamilies, toggleFamily, statusFilter, setStatusFilter } = useRatioCatalogueUIState();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter ratios by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            aria-pressed={statusFilter === f.value}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              statusFilter === f.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card/40 text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {RATIO_FAMILY_ORDER.map((family) => {
          const allIds = RATIO_CATALOGUE_ORDER.filter((id) => FRONTEND_RATIO_REGISTRY[id]?.family === family);
          if (allIds.length === 0) return null;

          const counts: Record<RatioAvailability, number> = { direct: 0, derived: 0, partial: 0, backend_gap: 0, awaiting_telemetry: 0 };
          for (const id of allIds) counts[FRONTEND_RATIO_REGISTRY[id].declaredAvailability]++;

          const visibleIds =
            statusFilter === 'all' ? allIds : allIds.filter((id) => FRONTEND_RATIO_REGISTRY[id].declaredAvailability === statusFilter);
          if (visibleIds.length === 0) return null;

          const isExpanded = expandedFamilies.has(family);

          return (
            <section key={family} className="border border-border rounded-md bg-card/40 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleFamily(family)}
                aria-expanded={isExpanded}
                className="w-full flex items-center justify-between gap-3 py-2 px-3 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  )}
                  <h2 className="text-[13px] font-semibold text-foreground truncate">{RATIO_FAMILY_LABELS[family]}</h2>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {allIds.length} ratio{allIds.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                  {counts.direct + counts.derived > 0 && <span>{counts.direct + counts.derived} direct</span>}
                  {counts.partial > 0 && <span>{counts.partial} partial</span>}
                  {counts.awaiting_telemetry > 0 && <span>{counts.awaiting_telemetry} awaiting trace API</span>}
                  {counts.backend_gap > 0 && <span>{counts.backend_gap} not yet instrumented</span>}
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y divide-border/60 border-t border-border">
                  {visibleIds.map((id) => {
                    const fe = FRONTEND_RATIO_REGISTRY[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => navigate(`/ratios/${id}`)}
                        className="w-full flex items-center justify-between gap-3 py-2.5 px-3 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{fe.name}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">{fe.formulaText}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{fe.description}</p>
                        </div>
                        <RatioAvailabilityBadge availability={fe.declaredAvailability} className="shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
