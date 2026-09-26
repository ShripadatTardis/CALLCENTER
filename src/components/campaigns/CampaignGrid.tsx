import React from 'react';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';

interface CampaignGridProps {
  campaigns: CampaignWithStats[];
  onViewCampaign: (campaign: CampaignWithStats) => void;
}

/**
 * Session 10.1 — Direction A's compact operational table, styled with the
 * selected dark visual language. Columns are exactly the fields
 * CampaignStats already provides (targetCount/triggeredCount/
 * classifiedCount/successCount) — "Unclassified" is a real subtraction
 * (targets - classified), never a fabricated value. No card grid.
 */
export const CampaignGrid: React.FC<CampaignGridProps> = ({ campaigns, onViewCampaign }) => {
  if (campaigns.length === 0) {
    return (
      <div className="border border-slate-800 rounded-md p-8 text-center text-sm text-slate-400 bg-slate-900/40">
        No campaigns yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-800 rounded-md bg-slate-900/40">
      <table className="w-full text-[13px] text-slate-200">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-800">
            <th className="text-left py-2 px-3 font-medium">Campaign</th>
            <th className="text-left py-2 px-3 font-medium">Status</th>
            <th className="text-left py-2 px-3 font-medium">Call Agent</th>
            <th className="text-right py-2 px-3 font-medium">Targets</th>
            <th className="text-right py-2 px-3 font-medium">Attempted</th>
            <th className="text-right py-2 px-3 font-medium">Classified</th>
            <th className="text-right py-2 px-3 font-medium">Unclassified</th>
            <th className="text-right py-2 px-3 font-medium">Success rate</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const unclassified = campaign.stats.targetCount - campaign.stats.classifiedCount;
            const rate =
              campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
            return (
              <tr
                key={campaign.id}
                onClick={() => onViewCampaign(campaign)}
                className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                tabIndex={0}
                role="button"
                aria-label={`Open campaign ${campaign.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onViewCampaign(campaign);
                  }
                }}
              >
                <td className="py-2 px-3">
                  <div className="font-medium text-white">{campaign.name}</div>
                  <div className="text-[11px] text-slate-400">by {campaign.createdBy ?? 'unknown'}</div>
                </td>
                <td className="py-2 px-3">
                  <CampaignStatusBadge status={campaign.status} dark />
                </td>
                <td className="py-2 px-3 text-slate-300">{campaign.agentName ?? campaign.agentId}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-300">{campaign.stats.targetCount}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-300">{campaign.stats.triggeredCount}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-300">{campaign.stats.classifiedCount}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {unclassified > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <AlertTriangle size={11} aria-hidden="true" />
                      {unclassified}
                    </span>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-white">
                  {rate === null ? <span className="text-slate-400">—</span> : `${rate.toFixed(0)}%`}
                </td>
                <td className="py-2 pr-3 text-right">
                  <ChevronRight size={14} className="text-slate-600" aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
