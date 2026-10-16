import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Copy, Check, Loader2 } from 'lucide-react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useAutomatedQaDiagnostics } from '@/hooks/qa/useAutomatedQa';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import {
  OUTCOME_BADGE_VARIANT, outcomeLabel, isLikelyTruncated,
  attemptsWithContradiction, countRetries, sortAttemptsForDisplay, extractContradiction,
} from '@/lib/automatedQaDiagnosticsDisplay';
import type { AutomatedQaEvaluation } from '@/services/qa/automatedQaService';

interface EvaluationDiagnosticsPanelProps {
  evaluation: AutomatedQaEvaluation;
}

/**
 * Session 16.4.4.1 — read-only LLM attempt diagnostics, surfaced inside
 * Automated QA Inspector for authorized development/support users only
 * (`automated_qa.diagnostics.view`). Entirely additive: reads the
 * existing Session 16.4.4 `automated_qa_evaluation_attempts` data via the
 * existing service_role-only RPC (through one new branch on
 * `?resource=automatedQa`, never a new Vercel function) — does not
 * change evaluation logic, prompts, scoring, applicability, validation,
 * or retry strategy in any way.
 *
 * Deliberately NOT the same concept as the Inspector's own "History (N)"
 * dropdown in its header bar — that lists separate EVALUATION RUNS of
 * the same interaction. This section is the one-or-more LLM call
 * ATTEMPTS *inside a single evaluation run* (the initial try plus any
 * same-run retries) — hence "LLM call attempts", never bare "History",
 * anywhere in this component's copy.
 */

/** Read-only, scrollable, monospace text viewer — never dangerouslySetInnerHTML,
 * exact text content only (React's default text-node rendering is what
 * guarantees raw LLM output is never interpreted as HTML). */
const RawTextViewer: React.FC<{ text: string; maxHeightPx?: number; canCopy: boolean }> = ({ text, maxHeightPx = 280, canCopy }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className="rounded-md border border-border bg-card/50">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className={typography.microCaption}>{text.length.toLocaleString()} characters</span>
        {canCopy && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 -my-1 -mr-1 min-h-6"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopyState('copied');
              } catch {
                setCopyState('failed');
              } finally {
                setTimeout(() => setCopyState('idle'), 1500);
              }
            }}
          >
            {copyState === 'copied' ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? "Couldn't copy" : 'Copy'}
            <span className="sr-only" role="status" aria-live="polite">
              {copyState === 'copied' ? 'Copied to clipboard' : copyState === 'failed' ? 'Copy failed' : ''}
            </span>
          </button>
        )}
      </div>
      <pre
        className={`overflow-auto p-2 whitespace-pre-wrap break-all font-mono ${typography.tableBody}`}
        style={{ maxHeight: maxHeightPx }}
      >
        {text}
      </pre>
    </div>
  );
};

export const EvaluationDiagnosticsPanel: React.FC<EvaluationDiagnosticsPanelProps> = ({ evaluation }) => {
  const { user } = useAuth();
  const canViewDiagnostics = hasPermission(user, 'automated_qa.diagnostics.view');
  const [open, setOpen] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const { data: rawAttempts, isLoading, isError } = useAutomatedQaDiagnostics(evaluation.id, canViewDiagnostics && open);
  const attempts = useMemo(() => (rawAttempts ? sortAttemptsForDisplay(rawAttempts) : undefined), [rawAttempts]);

  const byId = useMemo(() => new Map((attempts ?? []).map((a) => [a.id, a])), [attempts]);
  const selected = selectedAttemptId ? byId.get(selectedAttemptId) ?? null : null;

  // Side-by-side/clearly-separated comparison (brief §5) — only the
  // attempts that actually carry a validation_detail.contradiction
  // block, using exactly what's stored (never invented).
  const contradictionAttempts = useMemo(() => attemptsWithContradiction(attempts ?? []), [attempts]);

  if (!canViewDiagnostics) return null;

  const coverageDenominator = evaluation.evaluatedTurnIds.length + evaluation.uncoveredTurnIds.length;
  const retryCount = countRetries(attempts ?? []);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex-shrink-0">
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
          >
            <span className="flex items-center gap-1.5">
              {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              <span className={typography.panelLabel}>Evaluation Diagnostics</span>
              <span className={typography.microCaption}>(authorized diagnostic access only)</span>
            </span>
            {attempts && attempts.length > 0 && (
              <Badge variant="outline" className="h-5">{attempts.length} attempt{attempts.length === 1 ? '' : 's'}</Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3 space-y-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5" role="status" aria-live="polite">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading diagnostics…
            </p>
          ) : isError ? (
            <p className="text-xs text-destructive">Could not retrieve diagnostics (permission denied or retrieval failed).</p>
          ) : !attempts || attempts.length === 0 ? (
            <p className={typography.bodyMuted}>
              No attempt diagnostics are available for this evaluation — it may predate diagnostic capture
              (Session 16.4.4), or diagnostic persistence did not record for this run.
            </p>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-muted-foreground">Evaluation ID: </span><span className="font-mono" title={evaluation.id}>{evaluation.id.slice(0, 8)}…</span></div>
                <div><span className="text-muted-foreground">Status: </span>{evaluation.status}</div>
                <div><span className="text-muted-foreground">Model: </span>{evaluation.modelId ?? '—'}</div>
                <div><span className="text-muted-foreground">Versions: </span>{evaluation.promptVersion} / {evaluation.contractVersion} / {evaluation.schemaVersion}</div>
                <div><span className="text-muted-foreground">Coverage: </span>{coverageDenominator > 0 ? `${evaluation.evaluatedTurnIds.length}/${coverageDenominator} turns` : '—'}</div>
                <div><span className="text-muted-foreground">LLM attempts: </span>{attempts.length}</div>
                <div><span className="text-muted-foreground">Retries: </span>{retryCount}</div>
                <div><span className="text-muted-foreground">Final outcome: </span>{evaluation.errorCode ?? evaluation.status}</div>
              </div>

              {/* Attempt list */}
              <div className="rounded-md border border-border overflow-hidden">
                <table className={`w-full ${typography.tableBody}`}>
                  <thead>
                    <tr className={`h-[30px] bg-card ${typography.tableHeader}`}>
                      <th className="text-left px-2">#</th>
                      <th className="text-left px-2">Window</th>
                      <th className="text-left px-2">Request ID</th>
                      <th className="text-left px-2">Outcome</th>
                      <th className="text-left px-2">Error code</th>
                      <th className="text-left px-2">Retry reason</th>
                      <th className="text-left px-2">Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedAttemptId === a.id}
                        aria-label={`Inspect attempt ${a.attemptNumber}, window ${a.windowIndex}`}
                        className={`h-8 border-t border-border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 ${selectedAttemptId === a.id ? 'bg-cyan-500/10' : 'hover:bg-muted/40'}`}
                        onClick={() => setSelectedAttemptId((cur) => (cur === a.id ? null : a.id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAttemptId((cur) => (cur === a.id ? null : a.id));
                          }
                        }}
                      >
                        <td className="px-2 py-1">{a.attemptNumber}</td>
                        <td className="px-2 py-1">{a.windowIndex}</td>
                        <td className="px-2 py-1 font-mono truncate max-w-[140px]" title={a.requestId}>{a.requestId}</td>
                        <td className="px-2 py-1"><Badge variant={OUTCOME_BADGE_VARIANT[a.outcome]} className="h-5">{outcomeLabel(a.outcome)}</Badge></td>
                        <td className="px-2 py-1">{a.errorCode ?? '—'}</td>
                        <td className="px-2 py-1">{a.retryReason ?? '—'}</td>
                        <td className="px-2 py-1 truncate max-w-[120px]" title={a.correctionInstructionId ?? undefined}>{a.correctionInstructionId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Selected attempt detail */}
              {selected && (
                <div className="rounded-md border border-border bg-card/40 p-2.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={typography.denseHeading}>Attempt {selected.attemptNumber} · Window {selected.windowIndex}</span>
                    <Badge variant={OUTCOME_BADGE_VARIANT[selected.outcome]} className="h-5">{outcomeLabel(selected.outcome)}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">Request ID: </span><span className="font-mono break-all">{selected.requestId}</span></div>
                    <div><span className="text-muted-foreground">Model: </span>{selected.modelId ?? '—'}</div>
                    <div><span className="text-muted-foreground">Started: </span>{selected.startedAt ? formatTimestamp(selected.startedAt) : '—'}</div>
                    <div><span className="text-muted-foreground">Completed: </span>{selected.completedAt ? formatTimestamp(selected.completedAt) : '—'}</div>
                    <div><span className="text-muted-foreground">Latency: </span>{selected.latencyMs != null ? `${selected.latencyMs} ms` : '—'}</div>
                    <div><span className="text-muted-foreground">Tokens (prompt/completion): </span>{selected.promptTokens ?? '—'} / {selected.completionTokens ?? '—'}</div>
                  </div>

                  {/* C. Retry relationship/details */}
                  <div className="text-xs">
                    <span className="text-muted-foreground">Retry reason: </span>{selected.retryReason ?? 'N/A (first attempt in this window)'}
                    {selected.correctionInstructionId && (
                      <span> · <span className="text-muted-foreground">Correction instruction: </span>{selected.correctionInstructionId}</span>
                    )}
                    {selected.previousAttemptId && byId.has(selected.previousAttemptId) && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          className="text-cyan-600 dark:text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                          onClick={() => setSelectedAttemptId(selected.previousAttemptId)}
                        >
                          View previous attempt
                        </button>
                      </>
                    )}
                  </div>

                  {selected.errorMessage && (
                    <p className="text-xs text-destructive">{selected.errorMessage}</p>
                  )}

                  {/* A. Raw LLM response */}
                  <div>
                    <p className={`${typography.microCaption} mb-1`}>Raw LLM response</p>
                    {selected.rawResponse ? (
                      <>
                        <RawTextViewer text={selected.rawResponse} canCopy={canViewDiagnostics} />
                        {isLikelyTruncated(selected.rawResponse) && (
                          <p className="text-[length:var(--type-microCaption-size)] text-[var(--status-caution-text)] mt-1">
                            This response may have been truncated — it is at or near the application's bounded-capture limit.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {selected.outcome === 'transport_failure'
                          ? 'No raw response was captured for this attempt — the request failed before a response body was received.'
                          : 'No raw response recorded for this attempt.'}
                      </p>
                    )}
                  </div>

                  {/* B. Structured validation results */}
                  {selected.validationDetail && Object.keys(selected.validationDetail).length > 0 && (
                    <div>
                      <p className={`${typography.microCaption} mb-1`}>Structured validation results</p>
                      <RawTextViewer text={JSON.stringify(selected.validationDetail, null, 2)} canCopy={canViewDiagnostics} maxHeightPx={200} />
                    </div>
                  )}
                </div>
              )}

              {/* Validation comparison across attempts (brief §5) */}
              {contradictionAttempts.length > 0 && (
                <div className="rounded-md border border-border bg-card/40 p-2.5 space-y-2">
                  <p className={typography.denseHeading}>Contradictory-applicability comparison</p>
                  <p className="text-xs text-muted-foreground">
                    Using only what each attempt's own stored validation detail recorded — not recomputed.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {contradictionAttempts.map((a) => {
                      const detail = extractContradiction(a.validationDetail);
                      if (!detail) return null;
                      return (
                        <div key={a.id} className="rounded border border-border p-2 text-xs space-y-1">
                          <p className="font-medium">Attempt {a.attemptNumber} (window {a.windowIndex})</p>
                          <p><span className="text-muted-foreground">Detector stage: </span>{detail.detectedAt ?? '—'}</p>
                          {(detail.parameterCodes ?? []).map((code) => (
                            <div key={code} className="pl-2">
                              <p className="font-mono">{code}</p>
                              <p className="text-muted-foreground">
                                observations: {detail.observationOccurrences?.[code] ?? 0} · unassessable_parameters: {detail.unassessableOccurrences?.[code] ?? 0}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
