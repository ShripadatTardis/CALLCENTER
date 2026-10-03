import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { findCallBySidAndPhone } from '@/lib/callLookup';
import { useAuth } from '@/contexts/AuthContext';
import type { Interaction } from '@/types/interaction';
import type { RatioInteractionRefDto } from '@/types/ratio';

/**
 * Spec §17.5/§20 — "The Ratio system must NOT recreate transcript/
 * recording infrastructure." Reuses the shared InteractionDetailDialog
 * (Voice) and ChatSessionDetailDialog (Chat), never a second viewer.
 *
 * Session 13.6 (DEC-RATIO-01) fix — the previous implementation looked
 * up the Voice interaction via `useCallData({ search: interaction.
 * interactionId })`, but /call-data's `search` param only matches
 * caller_number/caller_name, never call_id (confirmed repeatedly
 * elsewhere in this codebase). That lookup could never genuinely find
 * the row by id, and its `?? data?.interactions[0]` fallback risked
 * silently showing an unrelated interaction. Fixed to use the same
 * proven phone+call_sid lookup every other screen already uses
 * (src/lib/callLookup.ts, Session 13.5) — stable identity, never a
 * fallback to "whatever came back first". Every current population
 * provider is Voice-only (see callPopulationProvider.ts's own doc
 * comment), so the chat branch below is not reachable with today's
 * data — it exists so this component is honestly channel-aware per the
 * RatioInteractionRefDto contract, not because Chat rows are fabricated.
 */
export const InteractionInspector: React.FC<{ interaction: RatioInteractionRefDto; onClose: () => void }> = ({ interaction, onClose }) => {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const isChat = interaction.channel === 'chat';

  const { data, isLoading } = useQuery({
    queryKey: ['ratios', 'voice-interaction-lookup', interaction.interactionId, interaction.phoneNumber, role],
    queryFn: () => findCallBySidAndPhone(interaction.phoneNumber, interaction.interactionId, role),
    enabled: !isChat,
  });

  if (isChat) {
    return <ChatSessionDetailDialog isOpen onClose={onClose} sessionId={interaction.interactionId} />;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-foreground flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
          Loading interaction…
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card border border-border rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          Could not load full interaction detail for {interaction.interactionId} right now.
          <div className="mt-3">
            <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <InteractionDetailDialog isOpen onClose={onClose} interaction={data as Interaction} />;
};
