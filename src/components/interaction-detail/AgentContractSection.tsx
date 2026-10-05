import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { CallAgentContract } from '@/types/campaign';

/**
 * Shared Interaction Detail primitive (Call Logs / Chat Logs) — the
 * agent's own declared contract (expected inputs, outcomes, output
 * fields), resolved from the live agent roster by the interaction's
 * agentId, never fabricated and never campaign-specific. Collapsed by
 * default, matching the same established Agent Contract disclosure
 * convention already used on AgentDetail.tsx, CampaignSettingsDialog.tsx
 * and CampaignConfigurationSummary.tsx — one visual vocabulary for
 * "Agent Contract" across the app, not a new one for this surface.
 * Renders nothing when the agent couldn't be resolved from the roster
 * (e.g. a historical interaction whose agent no longer exists) rather
 * than showing an empty/misleading section.
 */
export const AgentContractSection: React.FC<{ contract: CallAgentContract | null }> = ({ contract }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!contract) return null;
  if (contract.expectedInputFields.length === 0 && contract.expectedOutcomes.length === 0 && contract.outputFields.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex-shrink-0">
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={open}
            aria-controls={panelId}
          >
            <span className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent Contract</span>
            </span>
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
              {contract.contractCompleteness}
            </Badge>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent id={panelId}>
          <div className="px-3 pb-3 pt-1 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-2">
            {contract.expectedInputFields.length > 0 && (
              <div className="space-y-1 bg-background/40 rounded p-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Expected Inputs</div>
                <div className="space-y-1">
                  {contract.expectedInputFields.map((f) => (
                    <div key={f.fieldCode} className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                      <span className="text-foreground font-medium">{f.displayName}</span>
                      <span className="text-muted-foreground">({f.fieldCode})</span>
                      {f.required ? (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400">required</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">optional</Badge>
                      )}
                      {f.dataType && <span className="text-muted-foreground">{f.dataType}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(contract.expectedOutcomes.length > 0 || contract.outputFields.length > 0) && (
              <div className="space-y-1 bg-background/40 rounded p-2">
                {contract.expectedOutcomes.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Expected Outcomes</div>
                    <div className="flex flex-wrap gap-1">
                      {contract.expectedOutcomes.map((o) => (
                        <Badge key={o.outcomeCode} variant="outline" className="text-[10px] py-0 px-1.5 border-border text-foreground" title={o.description}>
                          {o.displayName}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
                {contract.outputFields.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Output Fields</div>
                    <div className="flex flex-wrap gap-1">
                      {contract.outputFields.map((f) => (
                        <Badge key={f.fieldCode} variant="outline" className="text-[10px] py-0 px-1.5 border-border text-muted-foreground" title={f.description}>
                          {f.displayName}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
