import React from 'react';

interface PageHeaderProps {
  pillar: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Shared contextual page header (Session 7.2): "Pillar / Page Name" plus a
 * one-line description, so every screen carries the same product-hierarchy
 * context without a separate breadcrumb trail.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ pillar, title, description, actions }) => {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">{pillar}</p>
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-600 mt-1">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
