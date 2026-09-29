import React from 'react';
import { useLocation } from 'react-router-dom';
import { findPillarAndItemForPath } from './pillarNav';
import { useIndustry } from '@/contexts/IndustryContext';

interface ContextBarProps {
  /** Optional operational content (e.g. live counts) — only ever pass real, authoritative values. Never fabricated. */
  children?: React.ReactNode;
}

/**
 * Compact top application bar (Session 10.1, branding relocated in 10.5) —
 * a single ~44px strip carrying both product identity (moved here from the
 * navigation rail's former hover-only "TAR" tile) and the current route's
 * "Pillar / Page" context. Derived entirely from the current route, so
 * pages don't need to repeat it. Campaign pages render their own
 * page-specific content below this; non-campaign pages are unaffected
 * internally.
 */
export const ContextBar: React.FC<ContextBarProps> = ({ children }) => {
  const location = useLocation();
  const { industryConfig } = useIndustry();
  const match = findPillarAndItemForPath(location.pathname);

  return (
    <div className="h-11 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        {/* Product identity — the sole persistent home for TARDIS/VoiceForce branding. */}
        <div className="flex items-center gap-1.5 shrink-0" aria-label="TARDIS VoiceForce">
          <img
            src="/lovable-uploads/6138fbbf-ad76-48a4-b751-54274a6fcfa3.png"
            alt="TARDIS"
            className="w-6 h-6 rounded shrink-0"
          />
          <div className="leading-none">
            <div className="text-sm font-bold text-foreground">VoiceForce</div>
            <div className="text-[10px] text-muted-foreground truncate max-w-[160px] hidden sm:block">
              {industryConfig.name}
            </div>
          </div>
        </div>

        <span className="text-muted-foreground/40 shrink-0 hidden sm:inline" aria-hidden="true">
          |
        </span>

        <div className="flex items-center gap-1.5 text-sm min-w-0">
          {match ? (
            <>
              <span className="text-muted-foreground hidden sm:inline">{match.pillar.label}</span>
              <span className="text-muted-foreground/50 hidden sm:inline">/</span>
              <span className="text-foreground font-medium truncate">{match.item.name}</span>
            </>
          ) : (
            <span className="text-foreground font-medium">VoiceForce</span>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-3 text-xs shrink-0">{children}</div>}
    </div>
  );
};
