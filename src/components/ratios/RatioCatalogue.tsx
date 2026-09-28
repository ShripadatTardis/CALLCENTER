import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RatioAvailabilityBadge } from './RatioAvailabilityBadge';
import { RATIO_CATALOGUE_ORDER, RATIO_FAMILY_LABELS, RATIO_FAMILY_ORDER, FRONTEND_RATIO_REGISTRY } from '@/lib/ratios/ratioFrontendRegistry';

/**
 * /ratios — spec §11 "Ratio Catalogue UI". Grouped by family, dense
 * clickable rows (G1-style), no redundant "View details" button (spec
 * §3: "every ratio card is directly clickable"). Availability shown here
 * is the frontend registry's static `declaredAvailability` snapshot, not
 * a live fetch — deliberately: fetching all 21 live summaries just to
 * render a catalogue list would be wasteful, and the single-ratio
 * Explorer page (which IS the source of truth) fetches the real live
 * value the moment a ratio is opened, per spec's "DIRECT/DERIVED ratios
 * do not need to be fully calculated in R1".
 */
export const RatioCatalogue: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {RATIO_FAMILY_ORDER.map((family) => {
        const ids = RATIO_CATALOGUE_ORDER.filter((id) => FRONTEND_RATIO_REGISTRY[id]?.family === family);
        if (ids.length === 0) return null;
        return (
          <section key={family}>
            <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">{RATIO_FAMILY_LABELS[family]}</h2>
            <div className="border border-border rounded-md bg-card/40 divide-y divide-border/60">
              {ids.map((id) => {
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
          </section>
        );
      })}
    </div>
  );
};
