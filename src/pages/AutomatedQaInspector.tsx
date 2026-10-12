import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaEvaluation } from '@/hooks/qa/useAutomatedQa';
import { computeAutomatedQaRatios } from '@/lib/automatedQaRatios';
import { QA_PARAMETER_CODES, QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';
import { humanizeReasonCode } from '@/lib/qaExceptionEditor';
import { formatTimestamp, formatFractionAsPercent } from '@/lib/format';
import { typography } from '@/lib/typography';
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
 */
const AutomatedQaInspector: React.FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [techOpen, setTechOpen] = useState(false);
  const [jumpTurnId, setJumpTurnId] = useState<string | null>(null);
  const [jumpAnnouncement, setJumpAnnouncement] = useState<string | null>(null);
  const primaryTurnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (jumpTurnId) {
      primaryTurnRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setJumpAnnouncement(`Jumped to turn ${jumpTurnId}`);
    }
  }, [jumpTurnId]);

  const { data: evaluation, isLoading } = useAutomatedQaEvaluation(evaluationId ?? null);

  const turns: QaTurn[] = useMemo(() => (Array.isArray(evaluation?.transcriptSnapshot) ? evaluation!.transcriptSnapshot : []), [evaluation]);

  const observations: AutomatedQaObservation[] = evaluation?.observations ?? [];

  const ratios = useMemo(
    () => computeAutomatedQaRatios(observations.map((o) => ({ evaluationId: o.evaluationId, parameterCode: o.parameterCode, value: o.value }))),
    [observations],
  );

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

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
        <Button variant="ghost" size="sm" className="h-6 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/qa-review')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Interaction Quality
        </Button>

        <div>
          <h1 className={typography.pageTitle}>Automated QA Inspector</h1>
          <p className={typography.pageDescription}>
            One independent LLM evaluation of this interaction — a separate measurement source from Human QA (never blended, never cross-referenced). Read-only.
          </p>
        </div>

        {/* Evaluation header */}
        <div className="rounded-md border border-border bg-card/40 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Interaction</div>
            <div className="font-medium truncate">{evaluation.interactionId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Channel</div>
            <div className="font-medium capitalize">{evaluation.channel}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Agent</div>
            <div className="font-medium truncate">{evaluation.agentId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <Badge variant="outline" className={AUTOMATED_QA_STATUS_BADGE[evaluation.status] ?? ''}>{evaluation.status}</Badge>
          </div>
          <div>
            <div className="text-muted-foreground">Model</div>
            <div className="font-medium">{evaluation.modelId ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Evaluated at</div>
            <div className="font-medium">{evaluation.completedAt ? formatTimestamp(evaluation.completedAt) : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Coverage</div>
            <div className="font-medium">
              {evaluation.evaluatedTurnIds.length}/{evaluation.evaluatedTurnIds.length + evaluation.uncoveredTurnIds.length} turns
              {evaluation.evaluationCompleteness === 'PARTIAL' && (
                <Badge variant="outline" className="ml-1.5 border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400">PARTIAL</Badge>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Transcript version</div>
            <div className="font-medium truncate" title={evaluation.transcriptHash}>{evaluation.transcriptHash.slice(0, 12)}…</div>
          </div>
        </div>

        {evaluation.status === 'failed' && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
            Evaluation failed ({evaluation.errorCode ?? 'unknown_error'}): {evaluation.errorMessage ?? 'No further detail available.'}
          </div>
        )}

        {/* Parameter measurements */}
        {evaluation.status !== 'failed' && (
          <div>
            <h2 className="text-sm font-semibold mb-1.5">Quality Measurements</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {QA_PARAMETER_CODES.map((code) => {
                const def = QA_PARAMETERS[code];
                const r = ratios[code];
                const unassessable = evaluation.unassessableParameters.find((u) => u.parameterCode === code);
                return (
                  <div key={code} className="rounded-md border border-border bg-card/40 p-2.5">
                    <div className="text-xs font-medium">{def.displayName}</div>
                    {r.denominator === 0 ? (
                      <>
                        <div className="text-lg font-semibold text-muted-foreground">—</div>
                        <div className="text-[11px] text-muted-foreground">No eligible population</div>
                        {unassessable && <div className="text-[10px] text-muted-foreground mt-0.5">{unassessable.reason}</div>}
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-semibold">{formatFractionAsPercent(r.rate ?? undefined)}</div>
                        <div className="text-[11px] text-muted-foreground">{r.numerator} / {r.denominator} eligible</div>
                      </>
                    )}
                    <div className="text-[10px] text-muted-foreground">{def.directionality === 'higher_better' ? 'Higher is better' : 'Lower is better'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Findings */}
        {observations.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-1.5">Findings</h2>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className={typography.tableHeader}>
                    <th className="text-left p-2">Parameter</th>
                    <th className="text-left p-2">Value</th>
                    <th className="text-left p-2">Reason</th>
                    <th className="text-left p-2">Turn</th>
                    <th className="text-left p-2">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map((o) => {
                    const def = QA_PARAMETERS[o.parameterCode];
                    const isClean = o.value === def.cleanValue;
                    const activate = () => setJumpTurnId(o.primaryTurnId);
                    return (
                      <tr
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`View turn ${o.primaryTurnId} for ${def.displayName}`}
                        className={`${typography.tableBody} border-t border-border hover:bg-muted/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500`}
                        onClick={activate}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activate();
                          }
                        }}
                      >
                        <td className="p-2">{def.displayName}</td>
                        <td className="p-2">
                          <Badge variant="outline" className={isClean ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'}>
                            {o.value}
                          </Badge>
                        </td>
                        <td className="p-2">{o.reasonCode ? humanizeReasonCode(o.reasonCode) : '—'}</td>
                        <td className="p-2 font-mono text-[10px]">{o.primaryTurnId}</td>
                        <td className="p-2 text-muted-foreground max-w-xs truncate" title={o.explanation ?? ''}>{o.explanation ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conversation evidence */}
        <div>
          <h2 className="text-sm font-semibold mb-1.5">Conversation</h2>
          <p className="sr-only" role="status" aria-live="polite">{jumpAnnouncement}</p>
          <div className="rounded-md border border-border max-h-96 overflow-y-auto p-2 space-y-1.5">
            {turns.map((t) => {
              const isPrimary = jumpTurnId === t.turnId;
              const isEvidence = observations.some((o) => o.primaryTurnId === jumpTurnId && o.evidenceTurnIds.includes(t.turnId));
              return (
                <div
                  key={t.turnId}
                  ref={isPrimary ? primaryTurnRef : undefined}
                  aria-current={isPrimary ? 'true' : undefined}
                  aria-label={isEvidence ? 'Evidence for selected finding' : undefined}
                  className={`rounded p-2 text-xs ${isPrimary ? 'bg-amber-500/10 border border-amber-500/40' : isEvidence ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-card/30'}`}
                >
                  <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1.5">
                    <span>{t.speakerLabel} · {formatTimestamp(t.timestamp)} · <span className="font-mono">{t.turnId}</span></span>
                    {isPrimary && <Badge variant="outline" className="border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400">Primary</Badge>}
                    {!isPrimary && isEvidence && <Badge variant="outline" className="border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400">Evidence</Badge>}
                  </div>
                  <div>{t.text}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Technical details */}
        <Collapsible open={techOpen} onOpenChange={setTechOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1 min-h-6 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">
              {techOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Technical details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 rounded-md border border-border bg-card/40 p-2.5 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Request id(s): </span>{evaluation.requestIds.join(', ') || '—'}</div>
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
