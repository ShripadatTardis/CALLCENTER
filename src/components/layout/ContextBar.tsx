import React from 'react';
import { useLocation } from 'react-router-dom';
import { findPillarAndItemForPath } from './pillarNav';

interface ContextBarProps {
  /** Optional operational content (e.g. live counts) — only ever pass real, authoritative values. Never fabricated. */
  children?: React.ReactNode;
}

/**
 * Compact top application bar (Session 10.1) — replaces each page's large
 * "Pillar / Title" heading (PageHeader) with a single ~44px strip showing
 * the same context. Derived entirely from the current route, so pages
 * don't need to repeat it. Campaign pages render their own page-specific
 * content below this; non-campaign pages are unaffected internally.
 */
export const ContextBar: React.FC<ContextBarProps> = ({ children }) => {
  const location = useLocation();
  const match = findPillarAndItemForPath(location.pathname);

  return (
    <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b bg-white">
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        {match ? (
          <>
            <span className="text-slate-500">{match.pillar.label}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-medium truncate">{match.item.name}</span>
          </>
        ) : (
          <span className="text-slate-900 font-medium">VoiceForce</span>
        )}
      </div>
      {children && <div className="flex items-center gap-3 text-xs shrink-0">{children}</div>}
    </div>
  );
};
