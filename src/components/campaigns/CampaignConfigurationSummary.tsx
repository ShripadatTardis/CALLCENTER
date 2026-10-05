import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { typography } from '@/lib/typography';
import { selectCurrentVersionMappings } from '@/lib/campaignConfigurationDiff';
import type { CampaignClassification, CampaignDetail as CampaignDetailType } from '@/types/campaign';

/**
 * Session 15.2 Part B — a compact, read-only "Campaign → Agent → Agent
 * Contract → Input Mapping → Outcome Mapping" summary on the main
 * Campaign Detail page. Every field used here already exists (no
 * fabricated concepts); this view just makes the already-correct
 * current configuration legible without opening Settings (an edit
 * surface) or Config History (buried behind a version expand) just to
 * look. Always the CURRENT governing version's own mappings — never the
 * campaign's full cross-version row history — via the same
 * selectCurrentVersionMappings filter Settings/History both use.
 *
 * Deliberately NOT a duplicate of the AI Agent Detail screen: no
 * performance/latency/usage stats here, only the contract shape and the
 * campaign-specific source→input/outcome→classification relationships
 * that actually belong to this campaign's configuration.
 */
export const CampaignConfigurationSummary: React.FC<{
  campaign: CampaignDetailType;
  activeConfigurationVersionId: string | null;
  classifications: CampaignClassification[];
}> = ({ campaign, activeConfigurationVersionId, classifications }) => {
  const [open, setOpen] = useState(false);
  const contract = campaign.agentContractSnapshot;
  const mappings = selectCurrentVersionMappings(campaign.mappings, activeConfigurationVersionId);
  const requiredFields = contract?.expectedInputFields.filter((f) => f.required) ?? [];
  const optionalFields = contract?.expectedInputFields.filter((f) => !f.required) ?? [];
  const mappingByField = new Map(mappings.map((m) => [m.agentInputFieldCode, m]));
  const unmappedRequired = requiredFields.filter((f) => !mappingByField.has(f.fieldCode));
  const outcomeMappings = campaign.outcomePolicySnapshot?.mappings ?? [];

  const classificationLabel = (code: string) => classifications.find((c) => c.code === code)?.label ?? code;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={open}
            aria-controls="campaign-configuration-summary-panel"
          >
            <span className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
              <span className={typography.sectionTitle}>Configuration</span>
              <span className="text-xs text-muted-foreground">{campaign.agentName ?? campaign.agentId}</span>
            </span>
            {unmappedRequired.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle size={11} aria-hidden="true" />
                {unmappedRequired.length} required input(s) unmapped
              </span>
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent id="campaign-configuration-summary-panel">
          <div className="px-3 pb-3 pt-1 border-t border-border space-y-3">
            {/* Agent Contract */}
            {contract ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={typography.subsectionTitle}>Agent Contract</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
                    {contract.contractCompleteness}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">Source: {contract.contractSource}</span>
                </div>
                {contract.expectedInputFields.length === 0 && contract.expectedOutcomes.length === 0 && contract.outputFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No declared inputs, outcomes or output fields for this agent.</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
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
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No agent contract captured for this campaign.</p>
            )}

            {/* Input Mapping */}
            {requiredFields.length + optionalFields.length > 0 && (
              <div className="space-y-1">
                <span className={typography.subsectionTitle}>Input Mapping</span>
                <div className="border border-border rounded divide-y divide-border">
                  {[...requiredFields, ...optionalFields].map((f) => {
                    const m = mappingByField.get(f.fieldCode);
                    return (
                      <div key={f.fieldCode} className="px-2 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="text-foreground">{f.displayName}</span>
                          {f.required && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400">required</Badge>
                          )}
                        </span>
                        {m ? (
                          <span className="text-muted-foreground">
                            {m.sourceType === 'customer360' ? 'Customer 360' : m.sourceType === 'csv' ? 'CSV' : m.sourceType}: {m.sourceField}
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">Unmapped</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Outcome Mapping */}
            {outcomeMappings.length > 0 && (
              <div className="space-y-1">
                <span className={typography.subsectionTitle}>Outcome Mapping</span>
                <div className="border border-border rounded divide-y divide-border">
                  {outcomeMappings.map((m) => {
                    const outcomeDisplay = contract?.expectedOutcomes.find((o) => o.outcomeCode === m.agentOutcomeCode)?.displayName ?? m.agentOutcomeCode;
                    return (
                      <div key={m.agentOutcomeCode} className="px-2 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-foreground">{outcomeDisplay}</span>
                        <span className="text-muted-foreground">→ {classificationLabel(m.campaignClassificationCode)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legacy Result Rules — explicitly separate, never merged with Outcome Mapping above. */}
            {campaign.rules.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border/60">
                <span className={typography.subsectionTitle}>Legacy Result Rules</span>
                <p className="text-[11px] text-muted-foreground">
                  Generic/operational rules that still govern this campaign's generic Current Result, independently
                  of Agent Outcome → Campaign Classification above.
                </p>
                <div className="border border-border rounded divide-y divide-border text-xs">
                  {campaign.rules
                    .slice()
                    .sort((a, b) => a.priority - b.priority)
                    .map((rule) => (
                      <div key={rule.id} className="px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground tabular-nums">#{rule.priority}</span>
                        <span className="text-foreground">{rule.matchField} = {rule.matchValue}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-foreground">{rule.resultLabel}</span>
                        {!rule.active && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">inactive</Badge>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
