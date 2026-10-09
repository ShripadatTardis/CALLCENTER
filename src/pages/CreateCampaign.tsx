import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { parseTargetsCsv, useImportTargets } from '@/hooks/campaigns/useImportTargets';
import { defaultResultRules } from '@/lib/defaultResultRules';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { validateMappingSourceUniqueness } from '@/lib/campaignInputMappingUniqueness';
import { importCampaignTargets, setCampaignInputMappings, startCampaign } from '@/services/campaigns/campaignsService';
import { useCampaignClassifications } from '@/hooks/campaigns/useCampaigns';
import type {
  ImportTargetRow,
  InputMappingSourceType,
  NewCampaignAgentInputMappingInput,
  NewResultRuleInput,
  OutcomePolicySnapshot,
} from '@/types/campaign';
import { typography } from '@/lib/typography';

/**
 * Session 10.1 production workflow — 7 stages, no Scheduling step (it
 * only ever explained that no automatic scheduler exists — Session 9.2
 * confirmed this and removed the dead field; a campaign starts only via
 * explicit Start/Launch, exactly as before). "Result Mapping" renamed to
 * "Outcome Policy" in UI copy only — the underlying deterministic
 * campaign_result_rules engine and NewResultRuleInput type are
 * unchanged, per Session 10.0/10.1's explicit instruction not to rename
 * stable domain objects.
 */
const STAGES = ['Basic Info', 'Call Agent', 'Agent Contract', 'Audience', 'Input Mapping', 'Outcome Policy', 'Review & Launch'] as const;

type StageState = 'completed' | 'current' | 'available' | 'warning';

const CreateCampaign: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<ImportTargetRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [rules, setRules] = useState<NewResultRuleInput[]>(defaultResultRules());
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Session 12.4 — one entry per agent expected_input_field the operator
  // has mapped so far, keyed by fieldCode. Cleared implicitly whenever
  // the selected agent changes (a mapping keyed to the old agent's field
  // codes would be meaningless against a different agent's contract).
  const [fieldMappings, setFieldMappings] = useState<Record<string, { sourceType: InputMappingSourceType; sourceField: string }>>({});
  // Session 12.6, narrowed by 12.6.1 — one entry per agent
  // expected_outcomes[] code, keyed by agentOutcomeCode, holding ONLY
  // the Campaign Classification selection. Next Action was removed
  // from this UI per 12.6.1 — the Outcome Policy step's job is
  // singular: map an Agent Outcome to what it MEANS for this campaign,
  // not configure an action with no real execution path yet (see
  // docs/SESSION_12_6_1_OUTCOME_POLICY_UX_CORRECTION.md). The stored
  // snapshot still carries a nextActionType field for schema
  // compatibility with 12.6 — always null for mappings created from
  // this UI now.
  const [outcomeMappings, setOutcomeMappings] = useState<Record<string, string>>({});

  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];
  const { data: classifications = [] } = useCampaignClassifications();

  const { create } = useCampaignActions();
  const importMutation = useImportTargets(undefined);

  const selectedAgent = agents.find((a) => a.agentId === agentId);
  const agentContract = selectedAgent ? buildAgentContractFromRoster(selectedAgent) : null;
  const requiredInputFields = agentContract?.expectedInputFields.filter((f) => f.required) ?? [];
  const optionalInputFields = agentContract?.expectedInputFields.filter((f) => !f.required) ?? [];
  // Session 12.4 — the extra (non name/phone/customer_reference) CSV
  // columns actually present in the parsed audience, the only real
  // candidate set for a 'csv' mapping (matches triggerCallPayload.ts's
  // own csvFields: target.sourceAttributes).
  const csvColumns = csvRows.length > 0 ? Object.keys(csvRows[0].sourceAttributes ?? {}) : [];
  // Session 12.7 — auto-map a CSV column to an agent input field only
  // when its header matches the field's code exactly, case-insensitively
  // (e.g. CSV header "CUSTOMER_NAME" <-> field code "customer_name").
  // Deliberately exact-match only, never fuzzy/partial — deterministic
  // and auditable, matching this step's own "never guessed by an AI"
  // principle. Only fills a field that has no mapping yet; never
  // overwrites an operator's own manual choice (including a previous
  // auto-mapping the operator then changed), and never assigns a CSV
  // column already claimed by another field in the same pass —
  // preserves the 12.4.1 single-source invariant by construction.
  useEffect(() => {
    if (csvColumns.length === 0 || !agentContract || agentContract.expectedInputFields.length === 0) return;
    setFieldMappings((prev) => {
      const usedColumns = new Set(
        Object.values(prev)
          .filter((m) => m.sourceType === 'csv')
          .map((m) => m.sourceField),
      );
      let changed = false;
      const next = { ...prev };
      for (const field of agentContract.expectedInputFields) {
        if (next[field.fieldCode]) continue;
        const match = csvColumns.find((col) => col.toLowerCase() === field.fieldCode.toLowerCase() && !usedColumns.has(col));
        if (match) {
          next[field.fieldCode] = { sourceType: 'csv', sourceField: match };
          usedColumns.add(match);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, csvColumns.join('|')]);
  const requiredFieldsUnmapped = requiredInputFields.filter((f) => !fieldMappings[f.fieldCode]?.sourceField);
  // Session 12.4.1 — a source field may back only one agent input.
  // Excludes the field's OWN current selection so re-opening its dropdown
  // still shows its own already-chosen value; used to hide/disable that
  // source everywhere else, and released the instant the owning mapping
  // changes or is cleared (this is just a derived value, recomputed on
  // every render from fieldMappings — nothing to "release" separately).
  const sourceKeysUsedByOtherFields = (excludeFieldCode: string): Set<string> =>
    new Set(
      Object.entries(fieldMappings)
        .filter(([code, m]) => code !== excludeFieldCode && m.sourceField)
        .map(([, m]) => `${m.sourceType}:${m.sourceField}`),
    );
  // Session 12.6 §5 — every advertised outcome should be considered,
  // but Launch (not Save as Draft) is the only thing this blocks.
  const advertisedOutcomes = agentContract?.expectedOutcomes ?? [];
  const requiredOutcomesUnmapped = advertisedOutcomes.filter((o) => !outcomeMappings[o.outcomeCode]);
  // A policy where no outcome ever counts as success can't produce a
  // meaningful success rate. `successClassificationCode` is read from
  // the live, system-owned classifications list (isSuccess is DATA —
  // never a hardcoded 'SUCCESSFUL' string), so this check stays correct
  // even if the master vocabulary's codes/labels change later.
  const successClassificationCode = classifications.find((c) => c.isSuccess)?.code ?? null;
  const hasSuccessfulMapping =
    !successClassificationCode || Object.values(outcomeMappings).some((code) => code === successClassificationCode);
  const mappingDuplicates = validateMappingSourceUniqueness(Object.values(fieldMappings));

  // Each stage's real completion state — never fabricated, never confuses
  // a partial/legacy Agent Contract with a failure (it's an "available"
  // informational stage regardless of contract completeness).
  const stageComplete: boolean[] = [
    name.trim().length > 0,
    agentId.length > 0,
    agentId.length > 0, // Agent Contract — informational once an agent is selected
    csvRows.length > 0,
    agentId.length > 0, // Input Mapping — nothing required on today's partial contract
    rules.length > 0,
    false, // Review & Launch is never "completed" until actually launched/saved
  ];

  // Furthest stage whose prerequisites are met — everything up to and
  // including this index is navigable; later stages stay locked. Once
  // name + agent are set, every remaining stage is optional/informational
  // and freely revisitable (completed stages are never a dead end).
  const maxReachable = name.trim().length === 0 ? 0 : agentId.length === 0 ? 1 : STAGES.length - 1;

  const stageState = (i: number): StageState => {
    if (i === step) return 'current';
    if (stageComplete[i]) return 'completed';
    return 'available';
  };

  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return agentId.length > 0;
    if (step === 3) return csvRows.length > 0;
    return true;
  };

  const handleCsvChange = async (file: File | null) => {
    setCsvFile(file);
    setCsvRows([]);
    setCsvErrors([]);
    if (!file) return;
    try {
      const { rows, errors } = await parseTargetsCsv(file);
      setCsvRows(rows);
      setCsvErrors(errors);
    } catch (err) {
      setCsvErrors([err instanceof Error ? err.message : 'Failed to parse CSV']);
    }
  };

  const handleLaunch = async (launchImmediately: boolean) => {
    setSubmitError(null);
    try {
      // Session 12.6 §2/§3, UX narrowed by 12.6.1 — immutable Outcome
      // Policy snapshot, built only from outcomes the operator actually
      // mapped to a Campaign Classification (an outcome left
      // unconfigured has no mapping row — never defaulted to any
      // classification). Omitted entirely (undefined, not an empty
      // snapshot) when the agent advertises no outcomes or none were
      // mapped, so such a campaign stays honestly "no outcome policy"
      // rather than a policy with zero mappings. `nextActionType` is
      // always null here — 12.6.1 removed Next Action from this UI;
      // the snapshot field itself is kept for schema compatibility,
      // ready for a future session to populate once a configurable
      // action has a real execution path.
      const outcomePolicyMappings = Object.entries(outcomeMappings)
        .filter(([, campaignClassificationCode]) => campaignClassificationCode)
        .map(([agentOutcomeCode, campaignClassificationCode]) => ({
          agentOutcomeCode,
          campaignClassificationCode,
          nextActionType: null,
        }));
      const outcomePolicySnapshot: OutcomePolicySnapshot | undefined =
        outcomePolicyMappings.length > 0 ? { mappings: outcomePolicyMappings, capturedAt: new Date().toISOString() } : undefined;

      const campaign = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        agentId,
        rules,
        sourceMeta: csvFile ? { originalFilename: csvFile.name, rowCount: csvRows.length } : undefined,
        agentName: selectedAgent?.displayName,
        agentContractSnapshot: agentContract ?? undefined,
        outcomePolicySnapshot,
      });

      if (csvRows.length > 0) {
        await importCampaignTargets(campaign.id, csvRows, role);
      }

      // Session 12.4 §5 — persist the operator's field mappings via the
      // existing campaign_agent_input_mappings architecture. Only rows
      // with a real sourceField are sent (a field the operator selected
      // a source TYPE for but never finished choosing a field for is not
      // a mapping yet). `dataType`/`required` are carried straight from
      // the agent's own declared contract — never invented here.
      const mappingsToSave: NewCampaignAgentInputMappingInput[] = Object.entries(fieldMappings)
        .filter(([, m]) => m.sourceField)
        .map(([fieldCode, m]) => {
          const field = agentContract?.expectedInputFields.find((f) => f.fieldCode === fieldCode);
          return {
            agentInputFieldCode: fieldCode,
            sourceType: m.sourceType,
            sourceField: m.sourceField,
            required: field?.required ?? false,
            dataType: field?.dataType ?? null,
          };
        });
      if (mappingsToSave.length > 0) {
        await setCampaignInputMappings(campaign.id, mappingsToSave, role);
      }

      if (launchImmediately) {
        await startCampaign(campaign.id, role);
      }

      navigate('/outbound-campaigns');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  // Review & Launch readiness — a BLOCKER only when current production
  // validation actually prevents a safe launch (no name, no agent
  // selected); everything else is informational.
  const blockers: string[] = [];
  if (name.trim().length === 0) blockers.push('Campaign name is required.');
  if (agentId.length === 0) blockers.push('A Call Agent must be selected.');
  if (requiredFieldsUnmapped.length > 0) {
    blockers.push(
      `${requiredFieldsUnmapped.length} required agent input field${requiredFieldsUnmapped.length === 1 ? ' is' : 's are'} not mapped (${requiredFieldsUnmapped.map((f) => f.displayName).join(', ')}).`,
    );
  }
  if (requiredOutcomesUnmapped.length > 0) {
    blockers.push(
      `${requiredOutcomesUnmapped.length} agent outcome${requiredOutcomesUnmapped.length === 1 ? '' : 's'} not mapped to a Campaign Classification (${requiredOutcomesUnmapped.map((o) => o.displayName).join(', ')}).`,
    );
  }
  if (advertisedOutcomes.length > 0 && !hasSuccessfulMapping) {
    blockers.push('At least one agent outcome must be mapped to the Successful Campaign Classification.');
  }
  if (!mappingDuplicates.valid) {
    blockers.push(`Duplicate source mapping(s): ${mappingDuplicates.duplicateSourceKeys.join(', ')} — each source field may back only one agent input.`);
  }
  const isReady = blockers.length === 0;

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) — Pattern B. */}
      <div className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div>
            <h1 className={typography.pageTitle}>Create Campaign</h1>
            <p className={typography.pageDescription}>Set up a new outbound call campaign.</p>
          </div>
          <Button variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" size="sm" onClick={() => navigate('/outbound-campaigns')}>
            Cancel
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4">
          {/* Mobile-only compact stage stepper — a horizontally-scrollable
              pill strip, never the full vertical nav squeezed beside the
              form (that clipped the form/actions off-screen at ~390px). */}
          <nav
            aria-label="Campaign creation stages"
            className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
          >
            {STAGES.map((label, i) => {
              const state = stageState(i);
              const locked = i > maxReachable && i !== step;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  title={label}
                  className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[11px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed ${
                    i === step ? 'bg-cyan-600 border-cyan-600 text-foreground' : state === 'completed' ? 'border-cyan-700 text-cyan-300' : 'border-border text-muted-foreground'
                  }`}
                >
                  {state === 'completed' && i !== step ? <Check size={12} /> : i + 1}
                </button>
              );
            })}
            <span className="shrink-0 text-[12px] text-muted-foreground ml-1">{STAGES[step]}</span>
          </nav>

          {/* Workflow stage navigator — contextual workflow chrome, not
              permanent app chrome; ~192px. Desktop/tablet only (md+); on
              mobile the compact stepper above replaces it so the current
              stage gets the full viewport width. */}
          <nav aria-label="Campaign creation stages" className="hidden md:block w-[192px] shrink-0 space-y-0.5">
            {STAGES.map((label, i) => {
              const state = stageState(i);
              const locked = i > maxReachable && i !== step;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`w-full text-left px-2.5 py-2 rounded text-[13px] flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed ${
                    i === step ? 'bg-cyan-600 text-foreground' : state === 'completed' ? 'text-cyan-300 hover:bg-card' : 'text-muted-foreground hover:bg-card'
                  }`}
                >
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full text-[10px] border border-current">
                    {state === 'completed' && i !== step ? <Check size={11} /> : i + 1}
                  </span>
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Current-stage workspace — one bounded surface, not nested cards. */}
          <div className="flex-1 min-w-0 w-full border border-border rounded-md bg-card/40 p-3 md:p-4">
            <h2 className={`${typography.cardTitle} mb-3`}>{STAGES[step]}</h2>

            {step === 0 && (
              <div className="space-y-3 max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-name" className="text-foreground">
                    Campaign Name
                  </Label>
                  <Input
                    id="campaign-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. October EMI Reminders"
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-description" className="text-foreground">
                    Description
                  </Label>
                  <Textarea
                    id="campaign-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-1.5 max-w-md">
                <Label className="text-foreground">Call Agent</Label>
                <Select
                  value={agentId}
                  onValueChange={(v) => {
                    setAgentId(v);
                    setFieldMappings({}); // a mapping keyed to the previous agent's field codes doesn't apply to a different contract
                    setOutcomeMappings({}); // same reasoning — a different agent's expected_outcomes[] codes
                  }}
                >
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder={isAgentsLoading ? 'Loading agents…' : 'Select a Call Agent'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.agentId} value={agent.agentId}>
                        {agent.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={typography.bodySecondary}>Required — every campaign target is called with this agent.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 max-w-2xl">
                <p className={typography.bodySecondary}>
                  Immutable snapshot of the selected Call Agent's contract, captured now so a later change to the
                  agent's live roster entry never silently rewrites what this campaign was configured against.
                </p>
                {agentContract ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={typography.cardTitle}>{agentContract.agentName}</span>
                      <Badge variant="outline" className="text-[11px] border-border text-foreground">
                        {agentContract.contractCompleteness === 'complete' ? 'Complete contract' : 'Partial contract (legacy)'}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px]">{agentContract.agentId}</div>
                    {agentContract.contractCompleteness === 'partial' ? (
                      <p className={`${typography.bodySecondary} border-t border-border pt-3`}>
                        Expected inputs and outcomes are not currently exposed by Call Centre for this agent. This
                        campaign uses the existing Trigger Call contract.
                      </p>
                    ) : (
                      <div className="space-y-4 border-t border-border pt-3">
                        <div>
                          <p className={`${typography.sectionTitle} mb-2`}>
                            Expected input fields ({agentContract.expectedInputFields.length})
                          </p>
                          {agentContract.expectedInputFields.length === 0 ? (
                            <p className={typography.bodySecondary}>None — this agent takes no campaign-driven inputs.</p>
                          ) : (
                            <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                              {agentContract.expectedInputFields.map((f) => (
                                <div key={f.fieldCode} className="flex items-center justify-between gap-3 px-3 py-2 bg-card/50">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`${typography.body} truncate`}>{f.displayName}</span>
                                    {f.required && (
                                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 flex-shrink-0 border-amber-700 text-amber-700 dark:border-amber-400 dark:text-amber-400">
                                        required
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-muted-foreground font-mono text-[11px]">{f.fieldCode}</span>
                                    {f.dataType && (
                                      <span className={`${typography.metadata} whitespace-nowrap`}>
                                        {f.dataType}{f.format ? `, ${f.format}` : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {agentContract.expectedOutcomes.length > 0 && (
                          <div>
                            <p className={`${typography.sectionTitle} mb-2`}>
                              Advertised outcomes ({agentContract.expectedOutcomes.length})
                            </p>
                            <p className={`${typography.bodySecondary} mb-2`}>
                              The outcome labels this agent's contract declares it may report back — used to validate
                              the Outcome Policy mapping in a later step.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {agentContract.expectedOutcomes.map((o) => (
                                <Badge key={o.outcomeCode} variant="outline" className="text-[11px] font-normal border-border text-foreground">
                                  {o.displayName}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Select a Call Agent first.</p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3 max-w-lg">
                <Label className="text-foreground">Audience (CSV)</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-5 text-center bg-background/60">
                  <Upload className="h-6 w-6 mx-auto text-slate-600 mb-2" aria-hidden="true" />
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => void handleCsvChange(e.target.files?.[0] ?? null)}
                    className="text-[12px] text-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Columns: <code>name, phone, customer_reference</code> (optional), plus extra columns captured as
                    campaign-specific attributes.
                  </p>
                </div>
                {csvErrors.length > 0 && (
                  <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded p-2">
                    {csvErrors.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                {csvRows.length > 0 && (
                  <div className="text-[12px]">
                    <p className="font-medium text-foreground mb-1.5">
                      {csvRows.length} rows parsed from Customer 360 + CSV. Preview:
                    </p>
                    <div className="overflow-x-auto border border-border rounded">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="text-left p-1.5">Name</th>
                            <th className="text-left p-1.5">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-border/60 last:border-b-0 text-foreground">
                              <td className="p-1.5">{row.name ?? '—'}</td>
                              <td className="p-1.5">{row.phone}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-2 text-[13px] max-w-lg">
                <p className="text-muted-foreground text-[12px]">
                  Maps the selected Call Agent's expected input fields to Customer 360 or CSV data. Campaign start
                  is blocked, deterministically, if a required field is left unmapped — never guessed by an AI.
                </p>
                {!agentContract && <p className={typography.bodySecondary}>Select a Call Agent first.</p>}
                {agentContract && agentContract.expectedInputFields.length === 0 && (
                  <p className="text-[12px] text-muted-foreground border border-border rounded p-2.5 bg-background/60">
                    This agent declares no expected input fields — there is nothing to map. The campaign will call
                    each target using its phone number, the selected agent, and its Customer 360 reference where
                    known, exactly as it does today.
                  </p>
                )}
                {agentContract && agentContract.expectedInputFields.length > 0 && (
                  <div className="space-y-2">
                    {csvColumns.length === 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 border border-amber-700/40 rounded p-2">
                        No CSV columns available yet — upload the Audience CSV (previous stage) to map its columns here, or map fields to Customer 360 data only.
                      </p>
                    )}
                    <div className="border border-border rounded divide-y divide-border">
                      {[...requiredInputFields, ...optionalInputFields].map((field) => {
                        const mapping = fieldMappings[field.fieldCode];
                        const usedElsewhere = sourceKeysUsedByOtherFields(field.fieldCode);
                        const availableCsvColumns = csvColumns.filter((col) => !usedElsewhere.has(`csv:${col}`));
                        const customer360Options: Array<{ value: string; label: string }> = [
                          { value: 'phone_number', label: 'Phone number' },
                          { value: 'customer_id', label: 'Customer 360 reference (CIF)' },
                        ].filter((opt) => !usedElsewhere.has(`customer360:${opt.value}`));
                        return (
                          <div key={field.fieldCode} className="p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-foreground">{field.displayName}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">{field.fieldCode}</span>
                              {field.required ? (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:border-amber-400 dark:text-amber-400">
                                  required
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
                                  optional
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={mapping?.sourceType ?? ''}
                                onValueChange={(v) =>
                                  setFieldMappings((prev) => ({
                                    ...prev,
                                    [field.fieldCode]: { sourceType: v as InputMappingSourceType, sourceField: '' },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 w-40 bg-background border-border text-foreground text-[12px]">
                                  <SelectValue placeholder="Source…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="customer360">Customer 360</SelectItem>
                                  <SelectItem value="csv">CSV column</SelectItem>
                                </SelectContent>
                              </Select>

                              {mapping?.sourceType === 'customer360' && (
                                <Select
                                  value={mapping.sourceField}
                                  onValueChange={(v) => setFieldMappings((prev) => ({ ...prev, [field.fieldCode]: { ...prev[field.fieldCode], sourceField: v } }))}
                                >
                                  <SelectTrigger className="h-8 flex-1 bg-background border-border text-foreground text-[12px]">
                                    <SelectValue placeholder="Field…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {customer360Options.length === 0 && mapping.sourceField === '' && (
                                      <SelectItem value="__none__" disabled>
                                        All Customer 360 fields already mapped
                                      </SelectItem>
                                    )}
                                    {customer360Options.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              {mapping?.sourceType === 'csv' && (
                                <Select
                                  value={mapping.sourceField}
                                  onValueChange={(v) => setFieldMappings((prev) => ({ ...prev, [field.fieldCode]: { ...prev[field.fieldCode], sourceField: v } }))}
                                  disabled={csvColumns.length === 0}
                                >
                                  <SelectTrigger className="h-8 flex-1 bg-background border-border text-foreground text-[12px]">
                                    <SelectValue placeholder={csvColumns.length === 0 ? 'No CSV columns' : 'Column…'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableCsvColumns.length === 0 && csvColumns.length > 0 && (
                                      <SelectItem value="__none__" disabled>
                                        All CSV columns already mapped
                                      </SelectItem>
                                    )}
                                    {availableCsvColumns.map((col) => (
                                      <SelectItem key={col} value={col}>
                                        {col}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {requiredFieldsUnmapped.length > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {requiredFieldsUnmapped.length} required field{requiredFieldsUnmapped.length === 1 ? '' : 's'} still unmapped — a target missing a
                        required value will not be dialled when the campaign runs.
                      </p>
                    )}
                    {!mappingDuplicates.valid && (
                      <p className="text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded p-2">
                        Duplicate source mapping{mappingDuplicates.duplicateSourceKeys.length === 1 ? '' : 's'}: {mappingDuplicates.duplicateSourceKeys.join(', ')} — each source field may
                        back only one agent input.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 text-[13px] max-w-2xl">
                {advertisedOutcomes.length > 0 && (
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Agent Outcome Mapping</h3>
                      <p className="text-muted-foreground text-[12px]">
                        Define what each Agent Outcome means for this campaign by mapping it to a Campaign
                        Classification. Classification codes are defined centrally by Call Centre, never invented per
                        campaign. Captured immutably at launch — a later change to this agent's contract never
                        reinterprets this campaign's history.
                      </p>
                    </div>
                    <div className="border border-border rounded overflow-hidden">
                      <table className="w-full text-[13px] text-foreground">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                            <th className="text-left py-2 px-3 font-medium">Agent Outcome</th>
                            <th className="text-left py-2 px-3 font-medium">Campaign Classification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advertisedOutcomes.map((outcome) => {
                            const classificationCode = outcomeMappings[outcome.outcomeCode];
                            return (
                              <tr key={outcome.outcomeCode} className="border-b border-border/60 last:border-b-0">
                                <td className="py-2 px-3 align-top">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-foreground">{outcome.displayName}</span>
                                    <span className="text-muted-foreground font-mono text-[10px]">{outcome.outcomeCode}</span>
                                  </div>
                                  {outcome.description && <p className="text-[11px] text-muted-foreground mt-0.5">{outcome.description}</p>}
                                </td>
                                <td className="py-2 px-3 align-top w-56">
                                  <Select
                                    value={classificationCode ?? ''}
                                    onValueChange={(v) => setOutcomeMappings((prev) => ({ ...prev, [outcome.outcomeCode]: v }))}
                                  >
                                    <SelectTrigger className="h-8 bg-background border-border text-foreground text-[12px]">
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {classifications.map((c) => (
                                        <SelectItem key={c.code} value={c.code} title={c.description ?? undefined}>
                                          {c.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {requiredOutcomesUnmapped.length > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {requiredOutcomesUnmapped.length} outcome{requiredOutcomesUnmapped.length === 1 ? '' : 's'} not yet mapped to a
                        Campaign Classification — required before Launch Now (Save as Draft remains available).
                      </p>
                    )}
                    {!hasSuccessfulMapping && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        At least one agent outcome must be mapped to the Successful classification — required before
                        Launch Now (Save as Draft remains available).
                      </p>
                    )}
                  </div>
                )}
                {advertisedOutcomes.length === 0 && agentContract && (
                  <p className="text-[12px] text-muted-foreground border border-border rounded p-2.5 bg-background/60">
                    {selectedAgent?.displayName ?? 'This agent'} advertises no business outcomes — there is nothing to
                    map to a Campaign Classification. Reconciled calls for this campaign will show only the generic
                    call-level result below.
                  </p>
                )}

                {/*
                  Session 12.7 §6 — hidden from the create UX once the
                  agent has structured outcomes to map (the table above
                  is the real outcome mechanism for those agents). The
                  generic rules state still defaults to
                  defaultResultRules() and is still submitted on create
                  — preserved as the required fallback for agents with
                  no structured outcome contract, and unchanged for
                  legacy campaigns already using it.
                */}
                {advertisedOutcomes.length === 0 && (
                <div className="space-y-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">Generic Call Result Rules</h3>
                    <p className="text-muted-foreground text-[12px]">
                      Call Centre determines the generic outcome of every call independently of the agent-specific
                      mapping above. These deterministic rules — seeded with generic conservative defaults — decide
                      what VoiceForce does with it. No AI interpretation happens here.
                    </p>
                  </div>
                {rules.map((rule, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border border-border rounded p-2.5">
                    <div>
                      <Label className={typography.label}>Match field</Label>
                      <Input
                        value={rule.matchField}
                        onChange={(e) => setRules((prev) => prev.map((r, j) => (j === i ? { ...r, matchField: e.target.value } : r)))}
                        className="h-8 bg-background border-border text-foreground text-[12px]"
                      />
                    </div>
                    <div>
                      <Label className={typography.label}>Match value</Label>
                      <Input
                        value={rule.matchValue}
                        onChange={(e) => setRules((prev) => prev.map((r, j) => (j === i ? { ...r, matchValue: e.target.value } : r)))}
                        className="h-8 bg-background border-border text-foreground text-[12px]"
                      />
                    </div>
                    <div>
                      <Label className={typography.label}>Result label</Label>
                      <Input
                        value={rule.resultLabel}
                        onChange={(e) =>
                          setRules((prev) =>
                            prev.map((r, j) => (j === i ? { ...r, resultLabel: e.target.value, resultCode: e.target.value.toLowerCase().replace(/\s+/g, '_') } : r)),
                          )
                        }
                        className="h-8 bg-background border-border text-foreground text-[12px]"
                      />
                    </div>
                    <div>
                      <Label className={typography.label}>Is success</Label>
                      <Select
                        value={rule.isSuccess === null ? 'null' : String(rule.isSuccess)}
                        onValueChange={(v) =>
                          setRules((prev) => prev.map((r, j) => (j === i ? { ...r, isSuccess: v === 'null' ? null : v === 'true' } : r)))
                        }
                      >
                        <SelectTrigger className="h-8 bg-background border-border text-foreground text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Success</SelectItem>
                          <SelectItem value="false">Failure</SelectItem>
                          <SelectItem value="null">Neither</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                  onClick={() =>
                    setRules((prev) => [
                      ...prev,
                      { priority: 100 + prev.length * 10, matchField: 'outcome', matchValue: '', resultCode: '', resultLabel: '', isSuccess: null, active: true },
                    ])
                  }
                >
                  Add rule
                </Button>
                </div>
                )}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-2 text-[13px] max-w-lg">
                <ReviewRow label="Campaign" value={name || '—'} status={name ? 'ready' : 'blocker'} />
                <ReviewRow
                  label="Call Agent"
                  value={agents.find((a) => a.agentId === agentId)?.displayName ?? (agentId ? agentId : '—')}
                  status={agentId ? 'ready' : 'blocker'}
                />
                <ReviewRow
                  label="Agent Contract"
                  value={agentContract ? (agentContract.contractCompleteness === 'complete' ? 'Complete' : 'Partial — legacy contract') : '—'}
                  status="info"
                />
                <ReviewRow label="Audience" value={`${csvRows.length} targets${csvFile ? ` from ${csvFile.name}` : ''}`} status={csvRows.length > 0 ? 'ready' : 'info'} />
                <ReviewRow
                  label="Input Mapping"
                  value={
                    requiredInputFields.length === 0
                      ? 'No required agent inputs for this agent'
                      : `${requiredInputFields.length - requiredFieldsUnmapped.length} of ${requiredInputFields.length} required fields mapped`
                  }
                  status={requiredFieldsUnmapped.length > 0 ? 'blocker' : 'ready'}
                />
                {advertisedOutcomes.length === 0 && (
                  <ReviewRow label="Outcome Policy" value={`${rules.length} generic rule${rules.length === 1 ? '' : 's'} configured`} status="ready" />
                )}
                {advertisedOutcomes.length > 0 && (
                  <ReviewRow
                    label="Agent Outcome Mapping"
                    value={
                      requiredOutcomesUnmapped.length > 0
                        ? `${advertisedOutcomes.length - requiredOutcomesUnmapped.length} of ${advertisedOutcomes.length} outcomes mapped to a Campaign Classification`
                        : !hasSuccessfulMapping
                          ? 'All outcomes mapped, but none as Successful'
                          : `${advertisedOutcomes.length} of ${advertisedOutcomes.length} outcomes mapped to a Campaign Classification`
                    }
                    status={requiredOutcomesUnmapped.length > 0 || !hasSuccessfulMapping ? 'blocker' : 'ready'}
                  />
                )}

                {!isReady && (
                  <div className="border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 rounded p-2.5 text-red-700 dark:text-red-300 space-y-1">
                    {blockers.map((b) => (
                      <div key={b} className="flex items-center gap-1.5">
                        <AlertTriangle size={12} aria-hidden="true" />
                        {b}
                      </div>
                    ))}
                  </div>
                )}
                {submitError && <p className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded p-2">{submitError}</p>}

                <div className="flex gap-2 pt-3">
                  <Button
                    variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                    size="sm"
                    disabled={create.isPending || importMutation.isPending}
                    onClick={() => void handleLaunch(false)}
                  >
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Save as Draft
                  </Button>
                  <Button size="sm" disabled={!isReady || create.isPending || importMutation.isPending} onClick={() => void handleLaunch(true)}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Launch Now
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-4 pt-3 border-t border-border">
              <Button variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" size="sm" onClick={() => (step === 0 ? navigate('/outbound-campaigns') : setStep((s) => s - 1))}>
                {step === 0 ? 'Cancel' : 'Back'}
              </Button>
              {step < STAGES.length - 1 && (
                <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

const ReviewRow: React.FC<{ label: string; value: string; status: 'ready' | 'info' | 'blocker' }> = ({ label, value, status }) => (
  <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-b-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="flex items-center gap-2 text-foreground">
      {value}
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'ready' ? 'bg-green-400' : status === 'info' ? 'bg-cyan-400' : 'bg-red-400'}`}
        aria-hidden="true"
      />
    </span>
  </div>
);

export default CreateCampaign;
