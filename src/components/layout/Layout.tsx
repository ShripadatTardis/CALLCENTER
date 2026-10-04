
import React from 'react';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { useLayout, LayoutProvider } from '@/contexts/LayoutContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { hasLayout } = useLayout();

  // If already inside a layout, just return children to prevent double sidebar
  if (hasLayout) {
    return <>{children}</>;
  }

  // Render full layout: compact icon rail (Sidebar) + compact context bar
  // (Session 10.1) — persistent chrome is now ~52px rail + ~44px bar,
  // replacing the old permanently-expanded sidebar.
  return (
    <LayoutProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <ContextBar />
          {/* min-w-0 is required on a flex child that contains wide content
              (grids, tables) — without it, flex items refuse to shrink below
              their content's intrinsic width, and the whole page overflows
              horizontally instead of scrolling within `main`.

              App-wide viewport-framing correction (follow-up to Session 15):
              min-h-0 is the equivalent fix for the vertical axis — without
              it, a flex child's default min-height:auto lets `main` grow
              past its allotted height to fit tall page content instead of
              clipping+scrolling it, which pushes the whole `h-screen` shell
              past 100vh and the BROWSER document scrolls (confirmed root
              cause of the reported bug). Every page's own root div is still
              responsible for being a well-behaved flex child in turn (see
              the "L1"/Pattern A/B conventions in CallLogs.tsx etc.) — this
              is the one missing ancestor-level guarantee that makes that
              page-level contract reliable instead of accidental. */}
          <main className="flex-1 min-w-0 min-h-0 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </LayoutProvider>
  );
};
