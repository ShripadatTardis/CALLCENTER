import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Info, ChevronRight } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCallData } from '@/hooks/calls/useCallData';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { useQaAnalysisFindings, useQaAnalysisPopulation } from '@/hooks/qa/useQaAnalysis';
import {
  filterFindings, filterReviews, computeCoveragePopulation, computeCoverageRate,
  reasonCodeDistribution, reasonCodeAffectedInteractions, agentAggregation, trendBuckets, interactionOutcomeAggregation,
  type QaAnalysisFinding, type QaTrendGranularity,
} from '@/lib/qaAnalysis';
import { computeQaRatios, type QaRatioResult } from '@/lib/qaRatios';
import { QA_PARAMETER_CODES, QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { QaReviewDialog } from '@/components/qa/QaReviewDialog';
import { formatFractionAsPercent, formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import { useCmaMeasures } from '@/hooks/cma/useCmaMeasures';
import { qaExplorerCmaWindow } from '@/lib/cma/cmaWindow';
import type { CmaMeasureRequest } from '@/types/cma';
import { useDatasetMode } from '@/contexts/DatasetModeContext';

/**
 * Session 4D — the central, governed QA population selector
 * (`qaPopulation: 'human'`) lets this page's 9 "Quality Measures" tiles
 * become CMA-authoritative WITHOUT silently combining in Automated QA,
 * which is exactly the population mismatch CMA-4B/4C identified and
 * deliberately left unmigrated. One canonical measure id per parameter
 * code — no new vocabulary invented, these are the same 9 ids already
 * registered and operational in the CMA algorithm registry.
 */
const QA_PARAMETER_TO_CANONICAL_MEASURE: Record<QaParameterCode, string> = {
  context_continuity_rate: 'CANON-CONTEXT-CONTINUITY-RATE',
  followup_understanding_rate: 'CANON-FOLLOWUP-UNDERSTANDING-RATE',
  task_progression_rate: 'CANON-TASK-PROGRESSION-RATE',
  reference_resolution_accuracy: 'CANON-REFERENCE-RES-ACC',
  unnecessary_clarification_rate: 'CANON-UNNECESSARY-CLARIFICATION-RATE',
  repetition_loop_rate: 'CANON-REPETITION-LOOP-RATE',
  customer_correction_rate: 'CANON-CUSTOMER-CORRECTION-RATE',
  conversation_recovery_rate: 'CANON-CONVERSATION-RECOVERY-RATE',
  response_grounding_rate: 'CANON-RESPONSE-GROUNDING-RATE',
};

const ALL = '__all__';

/** Page-local "data notes" popover — same keyboard/tap-accessible Radix Popover pattern as AgentDetail's DataNotes, not a hover-only title (WCAG 1.4.13). */
const Notes: React.FC<{ notes: string[] }> = ({ notes }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Data notes" className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 text-xs space-y-1.5" align="end">
      <ul className="space-y-1.5 text-muted-foreground list-disc list-inside">
        {notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </PopoverContent>
  </Popover>
);

interface DrillDownState {
  title: string;
  findings: QaAnalysisFinding[];
}

interface ViewReviewState {
  reviewId: string;
  channel: 'voice' | 'chat';
  interactionId: string;
  agentId: string;
  turnId: string;
}

/**
 * Session 16.2 — Human QA Quality Explorer. Submitted-reviews-only
 * aggregation (never IN_PROGRESS/abandoned drafts, never automated/API-
 * generated judgments — §10), built entirely on the already-verified
 * computeQaRatios (Session 16.1) so every percentage here uses the
 * exact same numerator/denominator/exclusion rules as the rest of the
 * Human QA system — this page adds scope (filters, reasons, trends,
 * agent comparison, drill-down), never a second ratio formula.
 *
 * Date semantics (§12): every date filter here is REVIEW SUBMISSION
 * DATE (qa_reviews.submitted_at), not interaction date. Interaction
 * date is not persisted anywhere in call_center — interactions live in
 * the external Voice/Chat Partner APIs — so filtering by it at the
 * aggregate level would mean an external API call per submitted review
 * merely to render a dashboard, which §22 explicitly warns against
 * ("avoid N+1 requests"). This is a deliberate, documented deviation
 * from the brief's "recommended default" of interaction date — labeled
 * "Submission date" everywhere in this UI, never silently called
 * "interaction date" (see docs/HUMAN_QA_QUALITY_EXPLORER.md).
 */
const QaQualityExplorer: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canView = hasPermission(user, 'qa.analytics.view');
  const { datasetId } = useDatasetMode();

  const [channel, setChannel] = useState<'all' | 'voice' | 'chat'>('all');
  const [agentId, setAgentId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reviewerUserId, setReviewerUserId] = useState(ALL);
  const [trendParameter, setTrendParameter] = useState<QaParameterCode>('task_progression_rate');
  const [trendGranularity, setTrendGranularity] = useState<QaTrendGranularity>('week');
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [viewReview, setViewReview] = useState<ViewReviewState | null>(null);

  const serverFilters = useMemo(() => ({
    channel: channel === 'all' ? undefined : channel,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    reviewerUserId: reviewerUserId === ALL ? undefined : reviewerUserId,
    datasetId: datasetId ?? undefined,
  }), [channel, dateFrom, dateTo, reviewerUserId, datasetId]);

  const findingsQuery = useQaAnalysisFindings(serverFilters);
  const populationQuery = useQaAnalysisPopulation(serverFilters);
  const agentsQuery = useAgents();

  const agentFilter = agentId === ALL ? {} : { agentId };
  const scopedFindings = useMemo(() => filterFindings(findingsQuery.data ?? [], agentFilter), [findingsQuery.data, agentId]);
  const scopedReviews = useMemo(() => filterReviews(populationQuery.data ?? [], agentFilter), [populationQuery.data, agentId]);
  const submittedReviews = useMemo(() => scopedReviews.filter((r) => r.status === 'submitted'), [scopedReviews]);

  // §11 "eligible interactions" — the only population figure this
  // Explorer cannot source from call_center.qa_* tables at all (those
  // only know about REVIEWED interactions); it requires the same
  // external, bounded (most-recent-100-rows) Voice/Chat population the
  // Interaction Quality list and Agent Detail pages already fetch and
  // document the same way. Reused here rather than built twice.
  const eligibleVoiceQuery = useCallData({ status: 'inactive', date_from: dateFrom || undefined, date_to: dateTo || undefined, page_size: 100 });
  const eligibleChatQuery = useChatLogs(1, undefined, agentId === ALL ? undefined : agentId);
  const eligibleInteractionsCount = useMemo(() => {
    if (channel === 'chat') return eligibleChatQuery.data?.pagination.totalCount ?? null;
    const voiceCount = (eligibleVoiceQuery.data?.interactions ?? []).filter((i) => agentId === ALL || i.agentId === agentId).length;
    if (channel === 'voice') return voiceCount;
    return eligibleVoiceQuery.data ? voiceCount + (eligibleChatQuery.data?.pagination.totalCount ?? 0) : null;
  }, [channel, agentId, eligibleVoiceQuery.data, eligibleChatQuery.data]);

  const coverage = computeCoveragePopulation(scopedReviews, scopedFindings);
  const coverageRate = computeCoverageRate(coverage.reviewedInteractionsCount, eligibleInteractionsCount);
  const legacyRatios = computeQaRatios(scopedFindings);

  // Session 4D — CMA has no "reviewer" dimension (not a registered
  // business filter anywhere in the registry), so a reviewer filter
  // falls back to the existing client-side computation rather than
  // silently ignoring that filter. Agent and channel are both CMA
  // dimensions, so those stay CMA-eligible either way.
  const canUseCma = hasPermission(user, 'cma.evaluate') && reviewerUserId === ALL;
  // Memoized deliberately: qaExplorerCmaWindow() reads Date.now() when no explicit date filter
  // is set, so calling it unmemoized on every render would produce a new query key (and a new,
  // never-settling request) on every render — see the identical fix/comment in useAgentDetail.ts.
  const cmaWindow = useMemo(() => qaExplorerCmaWindow(dateFrom, dateTo), [dateFrom, dateTo]);
  const cmaRequests: CmaMeasureRequest[] = QA_PARAMETER_CODES.map((code) => ({
    canonicalMeasureId: QA_PARAMETER_TO_CANONICAL_MEASURE[code],
    window: { from: cmaWindow.from, to: cmaWindow.to },
    filters: {
      ...(agentId !== ALL ? { agent: agentId } : {}),
      ...(channel !== 'all' ? { channel } : {}),
    },
    qaPopulation: 'human',
    datasetId,
  }));
  const cmaResults = useCmaMeasures(canUseCma, cmaRequests);

  const ratios: Record<QaParameterCode, QaRatioResult & { cmaUnavailableReason?: string }> = {} as Record<QaParameterCode, QaRatioResult & { cmaUnavailableReason?: string }>;
  QA_PARAMETER_CODES.forEach((code, i) => {
    const q = cmaResults[i];
    const evidence = canUseCma ? q.data?.groups[0]?.evidence : undefined;
    const resultKind = canUseCma ? q.data?.groups[0]?.result?.kind : undefined;
    if (canUseCma && evidence && resultKind !== 'unsupported_dimension' && resultKind !== 'unauthorized_filter') {
      const denominator = evidence.denominator ?? 0;
      const numerator = evidence.numerator ?? 0;
      ratios[code] = { parameterCode: code, numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
    } else {
      ratios[code] = legacyRatios[code];
    }
  });
  const reasons = reasonCodeDistribution(scopedFindings);
  const agentRows = useMemo(() => agentAggregation(scopedFindings, scopedReviews), [scopedFindings, scopedReviews]);
  const trend = useMemo(() => trendBuckets(scopedFindings, scopedReviews, trendParameter, trendGranularity), [scopedFindings, scopedReviews, trendParameter, trendGranularity]);
  const outcomes = useMemo(() => interactionOutcomeAggregation(scopedReviews), [scopedReviews]);

  const reviewerOptions = useMemo(() => Array.from(new Set((populationQuery.data ?? []).map((r) => r.reviewerUserId))), [populationQuery.data]);
  const agentDisplayName = (id: string) => agentsQuery.data?.agents.find((a) => a.agentId === id)?.displayName ?? id;

  if (!canView) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 p-4 space-y-3">
          <Button variant="ghost" size="sm" className="h-6 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/qa-review')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Interaction Quality
          </Button>
          <p className={typography.bodyMuted}>You don't have permission to view the Human QA Quality Explorer (requires qa.analytics.view).</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
        <Button variant="ghost" size="sm" className="h-6 -ml-2 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/qa-review')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Interaction Quality
        </Button>

        <div>
          <h1 className={typography.pageTitle}>Human QA Quality Explorer</h1>
          <p className={typography.pageDescription}>
            Aggregated from submitted Human QA reviews only — a separate measurement source from the automated Ratio Explorer (no automated/API-generated judgments, no in-progress drafts). Dates below are review submission date, not interaction date.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card/40 p-2">
          <div>
            <label className={`${typography.metadata} block mb-0.5`}>Channel</label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger className="h-[var(--height-filter-field)] w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={`${typography.metadata} block mb-0.5`}>Agent</label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-[var(--height-filter-field)] w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All agents</SelectItem>
                {(agentsQuery.data?.agents ?? []).map((a) => (
                  <SelectItem key={a.agentId} value={a.agentId}>{a.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={`${typography.metadata} block mb-0.5`}>Submitted from</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-[var(--height-filter-field)] w-36 text-xs" />
          </div>
          <div>
            <label className={`${typography.metadata} block mb-0.5`}>Submitted to</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-[var(--height-filter-field)] w-36 text-xs" />
          </div>
          <div>
            <label className={`${typography.metadata} block mb-0.5`}>Reviewer</label>
            <Select value={reviewerUserId} onValueChange={setReviewerUserId}>
              <SelectTrigger className="h-[var(--height-filter-field)] w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All reviewers</SelectItem>
                {reviewerOptions.map((id) => (
                  <SelectItem key={id} value={id} className="font-mono text-[11px]">{id.slice(0, 8)}…</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Session: Human QA Quality Explorer multi-tab redesign — the six
            analytical sections below were previously stacked vertically on
            one page (requiring ~50% browser zoom to see an overview).
            Grouped into five tabs per the brief; filters above stay shared
            across all tabs via the existing component state (no new fetch
            paths, no duplicated data-fetching — every section still reads
            from the same scopedFindings/scopedReviews/ratios/etc. computed
            once above). */}
        <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="bg-card border border-border h-9 flex-nowrap overflow-x-auto max-w-full justify-start flex-shrink-0">
            <TabsTrigger value="overview" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">Overview</TabsTrigger>
            <TabsTrigger value="failures" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">Failure Analysis</TabsTrigger>
            <TabsTrigger value="trends" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">Trends</TabsTrigger>
            <TabsTrigger value="agents" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">Agent Performance</TabsTrigger>
            <TabsTrigger value="outcomes" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">Interaction Outcomes</TabsTrigger>
          </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
        {/* Review coverage */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className={typography.sectionTitle}>Review Coverage</div>
            <Notes notes={[
              'Eligible interactions is a bounded figure: Voice counts the most recent 100 call-data rows within the selected submission-date range (the same bound documented on Interaction Quality/Agent Detail); Chat counts this agent selection\'s total sessions — Chat has no date filter today, so a date range narrows Voice but not Chat. Treat coverage as directional at the edges of a large population, not an exact census.',
              'Reviewed interactions counts DISTINCT interactions with at least one SUBMITTED review — a second independent review of the same interaction (calibration) still counts that interaction once here. Parameter measures below do NOT apply this dedup: each submitted review is an independent, complete assessment and contributes its own findings.',
            ]} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
            <Metric label="Eligible interactions" value={eligibleInteractionsCount === null ? '—' : String(eligibleInteractionsCount)} />
            <Metric label="Submitted reviews" value={String(coverage.submittedReviewsCount)} />
            <Metric label="Reviewed interactions" value={String(coverage.reviewedInteractionsCount)} />
            <Metric label="Coverage" value={coverageRate === null ? 'No eligible population' : formatFractionAsPercent(coverageRate)} />
            <Metric label="Findings" value={String(coverage.findingsCount)} />
            <Metric label="Reviews in progress" value={String(coverage.inProgressReviewsCount)} />
          </div>
        </div>

        {/* Quality measures */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className={typography.sectionTitle}>Quality Measures</div>
            <Notes notes={[
              canUseCma
                ? `Sourced from the Central Measures Authority, Human-QA population only (never combined with Automated QA) — window ${cmaWindow.isDefaultWindow ? 'defaults to the trailing 365 days' : 'matches your Submitted from/to filters'}.`
                : reviewerUserId !== ALL
                  ? 'Showing the existing client-computed figures — the Reviewer filter has no Central Measures Authority equivalent, so this stays on the prior calculation while that filter is active.'
                  : 'Showing the existing client-computed figures — your role does not hold CMA evaluation access.',
              'Either source uses the identical eligibility rule and numerator/denominator definition per parameter — only where the calculation runs differs, never the business meaning.',
            ]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {QA_PARAMETER_CODES.map((code) => {
              const def = QA_PARAMETERS[code];
              const r = ratios[code];
              const lowerBetter = def.directionality === 'lower_better';
              return (
                <button
                  key={code}
                  type="button"
                  disabled={r.denominator === 0}
                  onClick={() => setDrillDown({
                    title: `${def.displayName} — ${lowerBetter ? 'affected' : 'failed'} observations`,
                    findings: scopedFindings.filter((f) => f.parameterCode === code && f.value !== def.cleanValue && !(code === 'response_grounding_rate' && f.value === 'CANNOT_VERIFY')),
                  })}
                  className="text-left rounded border border-border bg-background/40 p-2 space-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed hover:border-cyan-500 dark:hover:border-cyan-400"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{def.displayName}</span>
                    {r.denominator > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className={typography.metricValue}>
                    {r.rate === null ? '—' : formatFractionAsPercent(r.rate)}
                  </div>
                  <div className={typography.metadata}>
                    {r.denominator === 0 ? 'No eligible population' : `${r.numerator} ${lowerBetter ? 'affected' : def.cleanValue} / ${r.denominator} eligible`}
                  </div>
                  <div className={typography.microCaption}>{lowerBetter ? 'Lower is better' : 'Higher is better'}</div>
                </button>
              );
            })}
          </div>
        </div>
        </TabsContent>

        <TabsContent value="failures" className="mt-3 space-y-3">
        {/* Failure reasons */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className={typography.sectionTitle}>Failure Reasons</div>
            <span className={typography.metadata}>Count = findings, not affected interactions</span>
          </div>
          {reasons.length === 0 ? (
            <p className={typography.bodySecondary}>No findings in the current scope.</p>
          ) : (
            <div className="rounded border border-border overflow-auto max-h-56">
              <table className={`w-full ${typography.tableBody}`}>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className={`text-left ${typography.tableHeader}`}>Parameter</th>
                    <th className={`text-left ${typography.tableHeader}`}>Reason</th>
                    <th className={`text-right ${typography.tableHeader}`}>Findings</th>
                    <th className={`text-right ${typography.tableHeader}`}>Affected interactions</th>
                    <th className={`px-2 py-1.5 ${typography.tableBody}`}></th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((r) => (
                    <tr key={`${r.parameterCode}:${r.reasonCode}`} className="border-b border-border/60 hover:bg-background/40">
                      <td className={`px-2 py-1.5 ${typography.tableBody}`}>{QA_PARAMETERS[r.parameterCode].displayName}</td>
                      <td className={`px-2 py-1.5 ${typography.tableBody}`}>{humanizeReasonCode(r.reasonCode)}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{r.count}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{reasonCodeAffectedInteractions(scopedFindings, r.parameterCode, r.reasonCode)}</td>
                      <td className={`text-right px-2 py-1.5 ${typography.tableBody}`}>
                        <button
                          type="button"
                          className="text-cyan-700 dark:text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                          onClick={() => setDrillDown({
                            title: `${QA_PARAMETERS[r.parameterCode].displayName} — ${humanizeReasonCode(r.reasonCode)}`,
                            findings: scopedFindings.filter((f) => f.parameterCode === r.parameterCode && f.reasonCode === r.reasonCode),
                          })}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </TabsContent>

        <TabsContent value="trends" className="mt-3 space-y-3">
        {/* Quality trend */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className={typography.sectionTitle}>Quality Trend</div>
            <div className="flex items-center gap-2">
              <Select value={trendParameter} onValueChange={(v) => setTrendParameter(v as QaParameterCode)}>
                <SelectTrigger className="h-7 w-48 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QA_PARAMETER_CODES.map((c) => <SelectItem key={c} value={c}>{QA_PARAMETERS[c].displayName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={trendGranularity} onValueChange={(v) => setTrendGranularity(v as QaTrendGranularity)}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {trend.length === 0 ? (
            <p className={typography.bodySecondary}>No submitted observations for this parameter in the current scope.</p>
          ) : (
            <div className="rounded border border-border overflow-auto max-h-48">
              <table className={`w-full ${typography.tableBody}`}>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className={`text-left ${typography.tableHeader}`}>Period starting</th>
                    <th className={`text-right ${typography.tableHeader}`}>Rate</th>
                    <th className={`text-right ${typography.tableHeader}`}>Numerator / Denominator</th>
                    <th className={`text-right ${typography.tableHeader}`}>Reviewed interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((b) => (
                    <tr key={b.periodStart} className="border-b border-border/60">
                      <td className={`px-2 py-1.5 ${typography.tableBody}`}>{b.periodStart}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{b.rate === null ? 'No eligible population' : formatFractionAsPercent(b.rate)}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{b.numerator} / {b.denominator}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{b.reviewedInteractionsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </TabsContent>

        <TabsContent value="agents" className="mt-3 space-y-3">
        {/* Agent comparison */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className={typography.sectionTitle}>Agent-Level Quality</div>
          {agentRows.length === 0 ? (
            <p className={typography.bodySecondary}>No submitted reviews in the current scope.</p>
          ) : (
            <div className="rounded border border-border overflow-auto max-h-56">
              <table className={`w-full ${typography.tableBody}`}>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className={`text-left ${typography.tableHeader}`}>Agent</th>
                    <th className={`text-right ${typography.tableHeader}`}>Reviewed interactions</th>
                    {QA_PARAMETER_CODES.map((c) => (
                      <th key={c} className="text-right font-medium px-2 py-1.5 whitespace-nowrap">{QA_PARAMETERS[c].displayName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map((row) => (
                    <tr key={row.agentId} className="border-b border-border/60">
                      <td className={`whitespace-nowrap px-2 py-1.5 ${typography.tableBody}`}>{agentDisplayName(row.agentId)}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>{row.reviewedInteractionsCount}</td>
                      {QA_PARAMETER_CODES.map((c) => (
                        <td key={c} className={`text-right tabular-nums px-2 py-1.5 ${typography.tableBody}`}>
                          {row.ratios[c].rate === null ? '—' : formatFractionAsPercent(row.ratios[c].rate)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={typography.metadata}>Every percentage keeps its own eligible-population denominator — an agent with few reviewed interactions is not equally representative as one with many; compare the "Reviewed interactions" column alongside any rate.</p>
        </div>
        </TabsContent>

        <TabsContent value="outcomes" className="mt-3 space-y-3">
        {/* Interaction-level Human QA outcomes */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          <div className={typography.sectionTitle}>Human-Reviewed Interaction Outcomes</div>
          <p className={typography.metadata}>These are Human QA judgments captured at review time, not Voice Agent API facts.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <OutcomeBreakdown title="Request Completion" breakdown={outcomes.requestCompletion} />
            <OutcomeBreakdown title="First Contact Resolution" breakdown={outcomes.fcr} />
            <OutcomeBreakdown title="Human Assistance Required" breakdown={outcomes.humanAssistanceRequired} />
          </div>
        </div>
        </TabsContent>
        </Tabs>
      </div>

      {drillDown && (
        <FailureDrillDownDialog
          title={drillDown.title}
          findings={drillDown.findings}
          onClose={() => setDrillDown(null)}
          onOpenEvidence={(f) => { setDrillDown(null); setViewReview({ reviewId: f.reviewId, channel: f.channel, interactionId: f.interactionId, agentId: f.agentId, turnId: f.primaryTurnId }); }}
        />
      )}

      <QaReviewDialog
        isOpen={Boolean(viewReview)}
        onClose={() => setViewReview(null)}
        channel={viewReview?.channel ?? 'voice'}
        interactionId={viewReview?.interactionId ?? null}
        agentId={viewReview?.agentId ?? null}
        viewReviewId={viewReview?.reviewId}
        initialTurnId={viewReview?.turnId}
      />
    </Layout>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded bg-background/40 p-1.5">
    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    <div className="text-sm font-semibold tabular-nums text-foreground">{value}</div>
  </div>
);

const OutcomeBreakdown: React.FC<{ title: string; breakdown: { counts: Record<string, number>; notSet: number; total: number } }> = ({ title, breakdown }) => (
  <div className="rounded border border-border p-1.5">
    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
    {breakdown.total === 0 ? (
      <p className="text-muted-foreground">No submitted reviews.</p>
    ) : (
      <div className="space-y-0.5">
        {Object.entries(breakdown.counts).map(([value, count]) => (
          <div key={value} className="flex items-center justify-between">
            <span className="text-foreground">{value}</span>
            <span className="tabular-nums text-muted-foreground">{count}</span>
          </div>
        ))}
        {breakdown.notSet > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Not set</span>
            <span className="tabular-nums">{breakdown.notSet}</span>
          </div>
        )}
      </div>
    )}
  </div>
);

/**
 * §16 evidence drill-down — one failed/affected observation per row:
 * the interaction, the primary turn, the reason, evidence-turn count,
 * and reviewer note if present. "View evidence" opens the exact
 * submitted review (QaReviewDialog in read-only mode) landed on that
 * turn — never a copied text snippet with no navigation.
 */
const FailureDrillDownDialog: React.FC<{
  title: string;
  findings: QaAnalysisFinding[];
  onClose: () => void;
  onOpenEvidence: (f: QaAnalysisFinding) => void;
}> = ({ title, findings, onClose, onOpenEvidence }) => (
  // HIG review fix (2026-10-10): this was a raw `fixed inset-0` div with
  // no focus trap, no initial focus, no Escape-to-close, mismatched
  // overlay opacity vs. the rest of the app. Reusing the shared Radix
  // Dialog gets all of that for free and matches every other dialog in
  // this product, instead of being a second, less-accessible modal
  // pattern.
  <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-3xl h-[80vh] max-h-[80vh] overflow-hidden flex flex-col gap-2 p-4">
      <DialogHeader className="flex-shrink-0">
        <DialogTitle className="text-sm">{title}</DialogTitle>
      </DialogHeader>
      <div className={`${typography.bodySecondary} flex-shrink-0`}>{findings.length} observation{findings.length === 1 ? '' : 's'}</div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {findings.length === 0 ? (
          <p className={typography.bodySecondary}>No observations.</p>
        ) : (
          findings.map((f) => (
            <div key={f.id} className="rounded border border-border p-2 text-xs space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">{f.channel}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{f.interactionId.slice(0, 8)}…</span>
                  <span className="text-muted-foreground">· {formatTimestamp(f.submittedAt)}</span>
                </span>
                <span className="font-medium text-foreground">{f.value}</span>
              </div>
              {f.reasonCode && <p className="text-foreground">{humanizeReasonCode(f.reasonCode)}</p>}
              {f.note && <p className="text-muted-foreground italic">"{f.note}"</p>}
              {f.evidenceTurnIds.length > 0 && <p className="text-muted-foreground">{f.evidenceTurnIds.length} supporting evidence turn{f.evidenceTurnIds.length === 1 ? '' : 's'}</p>}
              <Button variant="outline" size="xs" onClick={() => onOpenEvidence(f)}>View evidence</Button>
            </div>
          ))
        )}
      </div>
    </DialogContent>
  </Dialog>
);

export default QaQualityExplorer;
