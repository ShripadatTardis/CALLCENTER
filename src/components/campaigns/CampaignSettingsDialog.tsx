import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignClassifications } from '@/hooks/campaigns/useCampaigns';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { validateMappingSourceUniqueness } from '@/lib/campaignInputMappingUniqueness';
import type { CampaignDetail, InputMappingSourceType, NewCampaignAgentInputMappingInput } from '@/types/campaign';

interface CampaignSettingsDialogProps {
  campaign: CampaignDetail;
  expectedCurrentVersionId: string | null;
  onClose: () => void;
}

/**
 * Session 12.7 §4/§5/§7 — Campaign Settings/Edit, reachable from
 * Campaign Detail (never from Campaign List, keeping that screen
 * clean per §7). A DRAFT campaign edits in place with no
 * configuration-version churn (updateDraft). A launched/paused/
 * running campaign's edit instead creates a new prospective
 * configuration version (createConfigurationVersion), never mutating
 * history — made explicit in the consequence copy below, not just a
 * tooltip.
 *
 * Sections are ordered Agent -> Agent Contract -> Input Mapping ->
 * Outcome Mapping -> Review, matching §5's required sequence.
 * Changing the agent clears the mapping/outcome state below it so an
 * incompatible mapping can never be silently carried forward onto a
 * different agent.
 */
export const CampaignSettingsDialog: React.FC<CampaignSettingsDialogProps> = ({
  campaign,
  expectedCurrentVersionId,
  onClose,
}) => {
  const { data: agentsData } = useAgents();
  const agents = agentsData?.agents ?? [];
  const { data: classifications = [] } = useCampaignClassifications();
  const actions = useCampaignActions(campaign.id);

  const isDraft = campaign.status === 'draft';
  const [agentId, setAgentId] = useState(campaign.agentId);
  const agentChanged = agentId !== campaign.agentId;
  const selectedAgent = agents.find((a) => a.agentId === agentId);
  const agentContract = agentChanged
    ? selectedAgent
      ? buildAgentContractFromRoster(selectedAgent)
      : null
    : campaign.agentContractSnapshot;

  const [fieldMappings, setFieldMappings] = useState<Record<string, { sourceType: InputMappingSourceType; sourceField: string }>>(() =>
    Object.fromEntries(campaign.mappings.map((m) => [m.agentInputFieldCode, { sourceType: m.sourceType, sourceField: m.sourceField }])),
  );
  const [outcomeMappings, setOutcomeMappings] = useState<Record<string, string>>(() => {
    const snapshot = campaign.outcomePolicySnapshot;
    if (!snapshot) return {};
    return Object.fromEntries(snapshot.mappings.map((m) => [m.agentOutcomeCode, m.campaignClassificationCode]));
  });
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAgentChange = (newAgentId: string) => {
    setAgentId(newAgentId);
    setFieldMappings({});
    setOutcomeMappings({});
  };

  const requiredInputFields = agentContract?.expectedInputFields.filter((f) => f.required) ?? [];
  const requiredFieldsUnmapped = requiredInputFields.filter((f) => !fieldMappings[f.fieldCode]?.sourceField);
  const advertisedOutcomes = agentContract?.expectedOutcomes ?? [];
  const requiredOutcomesUnmapped = advertisedOutcomes.filter((o) => !outcomeMappings[o.outcomeCode]);
  const successCode = classifications.find((c) => c.isSuccess)?.code ?? null;
  const hasSuccessfulMapping = advertisedOutcomes.length === 0 || !successCode || Object.values(outcomeMappings).some((c) => c === successCode);
  const mappingDuplicates = useMemo(
    () => validateMappingSourceUniqueness(Object.values(fieldMappings)),
    [fieldMappings],
  );

  const pending = isDraft ? actions.updateDraft.isPending : actions.createConfigurationVersion.isPending;
  const canSubmit =
    requiredFieldsUnmapped.length === 0 &&
    mappingDuplicates.valid &&
    hasSuccessfulMapping &&
    requiredOutcomesUnmapped.length === 0 &&
    (isDraft || reason.trim().length > 0);

  const handleSave = () => {
    setSubmitError(null);
    const mappings: NewCampaignAgentInputMappingInput[] = Object.entries(fieldMappings).map(([agentInputFieldCode, m]) => ({
      agentInputFieldCode,
      sourceType: m.sourceType,
      sourceField: m.sourceField,
      required: requiredInputFields.some((f) => f.fieldCode === agentInputFieldCode),
      dataType: agentContract?.expectedInputFields.find((f) => f.fieldCode === agentInputFieldCode)?.dataType ?? null,
    }));
    const outcomePolicySnapshot =
      advertisedOutcomes.length > 0
        ? {
            mappings: Object.entries(outcomeMappings).map(([agentOutcomeCode, campaignClassificationCode]) => ({
              agentOutcomeCode,
              campaignClassificationCode,
              nextActionType: null,
            })),
            capturedAt: new Date().toISOString(),
          }
        : campaign.outcomePolicySnapshot ?? undefined;

    if (isDraft) {
      actions.updateDraft
        .mutateAsync({
          id: campaign.id,
          input: {
            agentId: agentChanged ? agentId : undefined,
            agentName: agentChanged ? (selectedAgent?.displayName ?? null) : undefined,
            agentContractSnapshot: agentChanged ? agentContract : undefined,
            outcomePolicySnapshot,
            mappings,
          },
        })
        .then(onClose)
        .catch((err) => setSubmitError(err instanceof Error ? err.message : String(err)));
      return;
    }

    actions.createConfigurationVersion
      .mutateAsync({
        id: campaign.id,
        input: {
          expectedCurrentVersionId,
          reason: reason.trim(),
          agentId: agentChanged ? agentId : undefined,
          agentName: agentChanged ? (selectedAgent?.displayName ?? null) : undefined,
          agentContractSnapshot: agentChanged ? agentContract : undefined,
          outcomePolicySnapshot,
          mappings,
        },
      })
      .then(onClose)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setSubmitError(
          message.includes('stale_configuration_version')
            ? "This campaign's configuration changed since you opened this dialog. Close and reopen, then retry."
            : message,
        );
      });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campaign Configuration</DialogTitle>
          <DialogDescription className="text-xs">
            {isDraft
              ? 'This campaign is a draft — changes apply directly, no configuration version is created.'
              : "This campaign has launched — saving creates a NEW configuration version. Past executions stay attributed to the version that governed them; nothing is rewritten."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section className="space-y-1.5">
            <h3 id="settings-agent-heading" className="text-[13px] font-semibold text-foreground">Agent</h3>
            <Select value={agentId} onValueChange={handleAgentChange}>
              <SelectTrigger id="settings-agent-select" aria-labelledby="settings-agent-heading" className="h-9 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.agentId} value={a.agentId}>
                    {a.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agentChanged && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle size={11} aria-hidden="true" />
                Agent changed — Input Mapping and Outcome Mapping below have been cleared and must be re-entered.
              </p>
            )}
          </section>

          {agentContract && (
            <section className="space-y-1.5">
              <h3 className="text-[13px] font-semibold text-foreground">Agent Contract</h3>
              <div className="border border-border rounded p-2 text-[12px] text-muted-foreground">
                {agentContract.expectedInputFields.length} input field(s), {agentContract.expectedOutcomes.length} outcome(s),{' '}
                {agentContract.outputFields.length} output field(s) · {agentContract.contractCompleteness}
              </div>
            </section>
          )}

          {requiredInputFields.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[13px] font-semibold text-foreground">Input Mapping</h3>
              <div className="border border-border rounded divide-y divide-border">
                {agentContract?.expectedInputFields.map((field) => {
                  const mapping = fieldMappings[field.fieldCode];
                  return (
                    <div key={field.fieldCode} className="p-2 flex items-center gap-1.5 flex-wrap">
                      <label htmlFor={`mapping-source-${field.fieldCode}`} className="text-foreground">
                        {field.displayName}
                      </label>
                      {field.required && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400">
                          required
                        </Badge>
                      )}
                      <Select
                        value={mapping?.sourceType ?? ''}
                        onValueChange={(v) =>
                          setFieldMappings((prev) => ({ ...prev, [field.fieldCode]: { sourceType: v as InputMappingSourceType, sourceField: '' } }))
                        }
                      >
                        <SelectTrigger id={`mapping-source-${field.fieldCode}`} aria-label={`${field.displayName} source type`} className="h-9 w-32 text-[11px]">
                          <SelectValue placeholder="Source…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer360">Customer 360</SelectItem>
                          <SelectItem value="csv">CSV column</SelectItem>
                        </SelectContent>
                      </Select>
                      {mapping?.sourceType && (
                        <label htmlFor={`mapping-field-${field.fieldCode}`} className="sr-only">
                          {field.displayName} source field
                        </label>
                      )}
                      {mapping?.sourceType && (
                        <input
                          id={`mapping-field-${field.fieldCode}`}
                          value={mapping.sourceField}
                          onChange={(e) => setFieldMappings((prev) => ({ ...prev, [field.fieldCode]: { ...prev[field.fieldCode], sourceField: e.target.value } }))}
                          placeholder={mapping.sourceType === 'customer360' ? 'phone_number / customer_id' : 'CSV column name'}
                          className="h-9 flex-1 min-w-[140px] rounded border border-input bg-background px-2 text-[11px]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div role="status" aria-live="polite">
                {requiredFieldsUnmapped.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {requiredFieldsUnmapped.length} required field(s) still unmapped.
                  </p>
                )}
                {!mappingDuplicates.valid && (
                  <p className="text-[11px] text-destructive">
                    Duplicate source mapping(s): {mappingDuplicates.duplicateSourceKeys.join(', ')}.
                  </p>
                )}
              </div>
            </section>
          )}

          {advertisedOutcomes.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[13px] font-semibold text-foreground">Outcome Mapping</h3>
              <div className="border border-border rounded divide-y divide-border">
                {advertisedOutcomes.map((outcome) => (
                  <div key={outcome.outcomeCode} className="p-2 flex items-center gap-2 flex-wrap">
                    <label htmlFor={`outcome-select-${outcome.outcomeCode}`} className="text-foreground flex-1 min-w-[140px]">
                      {outcome.displayName}
                    </label>
                    <Select
                      value={outcomeMappings[outcome.outcomeCode] ?? ''}
                      onValueChange={(v) => setOutcomeMappings((prev) => ({ ...prev, [outcome.outcomeCode]: v }))}
                    >
                      <SelectTrigger id={`outcome-select-${outcome.outcomeCode}`} aria-label={`${outcome.displayName} classification`} className="h-9 w-44 text-[11px]">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {classifications.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div role="status" aria-live="polite">
                {requiredOutcomesUnmapped.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {requiredOutcomesUnmapped.length} outcome(s) not yet mapped.
                  </p>
                )}
                {!hasSuccessfulMapping && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">At least one outcome must map to the Successful classification.</p>
                )}
              </div>
            </section>
          )}

          <section className="space-y-1.5">
            <label htmlFor="settings-reason-textarea" className="text-[13px] font-semibold text-foreground block">
              {isDraft ? 'Notes (optional)' : 'Reason (required)'}
            </label>
            <Textarea
              id="settings-reason-textarea"
              required={!isDraft}
              aria-required={!isDraft}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[60px] text-sm"
              placeholder={isDraft ? undefined : 'Why is this configuration changing?'}
            />
          </section>

          {submitError && <p className="text-xs text-destructive" role="alert">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || pending} onClick={handleSave}>
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {pending ? 'Working…' : isDraft ? 'Save' : 'Save as new configuration version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
