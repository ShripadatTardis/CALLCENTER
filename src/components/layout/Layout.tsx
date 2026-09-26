
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
      <div className="flex h-screen bg-white">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <ContextBar />
          {/* min-w-0 is required on a flex child that contains wide content
              (grids, tables) — without it, flex items refuse to shrink below
              their content's intrinsic width, and the whole page overflows
              horizontally instead of scrolling within `main`. */}
          <main className="flex-1 min-w-0 overflow-auto bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </LayoutProvider>
  );
};
