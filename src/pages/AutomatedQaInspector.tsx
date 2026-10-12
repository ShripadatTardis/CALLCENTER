import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaEvaluation } from '@/hooks/qa/useAutomatedQa';
import { computeAutomatedQaRatios } from '@/lib/automatedQaRatios';
import { QA_PARAMETER_CODES, QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { formatTimestamp, formatFractionAsPercent } from '@/lib/format';
import type { QaTurn } from '@/lib/qaConversation';
import type { AutomatedQaObservation } from '@/services/qa/automatedQaService';
import { AUTOMATED_QA_STATUS_BADGE } from '@/lib/automatedQaStatusBadge';

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
 * Session 16.3.1 — density refinement (UI-only; no evaluation logic,
 * measurement math, persistence, or auth changed). Turn ids stay the
 * full "interactionId:timestamp:speaker" string everywhere in state/
 * props/click-targets — only the VISIBLE label is compacted to "Turn N"
 * (Findings) / "Speaker · HH:MM:SS" (Conversation), with the full id
 * still reachable via `title` and, for the evaluation/interaction/model
 * ids, via Technical Details.
 */

/** Compact 24-hour time-only format ("04:16:21") for the density-refined transcript/findings views. */
function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const MetaField: React.FC<{ label: string; value: React.ReactNode; title?: string; className?: string }> = ({ label, value, title, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    <div className="text-xs font-medium leading-tight truncate" title={title}>{value}</div>
  </div>
);

const AutomatedQaInspector: React.FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [techOpen, setTechOpen] = useState(false);
  const [jumpTurnId, setJumpTurnId] = useState<string | null>(null);
  const [jumpAnnouncement, setJumpAnnouncement] = useState<string | null>(null);
  const [expandedFindingIds, setExpandedFindingIds] = useState<Set<string>>(new Set());
  const primaryTurnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (jumpTurnId) {
      primaryTurnRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setJumpAnnouncement(`Jumped to turn ${jumpTurnId}`);
    }
  }, [jumpTurnId]);

  const { data: evaluation, isLoading } = useAutomatedQaEvaluation(evaluationId ?? null);

  const turns: QaTurn[] = useMemo(() => (Array.isArray(evaluation?.transcriptSnapshot) ? evaluation!.transcriptSnapshot : []), [evaluation]);
  const turnIndexById = useMemo(() => new Map(turns.map((t, i) => [t.turnId, i + 1])), [turns]);

  const observations: AutomatedQaObservation[] = evaluation?.observations ?? [];

  const ratios = useMemo(
    () => computeAutomatedQaRatios(observations.map((o) => ({ evaluationId: o.evaluationId, parameterCode: o.parameterCode, value: o.value }))),
    [observations],
  );

  const toggleExpanded = (id: string) => {
    setExpandedFindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        {/* A. Compact page header (~52px content + 12px gap below) */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => navigate('/qa-review')}
            className="inline-flex items-center gap-1 min-h-6 -ml-0.5 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Interaction Quality
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold leading-tight">Automated QA Inspector</h1>
            <Badge variant="outline" className={AUTOMATED_QA_STATUS_BADGE[evaluation.status] ?? ''}>{evaluation.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Independent LLM evaluation — a separate measurement source from Human QA. Read-only.
          </p>
        </div>

        {/* B. Compact metadata strip (single row on desktop) */}
        <div className="rounded-md border border-border bg-card px-3 py-2 flex flex-wrap items-start gap-x-4 gap-y-2">
          <MetaField label="Interaction" value={`${evaluation.interactionId.slice(0, 8)}…`} title={evaluation.interactionId} className="w-28" />
          <MetaField label="Channel" value={<span className="capitalize">{evaluation.channel}</span>} className="w-16" />
          <MetaField label="Agent" value={evaluation.agentId} title={evaluation.agentId} className="w-36" />
          <MetaField
            label="Coverage"
            value={
              <span className="inline-flex items-center gap-1">
                {evaluation.evaluatedTurnIds.length}/{coverageDenominator} turns
                {evaluation.evaluationCompleteness === 'PARTIAL' && (
                  <Badge variant="outline" className="h-[18px] px-1 text-[10px] border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400">PARTIAL</Badge>
                )}
              </span>
            }
            className="w-28"
          />
          <MetaField label="Model" value={evaluation.modelId ?? '—'} title={evaluation.modelId ?? undefined} className="w-32" />
          <MetaField label="Evaluated" value={evaluation.completedAt ? formatTimestamp(evaluation.completedAt) : '—'} className="w-28" />
        </div>

        {evaluation.status === 'failed' && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
            Evaluation failed ({evaluation.errorCode ?? 'unknown_error'}): {evaluation.errorMessage ?? 'No further detail available.'}
          </div>
        )}

        {/* C. Quality measurements — compact 3x3 grid on desktop */}
        {evaluation.status !== 'failed' && (
          <div>
            <h2 className="text-[14px] font-semibold mb-1.5">Quality Measurements</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {QA_PARAMETER_CODES.map((code) => {
                const def = QA_PARAMETERS[code];
                const r = ratios[code];
                const unassessable = evaluation.unassessableParameters.find((u) => u.parameterCode === code);
                const directionLabel = def.directionality === 'higher_better' ? '↑ Better' : '↓ Better';
                return (
                  <div key={code} className="rounded-md border border-border bg-card px-2.5 py-2 min-h-[68px] flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-[12px] font-semibold truncate" title={def.displayName}>{def.displayName}</div>
                      {r.denominator === 0 && unassessable && (
                        <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    {r.denominator === 0 ? (
                      <div className="flex items-baseline justify-between gap-1" title={unassessable?.reason}>
                        <span className="text-[18px] font-semibold leading-tight text-muted-foreground">—</span>
                        <span className="text-[11px] text-muted-foreground truncate">No eligible population</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[18px] font-semibold leading-tight">{formatFractionAsPercent(r.rate ?? undefined)}</span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{r.numerator}/{r.denominator} eligible</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{directionLabel}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* D. Findings — compact evidence table */}
        {observations.length > 0 && (
          <div className="mt-3">
            <h2 className="text-[14px] font-semibold mb-1.5">Findings</h2>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="h-8 bg-card/60 text-muted-foreground uppercase tracking-wide text-[11px]">
                    <th className="text-left px-2.5">Parameter</th>
                    <th className="text-left px-2.5">Value</th>
                    <th className="text-left px-2.5">Reason</th>
                    <th className="text-left px-2.5">Turn</th>
                    <th className="text-left px-2.5">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map((o) => {
                    const def = QA_PARAMETERS[o.parameterCode];
                    const isClean = o.value === def.cleanValue;
                    const activate = () => setJumpTurnId(o.primaryTurnId);
                    const turnIdx = turnIndexById.get(o.primaryTurnId);
                    const turnLabel = turnIdx ? `Turn ${turnIdx}` : o.primaryTurnId;
                    const isExpanded = expandedFindingIds.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`View turn ${turnLabel} for ${def.displayName}`}
                        className="h-9 border-t border-border hover:bg-muted/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                        onClick={activate}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activate();
                          }
                        }}
                      >
                        <td className="px-2.5 py-1.5">{def.displayName}</td>
                        <td className="px-2.5 py-1.5">
                          <Badge variant="outline" className={`h-[21px] ${isClean ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'}`}>
                            {o.value}
                          </Badge>
                        </td>
                        <td className="px-2.5 py-1.5">{o.reasonCode ? humanizeReasonCode(o.reasonCode) : '—'}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap" title={o.primaryTurnId}>{turnLabel}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground max-w-sm align-top">
                          <span className={isExpanded ? '' : 'line-clamp-2'}>{o.explanation ?? '—'}</span>
                          {o.explanation && (
                            <button
                              type="button"
                              className="block text-[11px] text-cyan-700 dark:text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 mt-0.5"
                              aria-expanded={isExpanded}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(o.id);
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* E. Conversation — compact transcript viewer */}
        <div className="mt-3">
          <h2 className="text-[14px] font-semibold mb-1.5">Conversation</h2>
          <p className="sr-only" role="status" aria-live="polite">{jumpAnnouncement}</p>
          <div className="rounded-md border border-border h-[320px] overflow-y-auto p-2.5 space-y-2">
            {turns.map((t) => {
              const isPrimary = jumpTurnId === t.turnId;
              const isEvidence = observations.some((o) => o.primaryTurnId === jumpTurnId && o.evidenceTurnIds.includes(t.turnId));
              const idx = turnIndexById.get(t.turnId);
              return (
                <div
                  key={t.turnId}
                  ref={isPrimary ? primaryTurnRef : undefined}
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

        {/* F. Technical details — collapsed by default */}
        <Collapsible open={techOpen} onOpenChange={setTechOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1 h-8 text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">
              {techOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Technical details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 rounded-md border border-border bg-card p-2.5 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
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
    </Layout>
  );
};

export default AutomatedQaInspector;
