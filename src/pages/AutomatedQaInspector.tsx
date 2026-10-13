import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, ChevronDown, ChevronRight, Info, CheckCircle2, HelpCircle } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaEvaluation } from '@/hooks/qa/useAutomatedQa';
import { computeAutomatedQaRatios } from '@/lib/automatedQaRatios';
import { QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { formatTimestamp, formatFractionAsPercent } from '@/lib/format';
import type { QaTurn } from '@/lib/qaConversation';
import type { AutomatedQaObservation } from '@/services/qa/automatedQaService';
import { AUTOMATED_QA_STATUS_BADGE } from '@/lib/automatedQaStatusBadge';
import { QualityMeasurementsHelpDialog } from '@/components/qa/QualityMeasurementsHelpDialog';

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
 */
const MEASUREMENT_ROW_GROUPS: QaParameterCode[][] = [
  ['context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate'],
  ['conversation_recovery_rate', 'response_grounding_rate'],
  ['unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate'],
];

const AutomatedQaInspector: React.FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [techOpen, setTechOpen] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const conversationContainerRef = useRef<HTMLDivElement | null>(null);
  const turnElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { data: evaluation, isLoading } = useAutomatedQaEvaluation(evaluationId ?? null);

  const turns: QaTurn[] = useMemo(() => (Array.isArray(evaluation?.transcriptSnapshot) ? evaluation!.transcriptSnapshot : []), [evaluation]);
  const turnIndexById = useMemo(() => new Map(turns.map((t, i) => [t.turnId, i + 1])), [turns]);

  const observations: AutomatedQaObservation[] = evaluation?.observations ?? [];
  const selectedFinding = observations.find((o) => o.id === selectedFindingId) ?? null;

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
          <Button variant="ghost" size="sm" className="h-6 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/qa-review')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Interaction Quality
          </Button>
          <p className="text-sm text-muted-foreground">You don't have permission to view Automated QA results (requires qa.automated.view).</p>
        </div>
      </Layout>
    );
  }

  if (isLoading || !evaluation) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 p-4">
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Loading evaluation…</p>
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
            onClick={() => navigate('/qa-review')}
            className="inline-flex items-center justify-center h-6 w-6 -ml-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 flex-shrink-0"
            aria-label="Back to Interaction Quality"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <h1 className="text-[16px] font-semibold leading-tight whitespace-nowrap">Automated QA Inspector</h1>
          <Badge variant="outline" className={`h-5 flex items-center gap-1 ${AUTOMATED_QA_STATUS_BADGE[evaluation.status] ?? ''}`}>
            {evaluation.status === 'completed' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {evaluation.status}
          </Badge>
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
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
            Evaluation failed ({evaluation.errorCode ?? 'unknown_error'}): {evaluation.errorMessage ?? 'No further detail available.'}
          </div>
        )}

        {/* Two-column desktop layout (≥1280px); stacks below that. */}
        <div className="grid grid-cols-1 xl:grid-cols-[58%_42%] gap-3 items-start">
          {/* LEFT — Quality Measurements + Findings */}
          <div className="min-w-0 space-y-3">
            {evaluation.status !== 'failed' && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <h2 className="text-[14px] font-semibold">Quality Measurements</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setHelpOpen(true)}
                        className="inline-flex items-center justify-center h-7 w-7 -my-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                        aria-label="Understanding Quality Measurements"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Understanding Quality Measurements</TooltipContent>
                  </Tooltip>
                </div>
                {/* Session 16.3.4 — ~50% smaller cards. Session 16.3.6 —
                    three separate 4-column grid rows (see
                    MEASUREMENT_ROW_GROUPS) so each group's unused
                    trailing cells stay genuinely empty instead of being
                    filled by the next group's items via grid auto-flow.
                    Direction (higher/lower-is-better) stays on the
                    card's own title tooltip. */}
                <div className="space-y-1.5">
                  {MEASUREMENT_ROW_GROUPS.map((group, groupIndex) => (
                    <div key={groupIndex} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
                      {group.map((code) => {
                        const def = QA_PARAMETERS[code];
                        const r = ratios[code];
                        const unassessable = evaluation.unassessableParameters.find((u) => u.parameterCode === code);
                        const directionLabel = def.directionality === 'higher_better' ? 'Higher is better' : 'Lower is better';
                        return (
                          <div
                            key={code}
                            className="rounded-md border border-border bg-card px-1.5 py-1 min-h-[38px] flex flex-col justify-center"
                            title={directionLabel}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="text-[10px] font-semibold leading-[1.15] line-clamp-2" title={def.displayName}>{def.displayName}</div>
                              {r.denominator === 0 && unassessable && (
                                <Info className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
                              )}
                            </div>
                            {r.denominator === 0 ? (
                              <div className="flex items-baseline gap-1" title={unassessable?.reason}>
                                <span className="text-[14px] font-semibold leading-tight text-muted-foreground">—</span>
                                <span className="text-[10px] text-muted-foreground truncate">No eligible population</span>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-1">
                                <span className="text-[14px] font-semibold leading-tight">{formatFractionAsPercent(r.rate ?? undefined)}</span>
                                <span className="text-[10px] text-muted-foreground truncate">{r.numerator}/{r.denominator} eligible</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {observations.length > 0 && (
              <div>
                <h2 className="text-[14px] font-semibold mb-1.5">Findings</h2>
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="h-[30px] bg-card text-muted-foreground uppercase tracking-wide text-[11px] font-semibold">
                          <th className="text-left px-2">Parameter</th>
                          <th className="text-left px-2">Value</th>
                          <th className="text-left px-2">Reason</th>
                          <th className="text-left px-2">Turn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observations.map((o) => {
                          const def = QA_PARAMETERS[o.parameterCode];
                          const isClean = o.value === def.cleanValue;
                          const turnIdx = turnIndexById.get(o.primaryTurnId);
                          const turnLabel = turnIdx ? `Turn ${turnIdx}` : o.primaryTurnId;
                          const isSelected = o.id === selectedFindingId;
                          return (
                            <tr
                              key={o.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={isSelected}
                              aria-label={`${isSelected ? 'Deselect' : 'Select'} finding for ${def.displayName}, turn ${turnLabel}`}
                              className={`h-8 border-t border-border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-muted/40'}`}
                              onClick={() => selectFinding(o)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  selectFinding(o);
                                }
                              }}
                            >
                              <td className="px-2 py-1">{def.displayName}</td>
                              <td className="px-2 py-1">
                                <Badge variant="outline" className={`h-5 ${isClean ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'}`}>
                                  {o.value}
                                </Badge>
                              </td>
                              <td className="px-2 py-1">{o.reasonCode ? humanizeReasonCode(o.reasonCode) : '—'}</td>
                              <td className="px-2 py-1 whitespace-nowrap" title={o.primaryTurnId}>{turnLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Conversation, Selected Finding, Technical Details */}
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="text-[14px] font-semibold mb-1.5">Conversation</h2>
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
              <h2 className="text-[14px] font-semibold mb-1.5">Selected Finding</h2>
              <div className="rounded-md border border-border bg-card p-2.5 min-h-[80px]" aria-live="polite">
                {selectedFinding ? (() => {
                  const def = QA_PARAMETERS[selectedFinding.parameterCode];
                  const isClean = selectedFinding.value === def.cleanValue;
                  const turnIdx = turnIndexById.get(selectedFinding.primaryTurnId);
                  return (
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px]">{def.displayName}</span>
                        <Badge variant="outline" className={`h-5 ${isClean ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'}`}>
                          {selectedFinding.value}
                        </Badge>
                      </div>
                      <div><span className="text-muted-foreground">Reason: </span>{selectedFinding.reasonCode ? humanizeReasonCode(selectedFinding.reasonCode) : '—'}</div>
                      <div><span className="text-muted-foreground">Turn: </span>{turnIdx ? `Turn ${turnIdx}` : selectedFinding.primaryTurnId}</div>
                      <div className="text-muted-foreground leading-snug pt-0.5">{selectedFinding.explanation ?? 'No explanation provided.'}</div>
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">Select a finding from the table to see its full explanation and evidence turn.</p>
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
    </Layout>
  );
};

export default AutomatedQaInspector;
