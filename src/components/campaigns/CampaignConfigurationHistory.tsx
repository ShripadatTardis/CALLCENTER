import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCampaignConfigurationVersions } from '@/hooks/campaigns/useCampaigns';
import { formatTimestamp } from '@/lib/format';
import { buildConfigurationVersionViews, diffConfigurationVersions, type ConfigurationVersionView } from '@/lib/campaignConfigurationDiff';
import { typography } from '@/lib/typography';
import type { CampaignDetail as CampaignDetailType } from '@/types/campaign';

/**
 * Session 13.4 (DEC-CAMP-01) — read-only Configuration History, exposing
 * the version provenance Session 12.7 already captures but never showed.
 * Pure display: no save/cancel, never touches createConfigurationVersion
 * or updateDraft — viewing a historical version cannot accidentally
 * invoke campaign edit behavior (§3).
 */
export const CampaignConfigurationHistory: React.FC<{ campaign: CampaignDetailType }> = ({ campaign }) => {
  const { data: versions = [], isLoading, isError } = useCampaignConfigurationVersions(campaign.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return <p className="text-sm text-destructive py-4">Could not load configuration history.</p>;
  }

  const views = buildConfigurationVersionViews(versions, campaign.mappings, {
    agentId: campaign.agentId,
    agentName: campaign.agentName,
    agentContractSnapshot: campaign.agentContractSnapshot,
    outcomePolicySnapshot: campaign.outcomePolicySnapshot,
    createdAt: campaign.createdAt,
    createdBy: campaign.createdBy,
  });
  // views is sorted versionNumber desc; build an ascending lookup for diffing each version against the one immediately before it.
  const ascending = [...views].sort((a, b) => a.versionNumber - b.versionNumber);
  const prevOf = new Map<string, ConfigurationVersionView | null>();
  ascending.forEach((v, i) => prevOf.set(v.id, i > 0 ? ascending[i - 1] : null));

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1.5">
        {views.map((v) => (
          <VersionRow
            key={v.id}
            view={v}
            prev={prevOf.get(v.id) ?? null}
            expanded={expandedId === v.id}
            onToggle={() => setExpandedId((cur) => (cur === v.id ? null : v.id))}
          />
        ))}
      </div>

      {campaign.rules.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <h3 className={typography.subsectionTitle}>Legacy Result Rules</h3>
          <p className={typography.bodySecondary}>
            Generic/operational rules — not versioned by Configuration History, and distinct from Outcome Mapping
            above. These still govern this campaign's generic Current Result (call status/outcome match), separately
            from the Agent Outcome / Campaign Classification layers.
          </p>
          <div className="border border-border rounded divide-y divide-border text-xs">
            {campaign.rules
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((rule) => (
                <div key={rule.id} className="px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground tabular-nums">#{rule.priority}</span>
                  <span className="text-foreground">
                    {rule.matchField} = {rule.matchValue}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground">{rule.resultLabel}</span>
                  {rule.isSuccess !== null && (
                    <Badge variant="outline" className={`text-[9px] py-0 px-1 ${rule.isSuccess ? 'border-green-700 text-green-700 dark:text-green-400' : 'border-border text-muted-foreground'}`}>
                      {rule.isSuccess ? 'success' : 'not success'}
                    </Badge>
                  )}
                  {!rule.active && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
                      inactive
                    </Badge>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

const VersionRow: React.FC<{
  view: ConfigurationVersionView;
  prev: ConfigurationVersionView | null;
  expanded: boolean;
  onToggle: () => void;
}> = ({ view, prev, expanded, onToggle }) => {
  const diff = diffConfigurationVersions(prev, view);
  const contentId = `config-version-${view.id}`;
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className={`border rounded-md ${view.status === 'active' ? 'border-cyan-600/50 bg-cyan-500/5' : 'border-border bg-card/40'}`}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={expanded}
            aria-controls={contentId}
          >
            <span className="flex items-center gap-2 flex-wrap text-[12px]">
              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
              <span className="font-semibold text-foreground">v{view.versionNumber}</span>
              {view.status === 'active' ? (
                <Badge className="text-[9px] py-0 px-1.5 bg-cyan-700 text-white hover:bg-cyan-700">Current</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
                  Superseded
                </Badge>
              )}
              {view.isSynthetic && (
                <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground" title="This campaign has never been edited since launch — there is no separate configuration-version row yet.">
                  unversioned
                </Badge>
              )}
              <span className="text-foreground">{view.agentName ?? view.agentId}</span>
              <span className="text-muted-foreground text-xs">{formatTimestamp(view.createdAt)}</span>
              {view.createdBy && <span className="text-muted-foreground text-xs">· {view.createdBy}</span>}
            </span>
          </button>
        </CollapsibleTrigger>

        {view.changeReason && (
          <p className="px-2.5 pb-1.5 text-xs text-muted-foreground italic">"{view.changeReason}"</p>
        )}

        {prev && (
          <div className="px-2.5 pb-2">
            {diff.length === 0 ? (
              <p className="text-xs text-muted-foreground">No changes from v{prev.versionNumber}.</p>
            ) : (
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                {diff.map((d, i) => (
                  <li key={i}>{d.description}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <CollapsibleContent id={contentId}>
          <div className="px-2.5 pb-2.5 pt-1 border-t border-border/60 space-y-2 text-xs">
            <div className="text-muted-foreground">
              {view.agentContractSnapshot?.expectedInputFields.length ?? 0} input field(s),{' '}
              {view.agentContractSnapshot?.expectedOutcomes.length ?? 0} outcome(s),{' '}
              {view.agentContractSnapshot?.outputFields.length ?? 0} output field(s)
            </div>

            {view.mappings.length > 0 && (
              <div className="space-y-0.5">
                <div className={typography.subsectionTitle}>Input Mapping</div>
                <div className="border border-border rounded divide-y divide-border/60">
                  {view.mappings.map((m) => (
                    <div key={m.agentInputFieldCode} className="px-2 py-1 flex items-center justify-between gap-2">
                      <span className="text-foreground">{m.agentInputFieldCode}</span>
                      <span className="text-muted-foreground">
                        {m.sourceType}:{m.sourceField}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(view.outcomePolicySnapshot?.mappings.length ?? 0) > 0 && (
              <div className="space-y-0.5">
                <div className={typography.subsectionTitle}>Outcome Mapping</div>
                <div className="border border-border rounded divide-y divide-border/60">
                  {view.outcomePolicySnapshot!.mappings.map((m) => (
                    <div key={m.agentOutcomeCode} className="px-2 py-1 flex items-center justify-between gap-2">
                      <span className="text-foreground">{m.agentOutcomeCode}</span>
                      <span className="text-muted-foreground">
                        {m.campaignClassificationCode}
                        {m.nextActionType ? ` · ${m.nextActionType.replace('_', ' ')}` : ''}
                      </span>
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
