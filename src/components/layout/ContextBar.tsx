import React from 'react';
import { useLocation } from 'react-router-dom';
import { findPillarAndItemForPath } from './pillarNav';

interface ContextBarProps {
  /** Optional operational content (e.g. live counts) — only ever pass real, authoritative values. Never fabricated. */
  children?: React.ReactNode;
}

/**
 * Compact top application bar (Session 10.1, branding relocated in 10.5,
 * simplified to the single approved VoiceForce lockup in a later
 * session) — a single ~44px strip carrying both product identity and the
 * current route's "Pillar / Page" context. Derived entirely from the
 * current route, so pages don't need to repeat it. Campaign pages render
 * their own page-specific content below this; non-campaign pages are
 * unaffected internally.
 */
export const ContextBar: React.FC<ContextBarProps> = ({ children }) => {
  const location = useLocation();
  const match = findPillarAndItemForPath(location.pathname);

  return (
    <div className="h-11 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        {/* Product identity — the single approved VoiceForce lockup, the sole persistent home for branding. The source asset has an opaque white background, so it sits on a small white chip rather than directly on the dark bar. */}
        <img
          src="/lovable-uploads/voiceforce-logo.png"
          alt="VoiceForce"
          className="h-7 w-auto shrink-0 rounded bg-white px-1.5 py-1"
        />

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
