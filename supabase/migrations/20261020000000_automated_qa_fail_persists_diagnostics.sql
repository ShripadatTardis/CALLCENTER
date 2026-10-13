-- Session 16.3.8 (follow-up) — call_center_automated_qa_fail previously
-- persisted ONLY status/error_code/error_message/request_ids on a
-- failed evaluation, silently dropping model_id, evaluated_turn_ids,
-- uncovered_turn_ids, evaluation_completeness, window_count,
-- token_usage, and latency_ms even though evaluateInteraction() already
-- computes all of these regardless of outcome. Found via live
-- verification: a real contradictory_applicability failure showed
-- "Model id: —" and "0/0 turns" in the Automated QA Inspector despite
-- the evaluator having real turn-coverage and model data in memory.
-- This made every failed evaluation (not just the new 16.3.8 failure
-- paths — output_truncated-exhausted and permanent-error failures were
-- affected identically) harder to diagnose than necessary. Pure
-- persistence fix — no evaluator/validation/scoring logic changes.

drop function if exists public.call_center_automated_qa_fail(uuid, text, text, jsonb, timestamptz);

create or replace function public.call_center_automated_qa_fail(
  p_evaluation_id uuid, p_error_code text, p_error_message text, p_request_ids jsonb, p_now timestamptz,
  p_model_id text default null, p_evaluated_turn_ids text[] default '{}', p_uncovered_turn_ids text[] default '{}',
  p_evaluation_completeness text default 'PARTIAL', p_window_count int default null,
  p_token_usage jsonb default null, p_latency_ms int default null
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.automated_qa_evaluations
    set status = 'failed', error_code = p_error_code, error_message = p_error_message,
        request_ids = p_request_ids,
        -- coalesce so the internal_error catch path (no evaluateInteraction
        -- result at all — p_model_id/p_window_count omitted) never
        -- overwrites a previously-known value with a fabricated null.
        model_id = coalesce(p_model_id, model_id),
        evaluated_turn_ids = p_evaluated_turn_ids,
        uncovered_turn_ids = p_uncovered_turn_ids,
        evaluation_completeness = p_evaluation_completeness,
        window_count = coalesce(p_window_count, window_count),
        token_usage = p_token_usage,
        latency_ms = p_latency_ms,
        completed_at = p_now, updated_at = p_now
    where id = p_evaluation_id
    returning to_jsonb(automated_qa_evaluations.*);
$$;

revoke all on function public.call_center_automated_qa_fail(uuid, text, text, jsonb, timestamptz, text, text[], text[], text, int, jsonb, int) from public, anon, authenticated;
grant execute on function public.call_center_automated_qa_fail(uuid, text, text, jsonb, timestamptz, text, text[], text[], text, int, jsonb, int) to service_role;
