import React, { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useCampaignAuditEvents } from '@/hooks/campaigns/useCampaigns';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import type { CampaignAuditEvent } from '@/types/campaign';

const EVENT_LABELS: Record<string, string> = {
  campaign_status_changed: 'Campaign status changed',
  configuration_version_created: 'Configuration version created',
  configuration_version_activated: 'Configuration version activated',
  outcome_mapping_changed: 'Outcome mapping changed',
  target_skipped: 'Target skipped',
  target_held: 'Target held',
  hold_released: 'Hold released',
  target_amended: 'Target data amended',
  manual_retry_requested: 'Manual retry requested',
  targets_added: 'Targets added',
};

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
}

/**
 * Session 12.7 §15 — a readable Campaign History surface over the
 * existing campaign_audit_events log. Not full event sourcing, not
 * raw JSON as the primary view: each row leads with a human label,
 * actor, time and reason; the `detail` payload (before/after values,
 * version numbers) is shown as a secondary, collapsed-by-default line
 * only when present and genuinely informative.
 */
export const CampaignHistory: React.FC<{ campaignId: string }> = ({ campaignId }) => {
  const { data: events = [], isLoading, isError } = useCampaignAuditEvents(campaignId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return <p className="text-sm text-destructive py-4">Could not load campaign history.</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No history recorded for this campaign yet.</p>;
  }

  return (
    <div className="border border-border rounded-md bg-card/40 divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
      {events.map((event) => (
        <HistoryRow key={event.id} event={event} />
      ))}
    </div>
  );
};

function detailSummary(event: CampaignAuditEvent): string | null {
  if (!event.detail) return null;
  const { before, after, versionNumber, batchId, targetCount, priorStatus, from, to } = event.detail as Record<string, unknown>;
  if (from !== undefined && to !== undefined) return `${String(from)} → ${String(to)}`;
  if (versionNumber !== undefined) return `v${String(versionNumber)}`;
  if (priorStatus !== undefined) return `was ${String(priorStatus)}`;
  if (targetCount !== undefined) return `${String(targetCount)} target(s)${batchId ? ` · batch ${String(batchId).slice(0, 8)}…` : ''}`;
  if (before !== undefined && after !== undefined) return `${JSON.stringify(before)} → ${JSON.stringify(after)}`;
  return null;
}

/**
 * Session 15.2 Part C — detailSummary() only ever surfaces a derived,
 * human-readable line for the detail shapes it recognizes; any other
 * field already present in `detail` (or an unrecognized shape
 * entirely) would otherwise be silently dropped. The raw payload is
 * always available here, behind an explicit expand — never the
 * default/normal presentation, but never discarded either.
 */
const HistoryRow: React.FC<{ event: CampaignAuditEvent }> = ({ event }) => {
  const summary = detailSummary(event);
  const [expanded, setExpanded] = useState(false);
  const hasRawDetail = event.detail && Object.keys(event.detail).length > 0;
  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`font-medium ${typography.body}`}>{eventLabel(event.eventType)}</span>
        <span className={typography.metadata}>· {formatTimestamp(event.occurredAt)}</span>
        {event.actor && <span className={typography.metadata}>· {event.actor}</span>}
      </div>
      {(event.reason || event.comment || summary) && (
        <p className={`${typography.bodySecondary} mt-0.5`}>
          {[event.reason, event.comment, summary].filter(Boolean).join(' — ')}
        </p>
      )}
      {hasRawDetail && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 -ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={expanded}
            aria-controls={`campaign-history-detail-${event.id}`}
          >
            {expanded ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            Technical details
          </button>
          {expanded && (
            <pre id={`campaign-history-detail-${event.id}`} className="mt-1 p-2 rounded bg-background/60 border border-border/60 text-[10px] text-muted-foreground overflow-x-auto">
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
};
