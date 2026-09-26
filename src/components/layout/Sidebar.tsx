import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { UserProfile } from './UserProfile';
import { IndustryIndicator } from './IndustryIndicator';
import { Logo } from '@/components/ui/logo';
import { ChevronDown } from 'lucide-react';
import { PILLARS, findPillarForPath, type Pillar } from './pillarNav';

const EXPANDED_STORAGE_KEY = 'callcenter.sidebar.expandedPillars';

function loadExpandedState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpandedState(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only; sidebar still works without persisted state
  }
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const activePillar = findPillarForPath(location.pathname);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpandedState());

  // Whatever pillar contains the current route is always expanded, regardless
  // of persisted/collapsed state, so the active page is never hidden.
  useEffect(() => {
    if (activePillar && !expanded[activePillar.key]) {
      setExpanded((prev) => ({ ...prev, [activePillar.key]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePillar?.key]);

  const togglePillar = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveExpandedState(next);
      return next;
    });
  };

  const visiblePillars = PILLARS.map((pillar) => ({
    ...pillar,
    items: pillar.items.filter((item) => !item.permission || hasPermission(user, item.permission)),
  })).filter((pillar) => pillar.items.length > 0);

  return (
    <div className="flex h-screen w-16 md:w-64 flex-col bg-gray-800 text-white shrink-0">
      <div className="px-2 md:px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-center md:justify-start space-x-2 mb-3">
          <Logo size="xl" className="h-10 md:h-16" />
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold">TARDIS</h1>
            <p className="text-xs text-gray-300">VoiceForce&reg;</p>
          </div>
        </div>
        <div className="hidden md:flex justify-center">
          <IndustryIndicator />
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-1 md:px-3 py-4 overflow-y-auto" aria-label="Product navigation">
        {visiblePillars.map((pillar) => {
          const isPillarActive = activePillar?.key === pillar.key;
          const isExpanded = expanded[pillar.key] ?? false;

          return (
            <div key={pillar.key} className="mb-1">
              <button
                type="button"
                onClick={() => togglePillar(pillar.key)}
                aria-expanded={isExpanded}
                aria-controls={`pillar-${pillar.key}`}
                title={pillar.blurb}
                className={cn(
                  'flex w-full items-center justify-center md:justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide rounded-md transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                  isPillarActive ? 'text-blue-300' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <span className="hidden md:inline">{pillar.label}</span>
                <span className="md:hidden text-[10px]">{pillar.label.slice(0, 3)}</span>
                <ChevronDown
                  className={cn('hidden md:block h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>

              <div
                id={`pillar-${pillar.key}`}
                className={cn('space-y-1 overflow-hidden transition-all', isExpanded ? 'mt-1' : 'max-h-0 md:max-h-0')}
                hidden={!isExpanded}
              >
                {pillar.items.map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.matchPrefix ? location.pathname.startsWith(item.matchPrefix) : false);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      title={item.name}
                      className={cn(
                        'flex items-center justify-center md:justify-start px-3 py-2 text-sm font-medium rounded-md transition-colors',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      )}
                    >
                      <item.icon className="h-5 w-5 md:mr-3" aria-hidden="true" />
                      <span className="hidden md:inline">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <UserProfile />
    </div>
  );
};
