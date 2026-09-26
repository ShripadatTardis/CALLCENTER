import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Session 10.0 Design Lab landing page — isolated, not linked from
 * production navigation. Links to the three prototype directions.
 */
export const DesignLabIndex: React.FC = () => (
  <div className="min-h-screen bg-slate-50 p-10">
    <div className="max-w-2xl mx-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Session 10.0 — Design Lab</p>
      <h1 className="text-2xl font-bold mb-2">VoiceForce UX/UI Design Exploration</h1>
      <p className="text-slate-600 mb-8">
        Three isolated, working prototype directions for human visual comparison. This is a design lab, not
        production — nothing here writes to real data, calls the Partner API, or places a call.
      </p>
      <div className="space-y-3">
        <LabLink to="/design-lab/a" title="Direction A — Compact Enterprise" desc="Maximum density, icon-only rail, fastest scanning for experienced operators." />
        <LabLink to="/design-lab/b" title="Direction B — Refined Workspace" desc="Apple-HIG-informed restraint, progressive single-page Create Campaign, calm visual language." />
        <LabLink to="/design-lab/c" title="Direction C — Operations Command Centre" desc="Dark, status-forward operations view; master/detail Create Campaign." />
      </div>
    </div>
  </div>
);

const LabLink: React.FC<{ to: string; title: string; desc: string }> = ({ to, title, desc }) => (
  <Link to={to} className="block border rounded-lg p-4 bg-white hover:border-blue-400 hover:shadow-sm transition-colors">
    <div className="font-medium text-slate-900">{title}</div>
    <div className="text-sm text-slate-500 mt-0.5">{desc}</div>
  </Link>
);
