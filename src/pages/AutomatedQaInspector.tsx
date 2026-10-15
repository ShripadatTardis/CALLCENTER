import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, RefreshCw, History, Loader2, AlertCircle } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaEvaluation, useAutomatedQaEvaluationsForInteraction, useStartAutomatedQaEvaluation } from '@/hooks/qa/useAutomatedQa';
import { computeAutomatedQaRatios } from '@/lib/automatedQaRatios';
import { QA_PARAMETERS } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import type { QaTurn } from '@/lib/qaConversation';
import type { AutomatedQaObservation } from '@/services/qa/automatedQaService';
import { AUTOMATED_QA_STATUS_BADGE } from '@/lib/automatedQaStatusBadge';
import { QualityMeasurementsHelpDialog } from '@/components/qa/QualityMeasurementsHelpDialog';
import { QualityMeasurementsGrid } from '@/components/qa/QualityMeasurementsGrid';
import { FindingsList } from '@/components/qa/FindingsList';
import { AutomatedQaFailedBanner } from '@/components/qa/AutomatedQaFailedBanner';
import { isAutomatedQaInspectorReturnState } from '@/lib/automatedQaInspectorReturn';
import { CreateCorrectiveActionDialog } from '@/components/correctiveActions/CreateCorrectiveActionDialog';
import { buildCorrectiveActionInputFromAutomatedQaObservation } from '@/services/correctiveActions/qaAdapter';
import type { CreateCorrectiveActionInput } from '@/services/correctiveActions/correctiveActionsService';

/**
 * Session 16.3 — read-only Automated QA Inspector. Deliberately a SEPARATE
 * surface from QaReviewDialog (Human QA) — never embedded in it, never
 * linked from inside an active Human review (brief §17/§18 blind-review
 * requirement). Reuses the same QaTurn shape and turn-identity model as
 * Human QA's transcript panel (same primary/evidence-turn highlighting
 * convention) rather than inventing a second transcript rendering idiom,
 * but is its own component since QaReviewDialog's internal transcript
 * panel isn't factored out as a standalone reusable piece and is built
 * around the Human review workflow (Flag Issue, Good+Next, etc.) that
 * has no place here.
 *
 * Session 16.3.1/16.3.2 — density refinements (UI-only). Turn ids stay
 * the full "interactionId:timestamp:speaker" string everywhere in
 * state/props/click-targets — only the VISIBLE label is compacted to
 * "Turn N" (Findings) / "Speaker · HH:MM:SS" (Conversation), with the
 * full id still reachable via `title` and, for the evaluation/
 * interaction/model ids, via Technical Details.
 *
 * Session 16.3.3 — structural two-column desktop layout (≥1280px):
 * left column = Quality Measurements + Findings (no inline explanation
 * column anymore); right column = Conversation + a single Selected
 * Finding detail panel (explanation lives here now) + Technical
 * Details. Selecting a finding highlights its turn and scrolls ONLY the
 * Conversation panel's own internal scroll container (never the page) —
 * implemented by measuring the target turn element directly rather than
 * `Element.scrollIntoView`, which can also move ancestor/page scroll.
 */

/** Compact 24-hour time-only format ("04:16:21"). */
function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/**
 * Session 16.3.6 — display-only reordering of the Quality Measurements
 * grid into three explicit row groups (row 1: 4 higher-is-better; row 2:
 * 2 higher-is-better; row 3: all 3 lower-is-better, together). Rendered
 * as three SEPARATE grid containers rather than one flat grid, because a
 * single `grid-cols-4` with 9 items auto-flows to fill every cell left
 * to right regardless of a flat array's intended grouping — row 3's
 * items would visually creep up into row 2's "empty" cells instead of
 * leaving them empty, which is exactly what the brief rules out. This is
 * purely a rendering order — the canonical QA_PARAMETER_CODES array
 * (used for ratio calculation elsewhere) is untouched.
 *
 * Session 16.4.3.1 — the grid itself, the Findings table, and the
 * failed-evaluation banner below are now `QualityMeasurementsGrid`/
 * `FindingsList`/`AutomatedQaFailedBanner` (src/components/qa/),
 * extracted so Call Logs' new inline Automated QA tab renders the
 * EXACT same measurements/findings/failure presentation as this page,
 * never a second divergence-prone copy.
 */

const AutomatedQaInspector: React.FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [techOpen, setTechOpen] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const conversationContainerRef = useRef<HTMLDivElement | null>(null);
  const turnElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Session 16.4.3.1 — return-navigation (brief §6/§7). ONLY when this
  // Inspector was reached via Call Logs' new inline Automated QA tab's
  // "Open Full Inspector" action (a narrow, explicit discriminated
  // state — see src/lib/automatedQaInspectorReturn.ts) does Back go
  // back to Call Logs with the same interaction's dialog reopened on
  // the same tab. Every OTHER existing entry point (QA Review's own
  // navigation, a direct URL, History dropdown selection) is
  // completely unaffected — `location.state` is absent/different for
  // all of them, so `returnState` is null and the pre-existing
  // `navigate('/qa-review')` behavior applies unchanged.
  const returnState = isAutomatedQaInspectorReturnState(location.state) ? location.state : null;
  const backLabel = returnState ? 'Back to Call Logs' : 'Back to Interaction Quality';
  const handleBack = () => {
    if (returnState) {
      navigate('/call-logs', { state: { reopenInteraction: returnState.reopenInteraction } });
    } else {
      navigate('/qa-review');
    }
  };

  const { data: evaluation, isLoading } = useAutomatedQaEvaluation(evaluationId ?? null);

  // Session 16.3.8 (B1/B3) — Re-run QA + evaluation history. A re-run is
  // always a brand-new evaluation row (POST .../automatedQa?action=start
  // — see api/admin.ts handleAutomatedQaPost), never an update to this
  // one; history is every prior evaluation of the SAME interaction,
  // fetched read-only and never triggering an LLM call just by viewing
  // it. Both already existed server-side (brief §20 of Session 16.3)
  // — this session adds the Inspector-level UI for them.
  const canRun = hasPermission(user, 'qa.automated.run');
  const { data: history } = useAutomatedQaEvaluationsForInteraction(
    evaluation?.interactionId ?? null,
    evaluation?.channel ?? 'voice',
  );
  const startMutation = useStartAutomatedQaEvaluation();
  const [rerunError, setRerunError] = useState<string | null>(null);
  const isRerunning = startMutation.isPending;

  const handleRerun = async () => {
    if (!evaluation || !canRun) return;
    setRerunError(null);
    try {
      const next = await startMutation.mutateAsync({
        interactionId: evaluation.interactionId, channel: evaluation.channel, agentId: evaluation.agentId,
      });
      navigate(`/qa-review/automated/${next.id}`);
    } catch (err) {
      // On failure, the diagnostic is shown inline and the CURRENT
      // (previous) evaluation stays exactly as it was — a failed re-run
      // never replaces or hides a prior successful result (brief §B4).
      setRerunError(err instanceof Error ? err.message : 'Re-run failed to start.');
    }
  };

  const turns: QaTurn[] = useMemo(() => (Array.isArray(evaluation?.transcriptSnapshot) ? evaluation!.transcriptSnapshot : []), [evaluation]);
  const turnIndexById = useMemo(() => new Map(turns.map((t, i) => [t.turnId, i + 1])), [turns]);

  const observations: AutomatedQaObservation[] = evaluation?.observations ?? [];
  const selectedFinding = observations.find((o) => o.id === selectedFindingId) ?? null;
  const [createCaInput, setCreateCaInput] = useState<CreateCorrectiveActionInput | null>(null);
  const canCreateCorrectiveAction = hasPermission(user, 'corrective_actions.create');

  const ratios = useMemo(
    () => computeAutomatedQaRatios(observations.map((o) => ({ evaluationId: o.evaluationId, parameterCode: o.parameterCode, value: o.value }))),
    [observations],
  );

  // Scrolls ONLY the Conversation panel's own internal scroll container to
  // bring the target turn into view, centered — never the outer page.
  // `Element.scrollIntoView` was deliberately avoided here (brief §4): it
  // can walk up and move any scrollable ancestor, including the page
  // itself, which is exactly what "keep the overall page position
  // unchanged" rules out.
  const scrollConversationToTurn = (turnId: string) => {
    const container = conversationContainerRef.current;
    const target = turnElementRefs.current.get(turnId);
    if (!container || !target) return;
    const targetOffset = target.offsetTop - container.offsetTop;
    const centered = targetOffset - container.clientHeight / 2 + target.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, centered), behavior: 'smooth' });
  };

  const selectFinding = (o: AutomatedQaObservation) => {
    const next = selectedFindingId === o.id ? null : o.id;
    setSelectedFindingId(next);
    if (next) scrollConversationToTurn(o.primaryTurnId);
  };

  if (!user || !hasPermission(user, 'qa.automated.view')) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 p-4 space-y-3">
          <Button variant="ghost" size="sm" className="h-6 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={handleBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> {backLabel}
          </Button>
          <p className={typography.bodyMuted}>You don't have permission to view Automated QA results (requires qa.automated.view).</p>
        </div>
      </Layout>
    );
  }

  if (isLoading || !evaluation) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 p-4">
          <p className={typography.bodyMuted} role="status" aria-live="polite">Loading evaluation…</p>
        </div>
      </Layout>
    );
  }

  const coverageDenominator = evaluation.evaluatedTurnIds.length + evaluation.uncoveredTurnIds.length;

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
        {/* Session 16.3.4 — merged header + metadata into one compact
            horizontal bar (was: back link row + title/badge row +
            description paragraph + a separate metadata card, ~140px
            total). Interaction id is dropped from permanent horizontal
            space entirely — it's on the bar's own `title` tooltip and
            still shown in full in Technical Details.
            Session 16.3.5 — `inline-flex` instead of a full-width `flex`:
            the bar's content doesn't come close to filling 1536px, and a
            full-width border box around mostly-empty space read as
            wasted room. Hugs its own content width now; wraps normally
            on narrow viewports since flex-wrap is preserved. */}
        <div
          className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-1.5 max-w-full"
          title={`Interaction ${evaluation.interactionId}`}
        >
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center h-6 w-6 -ml-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 flex-shrink-0"
            aria-label={backLabel}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <h1 className="text-[16px] font-semibold leading-tight whitespace-nowrap">Automated QA Inspector</h1>
          <Badge variant="outline" className={`h-5 flex items-center gap-1 ${AUTOMATED_QA_STATUS_BADGE[evaluation.status] ?? ''}`}>
            {evaluation.status === 'completed' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {evaluation.status}
          </Badge>

          {/* Session 16.3.8 (B1) — Re-run QA. A new evaluation row,
              never an update to this one (see handleRerun above); on
              success navigates to the new evaluation, on failure shows
              the diagnostic inline and leaves this evaluation untouched. */}
          {canRun && (
            <Button
              variant="outline"
              size="xs"
              disabled={isRerunning}
              title="Start a new Automated QA evaluation of this interaction using the current evaluation logic — previous results are kept, not overwritten"
              className="h-6 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
              onClick={() => void handleRerun()}
            >
              {isRerunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              {isRerunning ? 'Evaluating…' : 'Re-run QA'}
            </Button>
          )}

          {/* Session 16.3.8 (B3) — compact evaluation-history selector.
              Viewing this never triggers a new LLM call (useAutomatedQaEvaluationsForInteraction
              is a read-only list fetch); selecting an entry opens that
              specific historical result, never blending or comparing runs. */}
          {history && history.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
                  title={`${history.length} evaluations of this interaction`}
                >
                  <History className="h-3 w-3 mr-1" />
                  History ({history.length})
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className={typography.microCaption}>Evaluation history — selecting opens that result</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {history.map((ev) => {
                  const denom = ev.evaluatedTurnIds.length + ev.uncoveredTurnIds.length;
                  const isCurrent = ev.id === evaluation.id;
                  return (
                    <DropdownMenuItem
                      key={ev.id}
                      disabled={isCurrent}
                      onClick={() => navigate(`/qa-review/automated/${ev.id}`)}
                      className={`text-xs flex-col items-start gap-0 ${isCurrent ? 'bg-muted/50' : ''}`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{ev.completedAt ? formatTimestamp(ev.completedAt) : formatTimestamp(ev.createdAt)}</span>
                        {isCurrent && <span className="text-[9px] text-muted-foreground">current</span>}
                      </span>
                      <span className={typography.microCaption}>
                        {ev.status} · {ev.promptVersion} · {denom > 0 ? `${ev.evaluatedTurnIds.length}/${denom} turns` : '—'}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <span className="text-border">|</span>
          <span className="text-[11px] capitalize">{evaluation.channel}</span>
          <span className="text-border">|</span>
          <span className="text-[11px] truncate max-w-[160px]" title={evaluation.agentId}>{evaluation.agentId}</span>
          <span className="text-border">|</span>
          <span className="text-[11px] whitespace-nowrap inline-flex items-center gap-1">
            {evaluation.evaluatedTurnIds.length}/{coverageDenominator} turns
            {evaluation.evaluationCompleteness === 'PARTIAL' && (
              <Badge variant="outline" className="h-[16px] px-1 text-[9px] border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400">PARTIAL</Badge>
            )}
          </span>
          <span className="text-border">|</span>
          <span className="text-[11px] truncate max-w-[140px]" title={evaluation.modelId ?? undefined}>{evaluation.modelId ?? '—'}</span>
          <span className="text-border">|</span>
          <span className="text-[11px] whitespace-nowrap">{evaluation.completedAt ? formatTimestamp(evaluation.completedAt) : '—'}</span>
        </div>

        {evaluation.status === 'failed' && (
          <AutomatedQaFailedBanner errorCode={evaluation.errorCode} errorMessage={evaluation.errorMessage} />
        )}

        {rerunError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>Re-run failed to start: {rerunError}. The evaluation shown below is unchanged.</span>
          </div>
        )}

        {/* Two-column desktop layout (≥1280px); stacks below that. */}
        <div className="grid grid-cols-1 xl:grid-cols-[58%_42%] gap-3 items-start">
          {/* LEFT — Quality Measurements + Findings. Session 16.4.3.1 —
              now the shared `QualityMeasurementsGrid`/`FindingsList`
              components (see their own header comments). */}
          <div className="min-w-0 space-y-3">
            {evaluation.status === 'failed' && observations.length === 0 && (
              // Session 16.4.4 (brief §7) — the failed banner above this
              // grid explains the error code/message, but this region
              // itself used to render nothing at all once both gates
              // below correctly hid their content, matching the blank-
              // panel gap docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md
              // §4 documented. An explicit, in-region explanation now
              // fills that space instead.
              <div className="rounded-md border border-border bg-card p-3">
                <p className={typography.bodyMuted}>Evaluation failed before producing quality measurements or findings.</p>
              </div>
            )}
            {evaluation.status !== 'failed' && (
              <QualityMeasurementsGrid
                ratios={ratios}
                unassessableParameters={evaluation.unassessableParameters}
                onHelpClick={() => setHelpOpen(true)}
              />
            )}
            <FindingsList
              observations={observations}
              turnIndexById={turnIndexById}
              selectedFindingId={selectedFindingId}
              onSelectFinding={selectFinding}
            />
          </div>

          {/* RIGHT — Conversation, Selected Finding, Technical Details */}
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className={`${typography.cardTitle} mb-1.5`}>Conversation</h2>
              <div ref={conversationContainerRef} className="rounded-md border border-border min-h-[100px] max-h-[420px] overflow-y-auto p-2.5 space-y-2">
                {turns.map((t) => {
                  const isPrimary = selectedFinding?.primaryTurnId === t.turnId;
                  const isEvidence = Boolean(selectedFinding && selectedFinding.primaryTurnId !== t.turnId && selectedFinding.evidenceTurnIds.includes(t.turnId));
                  const idx = turnIndexById.get(t.turnId);
                  return (
                    <div
                      key={t.turnId}
                      ref={(el) => {
                        if (el) turnElementRefs.current.set(t.turnId, el);
                        else turnElementRefs.current.delete(t.turnId);
                      }}
                      aria-current={isPrimary ? 'true' : undefined}
                      aria-label={isEvidence ? 'Evidence for selected finding' : undefined}
                      title={idx ? `Turn ${idx} · ${t.turnId}` : t.turnId}
                      className={`rounded px-2 py-1.5 text-[12.5px] leading-[1.4] ${isPrimary ? 'bg-amber-500/10 border border-amber-500/40' : isEvidence ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-card/30'}`}
                    >
                      <div className="text-[11px] font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">
                        <span>{t.speakerLabel} · {formatTimeOnly(t.timestamp)}</span>
                        {isPrimary && <Badge variant="outline" className="h-[18px] px-1 text-[10px] border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400">Primary</Badge>}
                        {!isPrimary && isEvidence && <Badge variant="outline" className="h-[18px] px-1 text-[10px] border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400">Evidence</Badge>}
                      </div>
                      <div className="font-normal text-foreground">{t.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className={`${typography.cardTitle} mb-1.5`}>Selected Finding</h2>
              <div className="rounded-md border border-border bg-card p-2.5 min-h-[80px]" aria-live="polite">
                {selectedFinding ? (() => {
                  const def = QA_PARAMETERS[selectedFinding.parameterCode];
                  const isClean = selectedFinding.value === def.cleanValue;
                  const turnIdx = turnIndexById.get(selectedFinding.primaryTurnId);
                  return (
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={typography.denseHeading}>{def.displayName}</span>
                        <Badge variant="outline" className={`h-5 ${isClean ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'}`}>
                          {selectedFinding.value}
                        </Badge>
                      </div>
                      <div><span className="text-muted-foreground">Reason: </span>{selectedFinding.reasonCode ? humanizeReasonCode(selectedFinding.reasonCode) : '—'}</div>
                      <div><span className="text-muted-foreground">Turn: </span>{turnIdx ? `Turn ${turnIdx}` : selectedFinding.primaryTurnId}</div>
                      <div className={`${typography.bodySecondary} pt-0.5`}>{selectedFinding.explanation ?? 'No explanation provided.'}</div>
                      {canCreateCorrectiveAction && (
                        <div className="pt-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              setCreateCaInput(
                                buildCorrectiveActionInputFromAutomatedQaObservation(selectedFinding, {
                                  evaluationId: evaluation.id,
                                  interactionId: evaluation.interactionId,
                                  channel: evaluation.channel,
                                  agentId: evaluation.agentId,
                                }),
                              )
                            }
                          >
                            Create Corrective Action
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <p className={typography.bodySecondary}>Select a finding from the table to see its full explanation and evidence turn.</p>
                )}
              </div>
            </div>

            <Collapsible open={techOpen} onOpenChange={setTechOpen}>
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-1 h-7 text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">
                  {techOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Technical details
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 rounded-md border border-border bg-card p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-6">
                <div className="truncate"><span className="text-muted-foreground">Interaction id: </span>{evaluation.interactionId}</div>
                <div className="truncate"><span className="text-muted-foreground">Agent id: </span>{evaluation.agentId}</div>
                <div><span className="text-muted-foreground">Transcript version: </span><span title={evaluation.transcriptHash}>{evaluation.transcriptHash.slice(0, 16)}…</span></div>
                <div className="truncate"><span className="text-muted-foreground">Request id(s): </span>{Array.isArray(evaluation.requestIds) ? (evaluation.requestIds.join(', ') || '—') : '—'}</div>
                <div><span className="text-muted-foreground">Model id: </span>{evaluation.modelId ?? '—'}</div>
                <div><span className="text-muted-foreground">Prompt version: </span>{evaluation.promptVersion}</div>
                <div><span className="text-muted-foreground">Contract version: </span>{evaluation.contractVersion}</div>
                <div><span className="text-muted-foreground">Schema version: </span>{evaluation.schemaVersion}</div>
                <div><span className="text-muted-foreground">Window count: </span>{evaluation.windowCount}</div>
                <div><span className="text-muted-foreground">Prompt tokens: </span>{evaluation.tokenUsage?.promptTokens ?? '—'}</div>
                <div><span className="text-muted-foreground">Completion tokens: </span>{evaluation.tokenUsage?.completionTokens ?? '—'}</div>
                <div><span className="text-muted-foreground">Latency: </span>{evaluation.latencyMs != null ? `${evaluation.latencyMs} ms` : '—'}</div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
      <QualityMeasurementsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <CreateCorrectiveActionDialog
        isOpen={Boolean(createCaInput)}
        onClose={() => setCreateCaInput(null)}
        initialValues={createCaInput ?? undefined}
      />
    </Layout>
  );
};

export default AutomatedQaInspector;
