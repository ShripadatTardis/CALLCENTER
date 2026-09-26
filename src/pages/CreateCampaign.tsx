import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { parseTargetsCsv, useImportTargets } from '@/hooks/campaigns/useImportTargets';
import { defaultResultRules } from '@/lib/defaultResultRules';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { importCampaignTargets, startCampaign } from '@/services/campaigns/campaignsService';
import type { ImportTargetRow, NewResultRuleInput } from '@/types/campaign';

const STEPS = [
  'Basic Info',
  'Agent',
  'Agent Contract',
  'Target Audience',
  'Input Mapping',
  'Scheduling',
  'Result Mapping',
  'Review & Launch',
] as const;

/**
 * Kept as the existing step-wizard shell (plan §13/§20), rewired to real
 * data. Removed: the exhaustive Retry & Callback Policy fields (belongs
 * to "complex retry optimization", explicitly excluded), the
 * "Salesforce" source option, campaignType/scriptId selection (replaced
 * by a real agent selector + a minimal, deterministic result-rule
 * editor — never an LLM).
 */
const CreateCampaign: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<ImportTargetRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [rules, setRules] = useState<NewResultRuleInput[]>(defaultResultRules());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: agentsData, isLoading: isAgentsLoading } = useAgents();
  const agents = agentsData?.agents ?? [];

  const { create } = useCampaignActions();
  const importMutation = useImportTargets(undefined);

  const selectedAgent = agents.find((a) => a.agentId === agentId);
  const agentContract = selectedAgent ? buildAgentContractFromRoster(selectedAgent) : null;

  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return agentId.length > 0;
    // step 2 = Agent Contract — informational only, always OK to proceed.
    if (step === 3) return csvRows.length > 0;
    // step 4 = Input Mapping — no required fields exist on today's
    // partial/legacy contract, so nothing to block here yet either.
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
      const campaign = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        agentId,
        rules,
        sourceMeta: csvFile ? { originalFilename: csvFile.name, rowCount: csvRows.length } : undefined,
        agentName: selectedAgent?.displayName,
        agentContractSnapshot: agentContract ?? undefined,
      });

      if (csvRows.length > 0) {
        await importCampaignTargets(campaign.id, csvRows);
      }

      if (launchImmediately) {
        await startCampaign(campaign.id);
      }

      navigate('/outbound-campaigns');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Create Campaign</h1>
          <p className="text-slate-600">Set up a new AI-powered outbound voice campaign</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {STEPS.map((label, i) => (
            <Badge key={label} variant={i === step ? 'default' : 'outline'} className="text-xs">
              {i + 1}. {label}
            </Badge>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October EMI Reminders" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-description">Description</Label>
                  <Textarea id="campaign-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isAgentsLoading ? 'Loading agents…' : 'Select an agent'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.agentId} value={agent.agentId}>
                        {agent.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Required — every campaign target is called with this agent.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Immutable snapshot of the selected Call Agent's contract — captured now, so a later change to the
                  agent's live roster entry never silently rewrites what this campaign was configured against.
                </p>
                {agentContract ? (
                  <div className="border rounded p-3 space-y-2">
                    <div>
                      <span className="font-medium">Agent ID</span> — <code className="text-xs">{agentContract.agentId}</code>
                    </div>
                    <div>
                      <span className="font-medium">Agent Name</span> — {agentContract.agentName}
                    </div>
                    <div>
                      <span className="font-medium">Source</span> —{' '}
                      <Badge variant="outline" className="text-xs">
                        {agentContract.contractSource}
                      </Badge>{' '}
                      <Badge variant={agentContract.contractCompleteness === 'complete' ? 'default' : 'secondary'} className="text-xs">
                        {agentContract.contractCompleteness}
                      </Badge>
                    </div>
                    {agentContract.contractCompleteness === 'partial' && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Call Centre's Partner API does not yet expose expected input fields, expected outcomes, or
                        structured output fields for this agent — only its roster identity. The campaign will run
                        using today's legacy call fields (phone number, agent, and customer reference where known),
                        not a full input-mapping contract. This is honest, not a bug.
                      </p>
                    )}
                    <div>
                      <span className="font-medium">Expected inputs</span> —{' '}
                      {agentContract.expectedInputFields.length === 0 ? 'none discovered' : agentContract.expectedInputFields.length}
                    </div>
                    <div>
                      <span className="font-medium">Expected outcomes</span> —{' '}
                      {agentContract.expectedOutcomes.length === 0 ? 'none discovered' : agentContract.expectedOutcomes.length}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Select an agent first.</p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <Label>Target Audience (CSV)</Label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => void handleCsvChange(e.target.files?.[0] ?? null)}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Columns: <code>name, phone, customer_reference</code> (optional), plus any extra columns, captured as
                    campaign-specific attributes.
                  </p>
                </div>
                {csvErrors.length > 0 && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {csvErrors.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                {csvRows.length > 0 && (
                  <div className="text-sm">
                    <p className="font-medium mb-2">{csvRows.length} rows parsed. Preview:</p>
                    <div className="overflow-x-auto border rounded">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="text-left p-2">Name</th>
                            <th className="text-left p-2">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b">
                              <td className="p-2">{row.name ?? '—'}</td>
                              <td className="p-2">{row.phone}</td>
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
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Maps the selected Call Agent's expected input fields to Customer 360 or CSV data. Campaign start is
                  blocked if a required field is left unmapped — deterministically, never by an AI guess.
                </p>
                {agentContract && agentContract.expectedInputFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-slate-50 border rounded p-2">
                    Call Centre has not yet declared any expected input fields for this agent — there is nothing to
                    map. The campaign will call each target using its phone number, the selected agent, and its
                    Customer 360 reference where known, exactly as it does today.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Select an agent with a discovered contract first.</p>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-2">
                <Label htmlFor="scheduled-start">Scheduled Start (optional)</Label>
                <Input id="scheduled-start" type="datetime-local" value={scheduledStartAt} onChange={(e) => setScheduledStartAt(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Leave blank to launch immediately, or save as a draft and start manually later. Retry/callback scheduling
                  is handled automatically via the result rules below.
                </p>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Deterministic result rules — matched against the reconciled call's real outcome, never guessed by an AI.
                  Seeded with conservative defaults; edit before launch.
                </p>
                {rules.map((rule, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded p-3">
                    <div>
                      <Label className="text-xs">Match field</Label>
                      <Input
                        value={rule.matchField}
                        onChange={(e) => setRules((prev) => prev.map((r, j) => (j === i ? { ...r, matchField: e.target.value } : r)))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Match value</Label>
                      <Input
                        value={rule.matchValue}
                        onChange={(e) => setRules((prev) => prev.map((r, j) => (j === i ? { ...r, matchValue: e.target.value } : r)))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Result label</Label>
                      <Input
                        value={rule.resultLabel}
                        onChange={(e) =>
                          setRules((prev) =>
                            prev.map((r, j) => (j === i ? { ...r, resultLabel: e.target.value, resultCode: e.target.value.toLowerCase().replace(/\s+/g, '_') } : r)),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Is success</Label>
                      <Select
                        value={rule.isSuccess === null ? 'null' : String(rule.isSuccess)}
                        onValueChange={(v) =>
                          setRules((prev) => prev.map((r, j) => (j === i ? { ...r, isSuccess: v === 'null' ? null : v === 'true' } : r)))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Success</SelectItem>
                          <SelectItem value="false">Failure</SelectItem>
                          <SelectItem value="null">Neither</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
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

            {step === 7 && (
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Name:</strong> {name}
                </p>
                <p>
                  <strong>Agent:</strong> {agents.find((a) => a.agentId === agentId)?.displayName ?? agentId}
                </p>
                <p>
                  <strong>Targets:</strong> {csvRows.length} rows from {csvFile?.name ?? 'no file'}
                </p>
                <p>
                  <strong>Result rules:</strong> {rules.length} configured
                </p>
                {submitError && <p className="text-red-700 bg-red-50 border border-red-200 rounded p-2">{submitError}</p>}
                <div className="flex gap-2 pt-3">
                  <Button variant="outline" disabled={create.isPending || importMutation.isPending} onClick={() => void handleLaunch(false)}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Save as Draft
                  </Button>
                  <Button disabled={create.isPending || importMutation.isPending} onClick={() => void handleLaunch(true)}>
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Launch Now
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => (step === 0 ? navigate('/outbound-campaigns') : setStep((s) => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CreateCampaign;
