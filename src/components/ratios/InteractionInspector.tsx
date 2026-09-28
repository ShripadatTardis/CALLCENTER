import React from 'react';
import { useCallData } from '@/hooks/calls/useCallData';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import type { Interaction } from '@/types/interaction';
import type { RatioInteractionRefDto } from '@/types/ratio';

/**
 * Spec §17.5/§20 — "The Ratio system must NOT recreate transcript/
 * recording infrastructure." Reuses the exact existing Call Detail
 * dialog (InteractionDetailDialog), the same reuse point
 * CampaignDetail.tsx already established — never a second transcript
 * viewer. Chat-channel evidence has no Ratio Explorer consumer yet in
 * R1 (no ratio interaction rows are populated), so only the voice path
 * is wired; the channel field on RatioInteractionRefDto already
 * anticipates a chat branch for R2 without needing a shape change.
 */
export const InteractionInspector: React.FC<{ interaction: RatioInteractionRefDto; onClose: () => void }> = ({ interaction, onClose }) => {
  const { data, isLoading } = useCallData({ search: interaction.interactionId, page_size: 1 });
  const found = data?.interactions.find((i) => i.interactionId === interaction.interactionId) ?? data?.interactions[0];

  if (isLoading || !found) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card rounded-lg p-6 text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {isLoading ? 'Loading interaction…' : 'Could not load this interaction right now.'}
        </div>
      </div>
    );
  }

  return <InteractionDetailDialog isOpen onClose={onClose} interaction={found as Interaction} />;
};
