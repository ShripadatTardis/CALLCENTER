import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useIndustry } from '@/contexts/IndustryContext';
import { UserProfile } from './UserProfile';
import { PILLARS, findPillarForPath, type Pillar } from './pillarNav';
import {
  LayoutGrid,
  Phone,
  Workflow,
  Puzzle,
  Bot,
  BarChart3,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';

/**
 * Session 10.1 production application shell — compact icon rail (~52px)
 * with a temporary overlay for the full seven-pillar menu. Replaces the
 * Session 7.2 permanently-expanded sidebar: the rail is the ONLY
 * permanent navigation chrome, the overlay never resizes/pushes the
 * workspace, and closes on outside-click, Escape, or item selection.
 */
const PILLAR_ICON: Record<string, React.ElementType> = {
  observe: LayoutGrid,
  control: Phone,
  operationalize: Workflow,
  integrate: Puzzle,
  improve: Bot,
  measure: BarChart3,
  govern: ShieldCheck,
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { industryConfig } = useIndustry();
  const activePillar = findPillarForPath(location.pathname);

  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const visiblePillars: Pillar[] = PILLARS.map((pillar) => ({
    ...pillar,
    items: pillar.items.filter((item) => !item.permission || hasPermission(user, item.permission)),
  })).filter((pillar) => pillar.items.length > 0);

  // Escape-to-close + focus restoration to the trigger button.
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the overlay for keyboard users.
    overlayRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  const closeNav = () => {
    setNavOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div className="relative flex h-screen shrink-0">
      {/* Permanent icon rail — ~52px, the only persistent navigation chrome. */}
      <div className="flex flex-col items-center w-[52px] shrink-0 bg-sidebar py-2 gap-1 border-r border-sidebar-border">
        <button
          ref={toggleRef}
          type="button"
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navOpen}
          aria-controls="app-nav-overlay"
          onClick={() => setNavOpen((v) => !v)}
          className="w-9 h-9 rounded flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 mb-1"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <div
          className="w-8 h-8 rounded bg-cyan-600 flex items-center justify-center text-white text-[10px] font-bold mb-2"
          title={`TARDIS VoiceForce — ${industryConfig.name}`}
        >
          TAR
        </div>

        <nav className="flex flex-col items-center gap-1 flex-1 overflow-y-auto" aria-label="Product pillars">
          {visiblePillars.map((pillar) => {
            const Icon = PILLAR_ICON[pillar.key] ?? LayoutGrid;
            const isActive = activePillar?.key === pillar.key;
            return (
              <button
                key={pillar.key}
                type="button"
                title={pillar.label}
                aria-label={pillar.label}
                onClick={() => setNavOpen(true)}
                className={cn(
                  'w-9 h-9 rounded flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
                  isActive
                    ? 'bg-cyan-600 text-white'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        <UserProfile compact />
      </div>

      {/* Temporary overlay — absolutely positioned, never pushes the workspace. */}
      {navOpen && (
        <>
          <button
            aria-label="Close navigation overlay"
            className="fixed inset-0 bg-black/40 z-40"
            onClick={closeNav}
          />
          <div
            id="app-nav-overlay"
            ref={overlayRef}
            role="dialog"
            aria-label="Product navigation"
            className="absolute left-[52px] top-0 h-full w-64 bg-sidebar border-r border-sidebar-border shadow-2xl z-50 flex flex-col text-sidebar-foreground"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-sidebar-border shrink-0">
              <div>
                <div className="text-sm font-bold leading-tight">TARDIS VoiceForce</div>
                <div className="text-[11px] text-sidebar-foreground/60">{industryConfig.name}</div>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={closeNav}
                className="p-1 rounded hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-1" aria-label="Product navigation, expanded">
              {visiblePillars.map((pillar) => {
                const isPillarActive = activePillar?.key === pillar.key;
                return (
                  <div key={pillar.key} className="px-3 py-1.5">
                    <div
                      className={cn(
                        'text-[11px] font-semibold uppercase tracking-wide mb-0.5',
                        isPillarActive ? 'text-cyan-500 dark:text-cyan-400' : 'text-sidebar-foreground/60'
                      )}
                    >
                      {pillar.label}
                    </div>
                    {pillar.items.map((item) => {
                      const isActive =
                        location.pathname === item.href ||
                        (item.matchPrefix ? location.pathname.startsWith(item.matchPrefix) : false);
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={closeNav}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
                            isActive
                              ? 'bg-sidebar-accent text-cyan-600 dark:text-cyan-300 font-medium'
                              : 'text-sidebar-foreground/90'
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </div>
  );
};
