import React, { useId, useState } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useInteractionTrace } from '@/hooks/interactionTrace/useInteractionTrace';
import { isApiError } from '@/services/transport/errors';
import { formatTimestamp } from '@/lib/format';
import { mapInteractionTraceError } from '@/lib/interactionTraceErrorMessage';
import { typography } from '@/lib/typography';
import type { InteractionTraceChannel, InteractionTraceTurnDto } from '@/types/api/interactionTrace';

interface InteractionTracePanelProps {
  interactionId: string;
  channel: InteractionTraceChannel;
  /**
   * Session 16.4.3.1 — when true, renders without the outer collapsed
   * accordion: the trace fetches immediately and its content (status/
   * version/turns) shows directly, no extra click. Used ONLY by Call
   * Logs' new dedicated "Interaction Trace" tab (brief §5 — "the tab
   * itself IS the trigger"), where the outer accordion would be a
   * redundant second disclosure layered on top of the tab selection
   * itself. Defaults to false, preserving the EXACT original
   * collapsed-by-default-accordion behavior for every other current
   * consumer (`ChatSessionDetailDialog.tsx`, explicitly out of scope
   * for this session, and the Call Logs dialog's pre-16.4.3.1 usage
   * if ever reverted) — this prop is additive, not a breaking change
   * to the component's default behavior. Per-turn "Technical detail"
   * disclosure (`TraceTurn`, below) is unaffected either way — the
   * brief only asks to remove the OUTER accordion, fine per-turn
   * technical details stay expandable exactly as before.
   */
  autoExpand?: boolean;
}

/**
 * Session 16.4.3 — recorded turn-by-turn evidence from the Interaction
 * Trace API (tool/RAG executions, routing, auth/escalation/feedback/
 * guardrail events), surfaced as an optional, collapsed-by-default
 * evidence panel inside the existing Interaction Detail dialogs (Call
 * Logs' InteractionDetailDialog, Chat's ChatSessionDetailDialog) — not a
 * new standalone screen, per the brief.
 *
 * Deliberately separate from ConversationTranscript (the primary,
 * always-visible conversation view) and from AutomatedQaPanel (the QA
 * evaluation entry point, directly above this in both dialogs) — this
 * panel is read-only recorded evidence, never evaluation input. Nothing
 * fetched here is passed into any Automated QA prompt or scoring path
 * (brief §9 — a hard boundary, enforced by this component simply never
 * being referenced from src/services/qa/* or any evaluation code path).
 *
 * Lazy: the trace is only fetched once this section is expanded
 * (useInteractionTrace's `enabled` tracks local `open` state), so
 * opening Interaction Detail never fetches a trace nobody asked to see.
 * With `autoExpand`, `open` starts `true` instead of `false` — the
 * SAME `enabled: open` gate, just a different initial value — so the
 * fetch still only fires once a reason to see the trace exists (the
 * tab itself being selected, which is what mounts this component in
 * the tab's case), not merely because `InteractionDetailDialog`
 * rendered. `useInteractionTrace`'s own query key is `(interactionId,
 * channel)`, not tab-visibility, so switching tabs away and back
 * reuses the cached result rather than re-fetching, by construction.
 */
export const InteractionTracePanel: React.FC<InteractionTracePanelProps> = ({ interactionId, channel, autoExpand = false }) => {
  const [open, setOpen] = useState(autoExpand);
  const panelId = useId();
  const trace = useInteractionTrace(interactionId, channel, { enabled: open });

  const refreshButton = trace.data && (
    <span
      role="button"
      tabIndex={0}
      aria-label="Refresh interaction trace"
      className={`inline-flex items-center gap-1 ${typography.metadata} hover:text-foreground min-h-6 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500`}
      onClick={(e) => {
        e.stopPropagation();
        trace.refetch();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          trace.refetch();
        }
      }}
    >
      <RefreshCw className={`h-3 w-3 ${trace.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
      Refresh
    </span>
  );

  if (autoExpand) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={typography.microLabel}>Interaction Trace</span>
          {refreshButton}
        </div>
        <TraceBody trace={trace} />
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex-shrink-0">
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={open}
            aria-controls={panelId}
          >
            <span className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
              <span className={typography.microLabel}>Interaction Trace</span>
            </span>
            {open && refreshButton}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={panelId}>
          <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
            <TraceBody trace={trace} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

function TraceBody({ trace }: { trace: ReturnType<typeof useInteractionTrace> }) {
  if (trace.isLoading) {
    return (
      <p className={`${typography.metadata} flex items-center gap-1.5`} role="status" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Loading trace…
      </p>
    );
  }

  if (trace.isError) {
    return <TraceError error={trace.error} onRetry={() => trace.refetch()} />;
  }

  const data = trace.data;
  if (!data) return null;

  if (data.turns.length === 0) {
    return (
      <p className={typography.bodyMuted}>
        {data.interaction_status === 'failed'
          ? 'This call never connected — no turns were recorded.'
          : 'No turns recorded yet for this interaction.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 ${typography.metadata}`}>
        <span>Trace v{data.trace_version}</span>
        {data.interaction_status && (
          <Badge variant="outline" className="text-xs">
            {data.interaction_status.replace('_', ' ')}
          </Badge>
        )}
        <span>{data.turns.length} turn{data.turns.length === 1 ? '' : 's'}</span>
      </div>
      <div className="space-y-1.5">
        {data.turns.map((turn) => (
          <TraceTurn key={turn.turn_id} turn={turn} />
        ))}
      </div>
    </div>
  );
}

function TraceError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = isApiError(error) ? error.status : undefined;
  const code = isApiError(error) ? error.code : undefined;
  const { message, canRetry } = mapInteractionTraceError(status, code);

  return (
    <div className="space-y-1.5">
      <p className={typography.bodyMuted}>{message}</p>
      {canRetry && (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

const PROMPT_TYPE_LABEL: Record<InteractionTraceTurnDto['prompt_type'], string> = {
  tool: 'Tool',
  rag: 'Knowledge base',
  rag_tool: 'Tool + knowledge base',
  session_data: 'Session data',
  system: 'System',
};

function TraceTurn({ turn }: { turn: InteractionTraceTurnDto }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const hasTechnicalDetail =
    turn.tool_calls.length > 0 ||
    turn.rag_calls.length > 0 ||
    turn.frame_context.available ||
    Boolean(turn.authentication_event || turn.escalation_event || turn.customer_feedback_event || turn.guardrail_event);

  return (
    <div className="rounded border border-border/60 p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-mono ${typography.metadata}`}>#{turn.turn_sequence}</span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {PROMPT_TYPE_LABEL[turn.prompt_type] ?? turn.prompt_type}
          </Badge>
        </div>
        <span className={typography.metadata}>{formatTimestamp(turn.turn_time)}</span>
      </div>
      <div className={`${typography.denseBody} space-y-0.5`}>
        <p><span className="text-muted-foreground">Customer:</span> <span className="text-foreground">{turn.customer_utterance || '—'}</span></p>
        <p><span className="text-muted-foreground">Assistant:</span> <span className="text-foreground">{turn.bot_utterance || '—'}</span></p>
      </div>

      {hasTechnicalDetail && (
        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-[length:var(--type-metadata-size)] text-cyan-700 dark:text-cyan-400 hover:underline min-h-6 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
              aria-expanded={detailOpen}
            >
              {detailOpen ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              Technical detail
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-1.5 space-y-2">
              {turn.tool_calls.map((tc) => (
                <div key={tc.tool_call_id} className={`${typography.metadata} rounded bg-muted/50 p-1.5 space-y-0.5`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-foreground">{tc.tool_name}</span>
                    <Badge variant={tc.success ? 'positive' : 'escalated'} className="text-[10px] py-0 px-1.5">
                      {tc.success ? 'Succeeded' : (tc.error_code ?? 'Failed')}
                    </Badge>
                    {tc.latency_ms !== null && <span className="text-muted-foreground">{tc.latency_ms}ms</span>}
                  </div>
                  {tc.error_message && <p className="text-muted-foreground">{tc.error_message}</p>}
                  {tc.reference_id && <p className="text-muted-foreground">Reference: {tc.reference_id}</p>}
                </div>
              ))}
              {turn.rag_calls.map((rc) => (
                <div key={rc.rag_call_id} className={`${typography.metadata} rounded bg-muted/50 p-1.5 space-y-0.5`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground">Knowledge-base lookup</span>
                    <Badge variant={rc.success ? 'positive' : 'escalated'} className="text-[10px] py-0 px-1.5">
                      {rc.success ? 'Ran' : 'Failed'}
                    </Badge>
                    {rc.latency_ms !== null && <span className="text-muted-foreground">{rc.latency_ms}ms</span>}
                  </div>
                  {rc.query && <p className="text-foreground">&ldquo;{rc.query}&rdquo;</p>}
                  {rc.references.length === 0 ? (
                    <p className="text-muted-foreground">No matching passages.</p>
                  ) : (
                    rc.references.map((ref) => (
                      <p key={ref.reference_id} className="text-muted-foreground">
                        {ref.source_category ?? 'uncategorized'} · {ref.reference_id}
                        {ref.relevance_score !== null ? ` · ${(ref.relevance_score * 100).toFixed(0)}%` : ''}
                      </p>
                    ))
                  )}
                  {rc.error_message && <p className="text-muted-foreground">{rc.error_message}</p>}
                </div>
              ))}
              {turn.frame_context.available && (
                <div className={`${typography.metadata} rounded bg-muted/50 p-1.5 space-y-0.5`}>
                  <p className="text-muted-foreground">Routing</p>
                  {turn.frame_context.router_decision ? (
                    <p className="text-foreground">
                      {turn.frame_context.router_decision.type}
                      {turn.frame_context.router_decision.source ? ` via ${turn.frame_context.router_decision.source}` : ''}
                      {turn.frame_context.router_decision.confidence !== null
                        ? ` (confidence ${(turn.frame_context.router_decision.confidence * 100).toFixed(0)}%, telemetry only)`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Skipped routing this turn.</p>
                  )}
                  {turn.frame_context.final_plan && (
                    <p className="text-muted-foreground">Plan: {turn.frame_context.final_plan.action}</p>
                  )}
                </div>
              )}
              {turn.authentication_event && (
                <EventRow label="Authentication" ok={turn.authentication_event.success} detail={turn.authentication_event.method} errorCode={turn.authentication_event.error_code} />
              )}
              {turn.escalation_event && (
                <EventRow label="Escalation" ok={null} detail={turn.escalation_event.destination ?? turn.escalation_event.reason} />
              )}
              {turn.customer_feedback_event && (
                <EventRow label="Customer feedback" ok={null} detail={`${turn.customer_feedback_event.parsed_score}/5 — "${turn.customer_feedback_event.raw_value}"`} />
              )}
              {turn.guardrail_event && (
                <EventRow label="Guardrail" ok={null} detail={`${turn.guardrail_event.type}: ${turn.guardrail_event.action}${turn.guardrail_event.detail ? ` — ${turn.guardrail_event.detail}` : ''}`} />
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function EventRow({ label, ok, detail, errorCode }: { label: string; ok: boolean | null; detail: string | null; errorCode?: string | null }) {
  return (
    <div className={`${typography.metadata} rounded bg-muted/50 p-1.5 flex items-center gap-1.5 flex-wrap`}>
      <span className="text-muted-foreground">{label}</span>
      {ok !== null && (
        <Badge variant={ok ? 'positive' : 'escalated'} className="text-[10px] py-0 px-1.5">
          {ok ? 'Succeeded' : (errorCode ?? 'Failed')}
        </Badge>
      )}
      {detail && <span className="text-foreground">{detail}</span>}
    </div>
  );
}
