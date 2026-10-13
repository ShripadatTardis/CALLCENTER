import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, HelpCircle, Info, ExternalLink, Scale, Copy, Check } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useQaPairCandidates, useQaComparisonDetail, useQaCalibrationBatch } from '@/hooks/qa/useQaCalibration';
import { useAgents } from '@/hooks/agents/useAgents';
import { QA_PARAMETERS, QA_PARAMETER_CODES, type QaParameterCode } from '@/lib/qaParameters';
import type { ComparisonClassification, QaPairCandidate } from '@/lib/qaComparison';
import { applicabilityMismatchConcentration, judgmentDisagreementConcentration, coverageDivergence, promptVersionComparison } from '@/lib/qaComparison';
import { formatFractionAsPercent, formatTimestamp } from '@/lib/format';
import { QualityMeasurementsHelpDialog } from '@/components/qa/QualityMeasurementsHelpDialog';

/**
 * Session 16.4 — Human QA vs Automated QA Calibration & Comparison.
 * Read-only, diagnostic: never mutates a review or evaluation, never
 * re-runs Automated QA, never treats Human QA as ground truth. Every
 * classification/count here is computed by src/lib/qaComparison.ts over
 * already-persisted data fetched through endpoints that were already
 * Agent-Scope/permission-enforced before this session — see
 * docs/QA_CALIBRATION_COMPARISON.md.
 *
 * Gated on BOTH qa.analytics.view (route-level, ProtectedRoute only
 * supports one permission) and qa.automated.view (checked here) — this
 * page surfaces both Human aggregate analytics and Automated evaluation
 * results, so holding only one side's permission is not enough.
 */

const CLASSIFICATION_LABEL: Record<ComparisonClassification, string> = {
  agreement: 'Agreement',
  disagreement: 'Disagreement',
  applicability_mismatch: 'Applicability mismatch',
  both_not_applicable: 'Both not applicable',
  not_comparable: 'Not comparable',
};

const CLASSIFICATION_BADGE: Record<ComparisonClassification, string> = {
  agreement: 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400',
  disagreement: 'border-red-600 text-red-700 dark:border-red-400 dark:text-red-400',
  applicability_mismatch: 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400',
  both_not_applicable: 'border-border text-muted-foreground',
  not_comparable: 'border-border text-muted-foreground',
};

function ClassificationBadge({ classification }: { classification: ComparisonClassification }) {
  return <Badge variant="outline" className={`h-5 text-[10px] ${CLASSIFICATION_BADGE[classification]}`}>{CLASSIFICATION_LABEL[classification]}</Badge>;
}

const ALL = '__all__';

/**
 * Session 16.4.1 — best truthful date to show for a paired interaction
 * in the list. This page does not fetch the raw Voice/Chat interaction
 * record (that would be a new per-row fetch this session deliberately
 * avoids — see docs/QA_CALIBRATION_COMPARISON.md), so there is no true
 * "interaction start time" available here. The most recent of the
 * latest review's submission and the latest evaluation's completion is
 * used instead — a real, already-fetched timestamp, never invented —
 * and is the most useful proxy for "how recently was this looked at."
 */
function bestCandidateDate(c: QaPairCandidate): string | null {
  const reviewDate = c.reviews[0]?.submittedAt ?? null;
  const evalDate = c.evaluations[0]?.completedAt ?? c.evaluations[0]?.createdAt ?? null;
  if (reviewDate && evalDate) return reviewDate > evalDate ? reviewDate : evalDate;
  return reviewDate ?? evalDate;
}

function shortenId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

const QaCalibration: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const canViewAutomated = hasPermission(user, 'qa.automated.view');

  const { candidates, isLoading: candidatesLoading } = useQaPairCandidates();
  const { entries: batchEntries, isLoading: batchLoading, truncated } = useQaCalibrationBatch(candidates);

  // Session 16.4.1 — agent display names for the paired-interactions list,
  // reusing the existing agents directory (no new endpoint). Falls back
  // to the raw agentId (truthful, never invented) when the directory
  // hasn't loaded or doesn't contain this agent.
  const { data: agentsData } = useAgents();
  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agentsData?.agents ?? []) map.set(a.agentId, a.displayName);
    return map;
  }, [agentsData]);

  const [channelFilter, setChannelFilter] = useState(ALL);
  const [agentFilter, setAgentFilter] = useState(ALL);
  const [parameterFilter, setParameterFilter] = useState<QaParameterCode | typeof ALL>(ALL);
  const [classificationFilter, setClassificationFilter] = useState<ComparisonClassification | typeof ALL>(ALL);
  const [promptVersionFilter, setPromptVersionFilter] = useState(ALL);

  const agentOptions = useMemo(() => Array.from(new Set(candidates.map((c) => c.agentId))).sort(), [candidates]);
  const promptVersionOptions = useMemo(() => Array.from(new Set(batchEntries.map((e) => e.promptVersion))).sort(), [batchEntries]);

  const filteredCandidates = useMemo(() => candidates.filter((c) => {
    if (channelFilter !== ALL && c.channel !== channelFilter) return false;
    if (agentFilter !== ALL && c.agentId !== agentFilter) return false;
    return true;
  }), [candidates, channelFilter, agentFilter]);

  const filteredBatchEntries = useMemo(() => batchEntries.filter((e) => {
    if (channelFilter !== ALL && e.candidate.channel !== channelFilter) return false;
    if (agentFilter !== ALL && e.candidate.agentId !== agentFilter) return false;
    if (promptVersionFilter !== ALL && e.promptVersion !== promptVersionFilter) return false;
    if (classificationFilter !== ALL) {
      const matchesClassification = parameterFilter !== ALL
        ? e.comparison.parameters[parameterFilter].classification === classificationFilter
        : QA_PARAMETER_CODES.some((code) => e.comparison.parameters[code].classification === classificationFilter);
      if (!matchesClassification) return false;
    }
    return true;
  }), [batchEntries, channelFilter, agentFilter, promptVersionFilter, classificationFilter, parameterFilter]);

  const summary = useMemo(() => {
    const classificationCounts: Record<ComparisonClassification, number> = { agreement: 0, disagreement: 0, applicability_mismatch: 0, both_not_applicable: 0, not_comparable: 0 };
    let totalCells = 0;
    let validated = 0;
    for (const e of filteredBatchEntries) {
      if (e.comparison.transcriptComparability === 'matched') validated += 1;
      const codes = parameterFilter === ALL ? QA_PARAMETER_CODES : [parameterFilter];
      for (const code of codes) {
        classificationCounts[e.comparison.parameters[code].classification] += 1;
        totalCells += 1;
      }
    }
    return { classificationCounts, totalCells, validated };
  }, [filteredBatchEntries, parameterFilter]);

  const [selectedCandidate, setSelectedCandidate] = useState<QaPairCandidate | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [selectedParameter, setSelectedParameter] = useState<QaParameterCode | null>(null);

  const selectCandidate = (c: QaPairCandidate) => {
    setSelectedCandidate(c);
    setSelectedReviewId(c.reviews[0].id);
    setSelectedEvaluationId(c.evaluations[0].id);
    setSelectedParameter(null);
  };

  const { review, evaluation, comparison, isLoading: detailLoading } = useQaComparisonDetail(selectedReviewId, selectedEvaluationId);

  const turnTextById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of evaluation?.transcriptSnapshot ?? []) map.set(t.turnId, `${t.speakerLabel}: ${t.text}`);
    return map;
  }, [evaluation]);

  const applicabilityInsight = useMemo(() => applicabilityMismatchConcentration(filteredBatchEntries.map((e) => e.comparison)), [filteredBatchEntries]);
  const disagreementInsight = useMemo(() => judgmentDisagreementConcentration(filteredBatchEntries.map((e) => e.comparison)), [filteredBatchEntries]);
  const coverageInsight = useMemo(() => coverageDivergence(filteredBatchEntries.map((e) => e.comparison)), [filteredBatchEntries]);
  const promptInsight = useMemo(
    () => promptVersionComparison(filteredBatchEntries.map((e) => ({ promptVersion: e.promptVersion, comparison: e.comparison }))),
    [filteredBatchEntries],
  );

  if (!user || !hasPermission(user, 'qa.analytics.view') || !canViewAutomated) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 p-4">
          <p className="text-sm text-muted-foreground">
            QA Calibration requires both <span className="font-medium">qa.analytics.view</span> and <span className="font-medium">qa.automated.view</span>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-[18px] font-semibold flex items-center gap-1.5"><Scale className="h-4 w-4" /> QA Calibration</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground" aria-label="Understanding Quality Measurements">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Understanding Quality Measurements</TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground max-w-2xl mt-0.5">
              A measurement reliability diagnostic — where Human QA and Automated QA agree, disagree, or disagree on whether a parameter even applied. Neither source is treated as ground truth; this never re-runs Automated QA or modifies either side's scoring.
            </p>
          </div>
        </div>

        {/* D1 — Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
          <SummaryCard label="Paired interactions" value={candidates.length} />
          <SummaryCard label="Eligible pairs (latest each)" value={batchEntries.length} loading={batchLoading} />
          <SummaryCard label="Validated comparable" value={summary.validated} hint="Transcript-hash-matched pairs only — see Known limitations." />
          <SummaryCard label="Agreement" value={summary.classificationCounts.agreement} of={summary.totalCells} tone="emerald" />
          <SummaryCard label="Disagreement" value={summary.classificationCounts.disagreement} of={summary.totalCells} tone="red" />
          <SummaryCard label="Applicability mismatch" value={summary.classificationCounts.applicability_mismatch} of={summary.totalCells} tone="amber" />
          <SummaryCard label="Not comparable" value={summary.classificationCounts.not_comparable + summary.classificationCounts.both_not_applicable} of={summary.totalCells} />
        </div>

        {truncated && (
          <p className="text-[10px] text-muted-foreground">Summary and insights below are computed over the 50 most recently paired interactions — see Known limitations in the documentation for why this is bounded.</p>
        )}

        {/* D4 — Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterSelect label="Channel" value={channelFilter} onChange={setChannelFilter} options={[{ value: 'voice', label: 'Voice' }, { value: 'chat', label: 'Chat' }]} />
          <FilterSelect label="Agent" value={agentFilter} onChange={setAgentFilter} options={agentOptions.map((a) => ({ value: a, label: a }))} />
          <FilterSelect label="Parameter" value={parameterFilter} onChange={(v) => setParameterFilter(v as QaParameterCode | typeof ALL)} options={QA_PARAMETER_CODES.map((c) => ({ value: c, label: QA_PARAMETERS[c].displayName }))} />
          <FilterSelect label="Classification" value={classificationFilter} onChange={(v) => setClassificationFilter(v as ComparisonClassification | typeof ALL)} options={(Object.keys(CLASSIFICATION_LABEL) as ComparisonClassification[]).map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))} />
          <FilterSelect label="Prompt version" value={promptVersionFilter} onChange={setPromptVersionFilter} options={promptVersionOptions.map((v) => ({ value: v, label: v }))} />
        </div>

        {/* Session 16.4.1 — comparison workspace: paired interactions
            (~35%) | selectors + transcript comparability + matrix (~65%).
            Evidence used to live inside the right column here, which made
            it grow very tall while the left column stayed mostly empty —
            it is now rendered as its own full-width block BELOW this
            grid (see ParameterDrillDown further down), never nested
            inside either column. */}
        <div className="grid grid-cols-1 xl:grid-cols-[35%_65%] gap-3 items-start">
          {/* Pairs list */}
          <div className="rounded-md border border-border overflow-hidden">
            <div className="h-8 flex items-center px-2 bg-card text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Paired interactions ({filteredCandidates.length})
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {candidatesLoading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
              {!candidatesLoading && filteredCandidates.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">No interaction currently has both a submitted Human QA review and an eligible Automated QA evaluation within scope.</p>
              )}
              {filteredCandidates.map((c) => {
                const isSelected = selectedCandidate?.interactionId === c.interactionId && selectedCandidate?.channel === c.channel;
                const agentLabel = agentNameById.get(c.agentId) ?? c.agentId;
                const dateLabel = bestCandidateDate(c);
                return (
                  <PairListItem
                    key={`${c.channel}:${c.interactionId}`}
                    candidate={c}
                    isSelected={isSelected}
                    agentLabel={agentLabel}
                    dateLabel={dateLabel}
                    onSelect={() => selectCandidate(c)}
                  />
                );
              })}
            </div>
          </div>

          {/* Selectors, transcript comparability, matrix */}
          <div className="space-y-3 min-w-0">
            {!selectedCandidate ? (
              <div className="rounded-md border border-border p-6 text-center text-xs text-muted-foreground">
                Select a paired interaction on the left to compare its Human QA review against an Automated QA evaluation.
              </div>
            ) : (
              <>
                {/* B2 — version selectors */}
                <div className="rounded-md border border-border p-2.5 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Human QA Review</div>
                      <Select value={selectedReviewId ?? undefined} onValueChange={setSelectedReviewId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectedCandidate.reviews.map((r) => (
                            <SelectItem key={r.id} value={r.id} className="text-xs">
                              {r.submittedAt ? formatTimestamp(r.submittedAt) : '—'} · {r.reviewerUserId.slice(0, 8)} · {r.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Automated QA Evaluation</div>
                      <Select value={selectedEvaluationId ?? undefined} onValueChange={setSelectedEvaluationId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectedCandidate.evaluations.map((e) => (
                            <SelectItem key={e.id} value={e.id} className="text-xs">
                              {e.completedAt ? formatTimestamp(e.completedAt) : formatTimestamp(e.createdAt)} · {e.promptVersion} · {e.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                    <TranscriptComparabilityBadge status={comparison?.transcriptComparability ?? null} />
                    <div className="flex items-center gap-2 text-[10px]">
                      {review && (
                        <button type="button" className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline" onClick={() => navigate('/qa-review')}>
                          <ExternalLink className="h-3 w-3" /> Original Human QA review
                        </button>
                      )}
                      {evaluation && (
                        <button type="button" className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline" onClick={() => navigate(`/qa-review/automated/${evaluation.id}`)}>
                          <ExternalLink className="h-3 w-3" /> Original Automated QA Inspector
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* D2 — nine-parameter matrix */}
                {detailLoading || !comparison ? (
                  <p className="text-xs text-muted-foreground">Loading comparison…</p>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="h-7 bg-card text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="text-left px-2">Parameter</th>
                          <th className="text-left px-2">Human QA</th>
                          <th className="text-left px-2">Automated QA</th>
                          <th className="text-left px-2">Comparison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {QA_PARAMETER_CODES.map((code) => {
                          const p = comparison.parameters[code];
                          const isSelectedRow = selectedParameter === code;
                          return (
                            <tr
                              key={code}
                              role="button"
                              tabIndex={0}
                              className={`h-9 border-t border-border cursor-pointer ${isSelectedRow ? 'bg-cyan-500/10' : 'hover:bg-muted/40'}`}
                              onClick={() => setSelectedParameter(isSelectedRow ? null : code)}
                            >
                              <td className="px-2 font-medium">{QA_PARAMETERS[code].displayName}</td>
                              <td className="px-2 text-muted-foreground">{p.human.denominator === 0 ? '—' : `${formatFractionAsPercent(p.human.rate ?? undefined)} (${p.human.numerator}/${p.human.denominator})`}</td>
                              <td className="px-2 text-muted-foreground">{p.automated.denominator === 0 ? '—' : `${formatFractionAsPercent(p.automated.rate ?? undefined)} (${p.automated.numerator}/${p.automated.denominator})`}</td>
                              <td className="px-2"><ClassificationBadge classification={p.classification} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* D3 — evidence drill-down. Full-width, outside the two-column
            workspace above (Session 16.4.1 — this used to be nested in
            the right column, forcing that column very tall while the
            left column sat mostly empty). Independently scrollable per
            side, capped height — see ParameterDrillDown. */}
        {selectedCandidate && comparison && selectedParameter && (
          <ParameterDrillDown
            parameterCode={selectedParameter}
            comparison={comparison.parameters[selectedParameter]}
            review={review}
            turnTextById={turnTextById}
          />
        )}

        {/* Part E — Calibration insights */}
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-90" /> Calibration insights
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            <p className="text-[11px] text-muted-foreground max-w-3xl flex items-start gap-1">
              <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
              Descriptive findings only, over the filtered pairs above — never an automatic conclusion about which side is correct, and never a claim that one prompt version is "better" than another without directly comparable evidence.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <InsightTable title="Applicability mismatch concentration" rows={applicabilityInsight} />
              <InsightTable title="Judgment disagreement concentration" rows={disagreementInsight} />
            </div>
            {coverageInsight.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold mb-1">Coverage divergence (Automated − Human eligible-opportunity count, averaged)</h3>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead><tr className="h-6 bg-card text-[9px] uppercase tracking-wide text-muted-foreground"><th className="text-left px-2">Parameter</th><th className="text-left px-2">Pairs compared</th><th className="text-left px-2">Mean difference</th></tr></thead>
                    <tbody>
                      {coverageInsight.map((r) => (
                        <tr key={r.parameterCode} className="h-7 border-t border-border">
                          <td className="px-2">{QA_PARAMETERS[r.parameterCode].displayName}</td>
                          <td className="px-2 text-muted-foreground">{r.pairsCompared}</td>
                          <td className="px-2 text-muted-foreground">{r.meanDenominatorDifference > 0 ? '+' : ''}{r.meanDenominatorDifference.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {promptInsight.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold mb-1">Disagreement by prompt version (descriptive only)</h3>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead><tr className="h-6 bg-card text-[9px] uppercase tracking-wide text-muted-foreground"><th className="text-left px-2">Parameter</th><th className="text-left px-2">Prompt</th><th className="text-left px-2">Comparable pairs</th><th className="text-left px-2">Disagreements</th></tr></thead>
                    <tbody>
                      {promptInsight.map((r) => (
                        <tr key={`${r.parameterCode}:${r.promptVersion}`} className="h-7 border-t border-border">
                          <td className="px-2">{QA_PARAMETERS[r.parameterCode].displayName}</td>
                          <td className="px-2 text-muted-foreground">{r.promptVersion}</td>
                          <td className="px-2 text-muted-foreground">{r.comparablePairs}</td>
                          <td className="px-2 text-muted-foreground">{r.disagreementCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <QualityMeasurementsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </Layout>
  );
};

function SummaryCard({ label, value, of, tone, hint, loading }: { label: string; value: number; of?: number; tone?: 'emerald' | 'red' | 'amber'; hint?: string; loading?: boolean }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'red' ? 'text-red-700 dark:text-red-400' : tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : '';
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5" title={hint}>
      <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      <div className={`text-[16px] font-semibold leading-tight ${toneClass}`}>
        {loading ? '…' : value}
        {of !== undefined && <span className="text-[10px] text-muted-foreground font-normal"> / {of}</span>}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-auto min-w-[110px] text-[11px]"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TranscriptComparabilityBadge({ status }: { status: 'matched' | 'mismatch' | 'unknown' | null }) {
  if (!status) return null;
  const label = status === 'matched' ? 'Transcript matched' : status === 'mismatch' ? 'Transcript mismatch' : 'Transcript comparability unknown';
  const cls = status === 'matched' ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : status === 'mismatch' ? 'border-red-600 text-red-700 dark:border-red-400 dark:text-red-400' : 'border-border text-muted-foreground';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`h-5 text-[10px] ${cls}`}>{label}</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-[11px]">
        {status === 'unknown'
          ? 'Human QA does not persist a transcript hash today, so this cannot be verified — this comparison is excluded from "Validated comparable" aggregates but still shown here for inspection.'
          : status === 'matched'
            ? 'Both assessments\' transcript hashes match.'
            : 'The two assessments\' transcript hashes differ — treat any disagreement here with that in mind.'}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Session 16.4.1 — supervisor-friendly paired-interaction row: agent
 * display name + a best-effort date as the primary line (see
 * bestCandidateDate), the shortened interaction id + channel + review/
 * evaluation counts as the secondary line. The full UUID stays
 * available via `title` (hover tooltip) and an explicit copy button —
 * never removed, just no longer the primary label.
 */
function PairListItem({
  candidate, isSelected, agentLabel, dateLabel, onSelect,
}: {
  candidate: QaPairCandidate;
  isSelected: boolean;
  agentLabel: string;
  dateLabel: string | null;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(candidate.interactionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can fail (permissions/insecure context) — not
      // worth surfacing an error for a convenience action; the full id
      // is still visible via the title tooltip either way.
    }
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/40 ${isSelected ? 'bg-cyan-500/10' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{agentLabel}{dateLabel ? ` · ${formatTimestamp(dateLabel)}` : ''}</span>
        <Badge variant="outline" className="h-4 text-[9px] capitalize flex-shrink-0">{candidate.channel}</Badge>
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono">{shortenId(candidate.interactionId)}</span>
          </TooltipTrigger>
          <TooltipContent className="text-[11px] font-mono">{candidate.interactionId}</TooltipContent>
        </Tooltip>
        <button type="button" onClick={copyId} aria-label="Copy full interaction id" className="text-muted-foreground hover:text-foreground">
          {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
        </button>
        <span>·</span>
        <span>{candidate.reviews.length} review{candidate.reviews.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{candidate.evaluations.length} evaluation{candidate.evaluations.length !== 1 ? 's' : ''}</span>
      </div>
    </button>
  );
}

function InsightTable({ title, rows }: { title: string; rows: { parameterCode: QaParameterCode; count: number; ofPairs: number }[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold mb-1">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No occurrences in the current filter.</p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map((r) => (
                <tr key={r.parameterCode} className="h-7 border-t border-border first:border-t-0">
                  <td className="px-2">{QA_PARAMETERS[r.parameterCode].displayName}</td>
                  <td className="px-2 text-muted-foreground text-right">{r.count} of {r.ofPairs} pairs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Session 16.4.1 — the per-side empty-state message distinguishes WHY there's nothing to show, using the existing classification/ratio data — never a bare blank panel. */
function emptyEvidenceMessage(sideDenominator: number, classification: ComparisonClassification): string {
  if (sideDenominator === 0) return 'Not applicable — no eligible observation recorded for this parameter.';
  if (classification === 'not_comparable') return 'No overlapping evidence — assessed on different turns than the other side.';
  return 'No eligible observation recorded for this parameter.';
}

/**
 * Session 16.4.1 — full-width evidence comparison, rendered OUTSIDE the
 * two-column comparison workspace (see the caller) so expanding it never
 * stretches an otherwise-empty sibling column. Two equal columns,
 * independently scrollable with a sticky heading once content exceeds
 * ~460px on desktop; on mobile the columns stack and scroll with the
 * page instead (no nested scroll region, per the brief's mobile
 * guidance).
 */
function ParameterDrillDown({
  parameterCode, comparison, review, turnTextById,
}: {
  parameterCode: QaParameterCode;
  comparison: import('@/lib/qaComparison').ParameterComparison;
  review: import('@/services/qa/qaService').QaReview | null;
  turnTextById: Map<string, string>;
}) {
  const humanFindings = (review?.findings ?? []).filter((f) => f.parameterCode === parameterCode);
  const humanEmpty = emptyEvidenceMessage(comparison.human.denominator, comparison.classification);
  const automatedEmpty = emptyEvidenceMessage(comparison.automated.denominator, comparison.classification);
  const hasAutomatedEvidence = comparison.turnComparisons.length > 0 || comparison.automatedOnlyTurnIds.length > 0;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border bg-card">
        <h3 className="text-[12px] font-semibold">{QA_PARAMETERS[parameterCode].displayName} — Evidence Comparison</h3>
        <ClassificationBadge classification={comparison.classification} />
      </div>
      <p className="text-[11px] text-muted-foreground px-2.5 pt-2">{comparison.reason}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:divide-x sm:divide-border mt-2">
        <div className="flex flex-col max-h-none sm:max-h-[460px]">
          <div className="sticky top-0 bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2.5 py-1.5 border-b border-border">Human QA Evidence</div>
          <div className="px-2.5 py-2 space-y-1.5 sm:overflow-y-auto">
            {humanFindings.length === 0 && <p className="text-[11px] text-muted-foreground">{humanEmpty}</p>}
            {humanFindings.map((f) => (
              <div key={f.id} className="rounded border border-border p-1.5 text-[11px] space-y-0.5">
                <div className="flex items-center gap-1.5"><Badge variant="outline" className="h-4 text-[9px]">{f.value}</Badge>{f.reasonCode && <span className="text-muted-foreground">{f.reasonCode}</span>}</div>
                <div className="text-muted-foreground">{turnTextById.get(f.primaryTurnId) ?? `Turn ${f.primaryTurnId}`}</div>
                {f.note && <div className="italic text-muted-foreground">"{f.note}"</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col max-h-none sm:max-h-[460px]">
          <div className="sticky top-0 bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2.5 py-1.5 border-b border-border">Automated QA Evidence</div>
          <div className="px-2.5 py-2 space-y-1.5 sm:overflow-y-auto">
            {!hasAutomatedEvidence && <p className="text-[11px] text-muted-foreground">{automatedEmpty}</p>}
            {comparison.turnComparisons.map((t) => (
              <div key={t.turnId} className="rounded border border-border p-1.5 text-[11px] space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="h-4 text-[9px]">{t.automatedValue}</Badge>
                  {t.cannotVerifyInvolved ? (
                    <span className="text-[9px] text-muted-foreground">cannot verify — excluded from agreement</span>
                  ) : (
                    <span className={`text-[9px] ${t.agree ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{t.agree ? 'agrees with Human' : 'disagrees with Human'}</span>
                  )}
                </div>
                <div className="text-muted-foreground">{turnTextById.get(t.turnId) ?? `Turn ${t.turnId}`}</div>
              </div>
            ))}
            {comparison.automatedOnlyTurnIds.map((turnId) => (
              <div key={turnId} className="rounded border border-dashed border-border p-1.5 text-[11px] text-muted-foreground">
                Automated-only: {turnTextById.get(turnId) ?? `Turn ${turnId}`}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(comparison.humanOnlyTurnIds.length > 0 || comparison.automatedOnlyTurnIds.length > 0) && (
        <p className="text-[10px] text-muted-foreground px-2.5 py-2 border-t border-border">
          Coverage difference: {comparison.humanOnlyTurnIds.length} turn(s) assessed by Human QA only, {comparison.automatedOnlyTurnIds.length} by Automated QA only — not blended into the agreement/disagreement count above.
        </p>
      )}
    </div>
  );
}

export default QaCalibration;
