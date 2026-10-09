import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, Flag, MinusCircle, ChevronUp, ChevronDown, X, Pencil } from 'lucide-react';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { useChatSessionDetail } from '@/hooks/chat/useChatSessionDetail';
import { useStartQaReview, useInitQaReviewTurns, useSubmitQaTurn, useSetQaReviewConclusions, useSubmitQaReview, useQaReview } from '@/hooks/qa/useQa';
import { voiceTurnsFromTranscript, chatTurnsFromMessages, qaReviewableTurns, type QaTurn } from '@/lib/qaConversation';
import { computeTier1Applicability, goodNextAutoFindings } from '@/lib/qaApplicability';
import {
  QA_PARAMETER_CODES, QA_PARAMETERS, requiresReasonCode, type QaParameterCode, type QaResultValue,
  INTERACTION_LEVEL_VALUES, type RequestCompletion, type QaFcr, type HumanAssistanceRequired,
} from '@/lib/qaParameters';
import {
  inferredExceptionValue, isAdverseValue, isExceptionFinding, evidenceChoices,
  mergeFlagFindings, turnStatusForExplicitFindings, humanizeReasonCode, type QaExceptionFinding,
} from '@/lib/qaExceptionEditor';
import type { QaFindingInput, QaChannel, QaFinding } from '@/services/qa/qaService';
import { formatTimestamp } from '@/lib/format';

interface QaReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channel: QaChannel;
  interactionId: string | null;
  agentId: string | null;
}

type DraftRow = { value: QaResultValue | null; reasonCode: string | null; evidenceTurnIds: string[]; note: string };
type Draft = Partial<Record<QaParameterCode, DraftRow>>;

const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  return el.getAttribute('role') === 'combobox' || el.isContentEditable;
}

/**
 * Session 16.1 — the exception-based Human QA review workspace (plan
 * §11 mockup): the conversation is the dominant panel; the right panel
 * is only ever "what do I do with the CURRENT agent turn." Customer
 * turns are shown for context/evidence but never advanced through
 * independently — qa_turn_reviews rows exist only for agent turns (see
 * call_center_qa_review_init_turns).
 *
 * Session 16.1.1 — UX refinement (callCprompt 96 16.1.1): "Flag Issue"
 * previously pre-populated PASS forms for every Tier-1 parameter,
 * turning the exception path into a mini questionnaire. It now opens to
 * a bare "what is wrong with this turn?" chip picker with NOTHING
 * pre-selected — selecting a chip expands only that parameter's compact
 * form, and the problem value is inferred (not re-asked) wherever it's
 * unambiguous. "Unreviewed ≠ PASS" is preserved underneath: on save, any
 * Tier-1 parameter the reviewer didn't touch still gets its structural
 * auto-clean finding merged in server-side (mergeFlagFindings), exactly
 * as Good+Next already does — the UX hides the complexity, the
 * persisted measurement data does not get thinner.
 */
export const QaReviewDialog: React.FC<QaReviewDialogProps> = ({ isOpen, onClose, channel, interactionId, agentId }) => {
  const voiceQuery = useInteractionTranscript(channel === 'voice' ? interactionId ?? undefined : undefined, { enabled: isOpen && channel === 'voice' });
  const chatQuery = useChatSessionDetail(channel === 'chat' ? interactionId ?? undefined : undefined);

  const allTurns: QaTurn[] = useMemo(() => {
    if (!interactionId) return [];
    if (channel === 'voice') return voiceTurnsFromTranscript(interactionId, voiceQuery.data?.transcript ?? []);
    return chatTurnsFromMessages(chatQuery.data?.messages ?? []);
  }, [channel, interactionId, voiceQuery.data, chatQuery.data]);

  const transcriptLoading = channel === 'voice' ? voiceQuery.isLoading : chatQuery.isLoading;
  const reviewableTurns = useMemo(() => qaReviewableTurns(allTurns), [allTurns]);
  const tier1Map = useMemo(() => computeTier1Applicability(allTurns.map((t) => ({ turnId: t.turnId, role: t.role }))), [allTurns]);
  const turnIndexById = useMemo(() => new Map(allTurns.map((t, i) => [t.turnId, i])), [allTurns]);

  const [reviewId, setReviewId] = useState<string | null>(null);
  const startedKeyRef = useRef<string | null>(null);
  const startMutation = useStartQaReview();
  const initTurnsMutation = useInitQaReviewTurns();
  const submitTurnMutation = useSubmitQaTurn();
  const setConclusionsMutation = useSetQaReviewConclusions();
  const submitReviewMutation = useSubmitQaReview();

  const { data: review } = useQaReview(reviewId);

  // Start-or-resume once per (interaction, channel) while the dialog is open.
  useEffect(() => {
    if (!isOpen || !interactionId || !agentId) return;
    const key = `${channel}:${interactionId}`;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    setReviewId(null);
    startMutation.mutate({ interactionId, channel, agentId }, { onSuccess: (r) => setReviewId(r.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, interactionId, channel, agentId]);

  useEffect(() => {
    if (!isOpen) startedKeyRef.current = null;
  }, [isOpen]);

  // Initialize one not_reviewed turn_review row per reviewable turn, once.
  const initializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!review || review.status !== 'in_progress' || reviewableTurns.length === 0) return;
    if (initializedRef.current === review.id) return;
    if (review.turnReviews.length >= reviewableTurns.length) { initializedRef.current = review.id; return; }
    initializedRef.current = review.id;
    initTurnsMutation.mutate({ reviewId: review.id, turns: reviewableTurns.map((t) => ({ turnId: t.turnId, role: 'agent' as const })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.id, review?.status, review?.turnReviews.length, reviewableTurns.length]);

  const [phase, setPhase] = useState<'review' | 'summary'>('review');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setPhase('review'); setCurrentIndex(0); setExceptionOpen(false); } }, [isOpen, reviewId]);

  const currentTurn = reviewableTurns[currentIndex] ?? null;
  const turnReviewByTurnId = useMemo(() => {
    const reviews = review?.turnReviews ?? [];
    const map = new Map<string, (typeof reviews)[number]>();
    for (const tr of reviews) map.set(tr.turnId, tr);
    return map;
  }, [review]);
  const findingsByTurnId = useMemo(() => {
    const map = new Map<string, QaFinding[]>();
    for (const f of review?.findings ?? []) {
      const list = map.get(f.primaryTurnId) ?? [];
      list.push(f);
      map.set(f.primaryTurnId, list);
    }
    return map;
  }, [review]);

  const remainingCount = reviewableTurns.filter((t) => (turnReviewByTurnId.get(t.turnId)?.status ?? 'not_reviewed') === 'not_reviewed').length;
  const findingsCount = review?.findings?.length ?? 0;
  const isReadOnly = review?.status === 'submitted';

  function advance() {
    const nextUnreviewed = reviewableTurns.findIndex((t, i) => i > currentIndex && (turnReviewByTurnId.get(t.turnId)?.status ?? 'not_reviewed') === 'not_reviewed');
    if (nextUnreviewed >= 0) { setCurrentIndex(nextUnreviewed); return; }
    if (currentIndex < reviewableTurns.length - 1) { setCurrentIndex(currentIndex + 1); return; }
    setPhase('summary');
  }

  function handleGood() {
    if (!review || !currentTurn || isReadOnly) return;
    const applicability = tier1Map.get(currentTurn.turnId);
    const auto = applicability ? goodNextAutoFindings(applicability) : [];
    const findings: QaFindingInput[] = auto.map((f) => ({ parameterCode: f.parameterCode, value: f.value, evidenceTurnIds: [], reasonCode: null, note: null }));
    submitTurnMutation.mutate({ reviewId: review.id, turnId: currentTurn.turnId, role: 'agent', status: 'good', findings }, { onSuccess: advance });
  }

  function handleNa() {
    if (!review || !currentTurn || isReadOnly) return;
    submitTurnMutation.mutate({ reviewId: review.id, turnId: currentTurn.turnId, role: 'agent', status: 'na', findings: [] }, { onSuccess: advance });
  }

  /**
   * §13 — reopening a previously-flagged turn must only pre-select the
   * parameters that were genuine EXCEPTIONS (value !== clean), never the
   * Tier-1 auto-clean findings mergeFlagFindings silently added on the
   * prior save — otherwise editing a turn would reintroduce exactly the
   * "full questionnaire" problem this session fixes.
   */
  function openException() {
    if (!currentTurn) return;
    const existing = findingsByTurnId.get(currentTurn.turnId) ?? [];
    const initial: Draft = {};
    for (const f of existing) {
      if (!isExceptionFinding(f.parameterCode, f.value)) continue;
      initial[f.parameterCode] = { value: f.value, reasonCode: f.reasonCode, evidenceTurnIds: f.evidenceTurnIds, note: f.note ?? '' };
    }
    setDraft(initial);
    setDraftError(null);
    setExceptionOpen(true);
  }

  function toggleDraftParameter(code: QaParameterCode) {
    setDraft((prev) => {
      if (prev[code]) { const next = { ...prev }; delete next[code]; return next; }
      return { ...prev, [code]: { value: inferredExceptionValue(code), reasonCode: null, evidenceTurnIds: [], note: '' } };
    });
  }

  function updateDraftRow(code: QaParameterCode, patch: Partial<DraftRow>) {
    setDraft((prev) => ({ ...prev, [code]: { ...(prev[code] as DraftRow), ...patch } }));
  }

  function saveException() {
    if (!review || !currentTurn) return;
    const codes = Object.keys(draft) as QaParameterCode[];
    if (codes.length === 0) {
      setDraftError('Select at least one parameter that was wrong with this turn.');
      return;
    }
    const explicit: QaExceptionFinding[] = [];
    for (const code of codes) {
      const row = draft[code] as DraftRow;
      if (!row.value) {
        setDraftError(`${QA_PARAMETERS[code].displayName}: choose what happened.`);
        return;
      }
      if (requiresReasonCode(code, row.value) && !row.reasonCode) {
        setDraftError(`${QA_PARAMETERS[code].displayName} requires a reason.`);
        return;
      }
      explicit.push({ parameterCode: code, value: row.value, reasonCode: row.reasonCode, evidenceTurnIds: row.evidenceTurnIds, note: row.note?.trim() || null });
    }
    const applicability = tier1Map.get(currentTurn.turnId);
    const tier1Auto = applicability ? goodNextAutoFindings(applicability) : [];
    const findings: QaFindingInput[] = mergeFlagFindings(explicit, tier1Auto);
    const status = turnStatusForExplicitFindings(explicit);
    submitTurnMutation.mutate(
      { reviewId: review.id, turnId: currentTurn.turnId, role: 'agent', status, findings },
      { onSuccess: () => { setExceptionOpen(false); advance(); } },
    );
  }

  // Keyboard shortcuts — suppressed entirely while focus is in any input/textarea/select/combobox.
  useEffect(() => {
    if (!isOpen || phase !== 'review') return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (exceptionOpen) {
        if (e.key === 'Escape') { setExceptionOpen(false); }
        // Save+Next's displayed "Enter" shortcut must actually work, not
        // just be a decorative hint — HIG review finding, 2026-10-09.
        else if (e.key === 'Enter') { e.preventDefault(); saveException(); }
        return;
      }
      if (isReadOnly) return;
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); handleGood(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openException(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); handleNa(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCurrentIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCurrentIndex((i) => Math.min(reviewableTurns.length - 1, i + 1)); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase, exceptionOpen, isReadOnly, currentTurn, review, draft]);

  if (!interactionId) return null;

  const currentTurnReview = currentTurn ? turnReviewByTurnId.get(currentTurn.turnId) : null;
  const currentTurnExceptions = currentTurn ? (findingsByTurnId.get(currentTurn.turnId) ?? []).filter((f) => isExceptionFinding(f.parameterCode, f.value)) : [];
  const currentTurnIndexInAll = currentTurn ? turnIndexById.get(currentTurn.turnId) ?? 0 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-6xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col gap-2.5 p-5">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Human QA Review
            {review && <Badge variant={isReadOnly ? 'secondary' : 'outline'} className="text-xs">{isReadOnly ? 'Submitted' : 'In progress'}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {transcriptLoading || !review ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : phase === 'summary' ? (
          <QaSummaryPanel
            review={review}
            reviewableTurns={reviewableTurns}
            allTurns={allTurns}
            onJumpToTurn={(turnId) => {
              const idx = reviewableTurns.findIndex((t) => t.turnId === turnId);
              if (idx >= 0) { setCurrentIndex(idx); setPhase('review'); }
            }}
            onBack={() => setPhase('review')}
            onSubmit={(conclusions) => {
              setConclusionsMutation.mutate({ reviewId: review.id, ...conclusions }, {
                onSuccess: () => submitReviewMutation.mutate(review.id),
              });
            }}
            isReadOnly={isReadOnly}
            isSubmitting={setConclusionsMutation.isPending || submitReviewMutation.isPending}
            remainingCount={remainingCount}
          />
        ) : (
          <div className="flex-1 min-h-0 flex gap-3">
            <div className="w-[62%] min-w-0 flex flex-col border border-border rounded-md">
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {allTurns.map((turn) => {
                  const tr = turn.role === 'agent' ? turnReviewByTurnId.get(turn.turnId) : null;
                  const isCurrent = currentTurn?.turnId === turn.turnId;
                  return (
                    <div
                      key={turn.turnId}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`rounded-md p-2 text-sm ${isCurrent ? 'bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-400' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                        <span className={`font-semibold ${turn.role === 'customer' ? 'text-foreground' : 'text-cyan-700 dark:text-cyan-400'}`}>
                          {turn.speakerLabel}
                        </span>
                        <span>· {formatTimestamp(turn.timestamp)}</span>
                        {tr && tr.status !== 'not_reviewed' && (
                          <Badge variant={tr.status === 'flagged' ? 'destructive' : 'outline'} className="text-[10px] py-0 h-4">
                            {tr.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-foreground whitespace-pre-wrap break-words">{turn.text}</p>
                    </div>
                  );
                })}
                {allTurns.length === 0 && <p className="text-sm text-muted-foreground">No conversation available for this interaction.</p>}
              </div>
            </div>

            <div className="w-[38%] min-w-0 flex flex-col border border-border rounded-md p-3 gap-2">
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {reviewableTurns.length - remainingCount}/{reviewableTurns.length} reviewable turns · {findingsCount} finding{findingsCount === 1 ? '' : 's'}
              </div>

              {!currentTurn ? (
                <p className="text-sm text-muted-foreground">No agent turns to review in this interaction.</p>
              ) : exceptionOpen ? (
                <ExceptionEditor
                  draft={draft}
                  draftError={draftError}
                  allTurns={allTurns}
                  primaryTurnId={currentTurn.turnId}
                  onToggleParameter={toggleDraftParameter}
                  onUpdateRow={updateDraftRow}
                  onSave={saveException}
                  onCancel={() => setExceptionOpen(false)}
                />
              ) : (
                <>
                  {/* Session 16.1.1 §15 — the full transcript text is
                      already visible and highlighted in the left panel;
                      duplicating it here cost vertical space (tight at
                      1366×768) without adding information. A compact
                      identifier replaces it. */}
                  <div className="flex-shrink-0 text-xs text-muted-foreground truncate">
                    <span className="font-medium text-foreground">T{currentTurnIndexInAll + 1}</span> · {currentTurn.speakerLabel} response
                    {currentTurn.text && <span> — {currentTurn.text.length > 70 ? `${currentTurn.text.slice(0, 70)}…` : currentTurn.text}</span>}
                  </div>

                  {/* §13 — a turn already reviewed in this session shows
                      what was recorded, not a blank slate, so revisiting
                      it never looks like "nothing happened here yet". */}
                  {currentTurnReview && currentTurnReview.status !== 'not_reviewed' && (
                    <div className="flex-shrink-0 rounded-md border border-border bg-background/40 p-1.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          {currentTurnReview.status === 'na' ? 'Marked N/A' : currentTurnExceptions.length === 0 ? 'Good' : 'Flagged'}
                        </span>
                        {!isReadOnly && currentTurnReview.status !== 'na' && (
                          <button type="button" onClick={openException} className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        )}
                      </div>
                      {currentTurnExceptions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {currentTurnExceptions.map((f) => (
                            <Badge key={f.id} variant={isAdverseValue(f.parameterCode, f.value) ? 'destructive' : 'outline'} className="text-[10px] py-0 px-1.5">
                              {QA_PARAMETERS[f.parameterCode].displayName}{f.reasonCode ? ` · ${humanizeReasonCode(f.reasonCode)}` : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!isReadOnly && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button size="sm" onClick={handleGood} disabled={submitTurnMutation.isPending}>
                        <Check className="h-3.5 w-3.5 mr-1.5" /> Good + Next <span className="ml-auto text-xs opacity-70">G</span>
                      </Button>
                      <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={openException} disabled={submitTurnMutation.isPending}>
                        <Flag className="h-3.5 w-3.5 mr-1.5" /> Flag Issue <span className="ml-auto text-xs opacity-70">F</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleNa} disabled={submitTurnMutation.isPending}>
                        <MinusCircle className="h-3.5 w-3.5 mr-1.5" /> N/A <span className="ml-auto text-xs opacity-70">N</span>
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center justify-between flex-shrink-0 mt-auto pt-2 border-t border-border">
                    <Button variant="ghost" size="xs" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0}>
                      <ChevronUp className="h-3.5 w-3.5 mr-1" /> Prev
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setCurrentIndex((i) => Math.min(reviewableTurns.length - 1, i + 1))} disabled={currentIndex === reviewableTurns.length - 1}>
                      Next <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setPhase('summary')}>
                      Summary
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * §4/§14 — "What is wrong with this turn?" chip picker. Progressive
 * disclosure: selecting a chip expands ONLY that parameter's compact
 * form below; nothing is pre-expanded, and a parameter never shown here
 * is never silently touched (mergeFlagFindings handles Tier-1 coverage
 * server-side, invisibly, on save).
 */
const ExceptionEditor: React.FC<{
  draft: Draft;
  draftError: string | null;
  allTurns: QaTurn[];
  primaryTurnId: string;
  onToggleParameter: (code: QaParameterCode) => void;
  onUpdateRow: (code: QaParameterCode, patch: Partial<DraftRow>) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ draft, draftError, allTurns, primaryTurnId, onToggleParameter, onUpdateRow, onSave, onCancel }) => {
  const evidenceCandidates = useMemo(() => evidenceChoices(allTurns, primaryTurnId), [allTurns, primaryTurnId]);
  const turnIndexById = useMemo(() => new Map(allTurns.map((t, i) => [t.turnId, i])), [allTurns]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What is wrong with this turn?</p>
        <Button variant="ghost" size="xs" onClick={onCancel} aria-label="Close exception editor"><X className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-shrink-0">
        {QA_PARAMETER_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onToggleParameter(code)}
            aria-pressed={Boolean(draft[code])}
            title={QA_PARAMETERS[code].shortHelp}
            className={`text-[11px] px-2 py-1.5 rounded-full border ${draft[code] ? 'bg-cyan-700 text-white border-cyan-700' : 'border-border text-muted-foreground'}`}
          >
            {QA_PARAMETERS[code].displayName}
          </button>
        ))}
      </div>

      {/* Only selected parameters render a form — this is the whole
          point of the redesign (callCprompt 96 16.1.1 §4: "Do not
          automatically open forms for multiple parameters"). */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {(Object.keys(draft) as QaParameterCode[]).map((code) => {
          const def = QA_PARAMETERS[code];
          const row = draft[code] as DraftRow;
          const isGrounding = code === 'response_grounding_rate';
          return (
            <div key={code} className="border border-border rounded-md p-2 space-y-1.5">
              <p className="text-xs font-semibold">{def.displayName}</p>

              {isGrounding ? (
                // §7 — a genuine two-way choice, shown as two compact
                // buttons rather than a generic allowedValues dropdown.
                // CANNOT_VERIFY is deliberately NOT styled destructive —
                // it is a data gap, not a quality failure — and uses the
                // app's own tinted "warning" badge token, not a raw
                // solid-amber fill (which fails AA contrast for white
                // text at this size).
                <div role="radiogroup" aria-label="Response Grounding value" className="flex gap-1.5">
                  <button
                    type="button"
                    role="radio"
                    onClick={() => onUpdateRow(code, { value: 'NOT_GROUNDED' })}
                    aria-checked={row.value === 'NOT_GROUNDED'}
                    className={`flex-1 text-[11px] py-1.5 rounded-full border ${row.value === 'NOT_GROUNDED' ? 'bg-destructive text-destructive-foreground border-destructive' : 'border-border text-muted-foreground'}`}
                  >
                    Not grounded
                  </button>
                  <button
                    type="button"
                    role="radio"
                    onClick={() => onUpdateRow(code, { value: 'CANNOT_VERIFY' })}
                    aria-checked={row.value === 'CANNOT_VERIFY'}
                    className={`flex-1 text-[11px] py-1.5 rounded-full border ${row.value === 'CANNOT_VERIFY' ? 'border-amber-600/50 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-border text-muted-foreground'}`}
                  >
                    Cannot verify
                  </button>
                </div>
              ) : (
                // §6 — the problem value is implied by selecting this
                // parameter at all; shown read-only for confidence, never
                // asked as a redundant choice.
                row.value && <p className="text-[11px] text-muted-foreground">Will record as <span className="font-medium text-foreground">{row.value}</span></p>
              )}

              {row.value && requiresReasonCode(code, row.value) && (
                <div role="radiogroup" aria-label={`Reason — ${def.displayName}`}>
                  <p className="text-[10px] text-muted-foreground mb-1">What happened?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {def.reasonCodes.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        onClick={() => onUpdateRow(code, { reasonCode: r })}
                        aria-checked={row.reasonCode === r}
                        className={`text-[11px] px-2 py-1 rounded-full border ${row.reasonCode === r ? 'bg-cyan-700 text-white border-cyan-700' : 'border-border text-muted-foreground'}`}
                      >
                        {humanizeReasonCode(r)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Supporting evidence (optional)</p>
                <div className="max-h-20 overflow-y-auto border border-border/60 rounded-sm p-1 space-y-0.5">
                  {evidenceCandidates.map((t) => (
                    <label key={t.turnId} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Checkbox
                        checked={row.evidenceTurnIds.includes(t.turnId)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...row.evidenceTurnIds, t.turnId]
                            : row.evidenceTurnIds.filter((id) => id !== t.turnId);
                          onUpdateRow(code, { evidenceTurnIds: next });
                        }}
                      />
                      T{(turnIndexById.get(t.turnId) ?? 0) + 1} · {t.speakerLabel} · {t.text.length > 50 ? `${t.text.slice(0, 50)}…` : t.text}
                    </label>
                  ))}
                </div>
              </div>

              <Textarea
                placeholder="Optional note"
                value={row.note}
                onChange={(e) => onUpdateRow(code, { note: e.target.value })}
                className="h-12 text-xs"
              />
            </div>
          );
        })}
        {Object.keys(draft).length === 0 && (
          <p className="text-xs text-muted-foreground">Select one or more parameters above.</p>
        )}
      </div>

      {draftError && <p role="alert" className="text-xs text-destructive flex-shrink-0">{draftError}</p>}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button size="sm" onClick={onSave}>Save + Next <span className="ml-1.5 text-xs opacity-70">Enter</span></Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel <span className="ml-1.5 text-xs opacity-70">Esc</span></Button>
      </div>
    </div>
  );
};

const QaSummaryPanel: React.FC<{
  review: NonNullable<ReturnType<typeof useQaReview>['data']>;
  reviewableTurns: QaTurn[];
  allTurns: QaTurn[];
  onJumpToTurn: (turnId: string) => void;
  onBack: () => void;
  onSubmit: (conclusions: {
    requestCompletion: RequestCompletion | null;
    fcr: QaFcr | null;
    humanAssistanceRequired: HumanAssistanceRequired | null;
    businessOutcome: string | null;
    reviewerNote: string | null;
  }) => void;
  isReadOnly: boolean;
  isSubmitting: boolean;
  remainingCount: number;
}> = ({ review, allTurns, onJumpToTurn, onBack, onSubmit, isReadOnly, isSubmitting, remainingCount }) => {
  const [requestCompletion, setRequestCompletion] = useState<RequestCompletion | null>(review.requestCompletion);
  const [fcr, setFcr] = useState<QaFcr | null>(review.fcr);
  const [humanAssistanceRequired, setHumanAssistanceRequired] = useState<HumanAssistanceRequired | null>(review.humanAssistanceRequired);
  const [businessOutcome, setBusinessOutcome] = useState<string | null>(review.businessOutcome);
  const [reviewerNote, setReviewerNote] = useState(review.reviewerNote ?? '');

  const turnIndexById = useMemo(() => new Map(allTurns.map((t, i) => [t.turnId, i])), [allTurns]);
  // §13/§4 — the summary's "findings by parameter" should reflect what
  // reviewers actually flagged, not the invisible Tier-1 auto-clean
  // findings merged in on every Good+Next/Flag save.
  const exceptionFindings = useMemo(() => review.findings.filter((f) => isExceptionFinding(f.parameterCode, f.value)), [review.findings]);
  const byParameter = useMemo(() => {
    const map = new Map<QaParameterCode, number>();
    for (const f of exceptionFindings) map.set(f.parameterCode, (map.get(f.parameterCode) ?? 0) + 1);
    return map;
  }, [exceptionFindings]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-sm font-semibold">Summary</p>
        <Button variant="ghost" size="xs" onClick={onBack}>Back to conversation</Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {remainingCount === 0 ? 'All reviewable turns reviewed.' : `${remainingCount} turn(s) not yet reviewed — submission is blocked until every turn is Good, Flagged, or N/A.`}
      </div>

      <div className="border border-border rounded-md p-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Findings by parameter</p>
        {exceptionFindings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No findings recorded.</p>
        ) : (
          <div className="space-y-1">
            {Array.from(byParameter.entries()).map(([code, count]) => (
              <p key={code} className="text-xs">{QA_PARAMETERS[code].displayName}: {count}</p>
            ))}
          </div>
        )}
      </div>

      <div className="border border-border rounded-md p-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Findings — jump to evidence</p>
        {exceptionFindings.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {exceptionFindings.map((f) => (
              <button
                key={f.id}
                type="button"
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline block"
                onClick={() => onJumpToTurn(f.primaryTurnId)}
              >
                T{(turnIndexById.get(f.primaryTurnId) ?? 0) + 1} · {QA_PARAMETERS[f.parameterCode].displayName} · {f.value}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border border-border rounded-md p-2 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interaction-level conclusions</p>
        <div className="grid grid-cols-2 gap-2">
          <LabeledSelect label="Request completion" value={requestCompletion} options={INTERACTION_LEVEL_VALUES.requestCompletion} onChange={(v) => setRequestCompletion(v as RequestCompletion)} disabled={isReadOnly} />
          <LabeledSelect label="First contact resolution" value={fcr} options={INTERACTION_LEVEL_VALUES.fcr} onChange={(v) => setFcr(v as QaFcr)} disabled={isReadOnly} />
          <LabeledSelect label="Human assistance required" value={humanAssistanceRequired} options={INTERACTION_LEVEL_VALUES.humanAssistanceRequired} onChange={(v) => setHumanAssistanceRequired(v as HumanAssistanceRequired)} disabled={isReadOnly} />
          <LabeledSelect label="Business outcome" value={businessOutcome} options={INTERACTION_LEVEL_VALUES.businessOutcome} onChange={setBusinessOutcome} disabled={isReadOnly} />
        </div>
        <Textarea placeholder="Reviewer note (optional)" value={reviewerNote} onChange={(e) => setReviewerNote(e.target.value)} disabled={isReadOnly} className="h-16 text-xs" />
      </div>

      {!isReadOnly && (
        <Button
          disabled={remainingCount > 0 || isSubmitting}
          onClick={() => onSubmit({ requestCompletion, fcr, humanAssistanceRequired, businessOutcome, reviewerNote: reviewerNote.trim() || null })}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Submit Review
        </Button>
      )}
    </div>
  );
};

const LabeledSelect: React.FC<{ label: string; value: string | null; options: readonly string[]; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, options, onChange, disabled }) => (
  <div>
    <label className="text-[11px] text-muted-foreground block mb-0.5">{label}</label>
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);
