-- Session 4D — central, governed QA population selector.
--
-- Problem (not a calculation discrepancy — a population mismatch,
-- confirmed by reading both sides' real SQL before this session):
-- `call_center_cma_evaluate_qa_measure` has always computed a COMBINED
-- Human QA + Automated QA population (a UNION ALL of
-- qa_findings/qa_reviews and automated_qa_observations/
-- automated_qa_evaluations). `QaQualityExplorer.tsx`'s "Quality
-- Measures" tab, by contrast, is explicitly, deliberately Human-QA-only
-- (its own subtitle says so; its backend RPC
-- `call_center_qa_findings_list` only ever reads Human QA tables).
-- Migrating that screen to the existing combined-only RPC would have
-- silently turned a Human-only sample rate into a Human+Automated rate
-- — exactly what was flagged and left unmigrated in CMA-4B/4C.
--
-- Fix: add an explicit, centrally governed `p_population` parameter
-- ('human' | 'automated' | 'combined') to the ONE existing qa-family
-- RPC — no second formula, no duplicate calculation path. Default
-- 'combined' preserves every existing caller's behavior exactly
-- (byte-for-byte: the 'combined' branch below is unchanged from the
-- current production function body). 'human' and 'automated' simply
-- select one UNION ALL branch instead of both — same eligibility rule
-- (`value not in ('N_A','CANNOT_VERIFY')`), same per-measure
-- v_param/v_target_value/v_shape dispatch, same review-vs-turn grain
-- logic, same groupBy handling — nothing about HOW a measure is
-- calculated changes, only WHICH population feeds it in.
--
-- An invalid p_population value returns {"status":"unsupported"},
-- the same rejection shape every other invalid-input case in this
-- function already uses — never silently defaulting to a different
-- population than requested.
--
-- Added as the LAST parameter so this remains the same real-defect
-- class as CMA-3B.1's chat/action extension: Postgres treats an added
-- parameter as a new overload unless the old signature is explicitly
-- dropped first. The DROP below is that fix, applied proactively this
-- time (validated via disposable PostgreSQL, not discovered live).

drop function if exists public.call_center_cma_evaluate_qa_measure(text, timestamptz, timestamptz, boolean, text[], text, text, text);

create or replace function public.call_center_cma_evaluate_qa_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_channel text default null,
  p_group_by text default null,
  p_population text default 'combined'
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_param text;
  v_target_value text;
  v_shape text;
  v_result jsonb;
begin
  case p_canonical_measure_id
    when 'CANON-CONTEXT-CONTINUITY-RATE' then v_param := 'context_continuity_rate'; v_target_value := 'PASS'; v_shape := 'turn';
    when 'CANON-FOLLOWUP-UNDERSTANDING-RATE' then v_param := 'followup_understanding_rate'; v_target_value := 'PASS'; v_shape := 'turn';
    when 'CANON-TASK-PROGRESSION-RATE' then v_param := 'task_progression_rate'; v_target_value := 'PASS'; v_shape := 'turn';
    when 'CANON-REFERENCE-RES-ACC' then v_param := 'reference_resolution_accuracy'; v_target_value := 'PASS'; v_shape := 'turn';
    when 'CANON-RESPONSE-GROUNDING-RATE' then v_param := 'response_grounding_rate'; v_target_value := 'GROUNDED'; v_shape := 'turn';
    when 'CANON-CONVERSATION-RECOVERY-RATE' then v_param := 'conversation_recovery_rate'; v_target_value := 'SUCCESSFUL'; v_shape := 'turn';
    when 'CANON-UNNECESSARY-CLARIFICATION-RATE' then v_param := 'unnecessary_clarification_rate'; v_target_value := 'ISSUE'; v_shape := 'turn';
    when 'CANON-REPETITION-LOOP-RATE' then v_param := 'repetition_loop_rate'; v_target_value := 'ISSUE'; v_shape := 'review';
    when 'CANON-CUSTOMER-CORRECTION-RATE' then v_param := 'customer_correction_rate'; v_target_value := 'ISSUE'; v_shape := 'review';
    else return jsonb_build_object('status', 'unsupported');
  end case;

  if p_group_by is not null and p_group_by not in ('agent', 'channel') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  if p_population is null or p_population not in ('human', 'automated', 'combined') then
    return jsonb_build_object('status', 'unsupported');
  end if;

  with pop as (
    select qr.agent_id, qr.channel, qf.value, qf.review_id::text as unit_id
    from call_center.qa_findings qf
    join call_center.qa_reviews qr on qr.id = qf.review_id
    where p_population in ('human', 'combined')
      and qf.parameter_code = v_param and qr.status = 'submitted'
      and qr.started_at >= p_started_from and qr.started_at < p_started_to
      and (p_all_agents or qr.agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or qr.agent_id = p_filter_agent_id)
      and (p_filter_channel is null or qr.channel = p_filter_channel)
    union all
    select aqe.agent_id, aqe.channel, ao.value, ao.evaluation_id::text as unit_id
    from call_center.automated_qa_observations ao
    join call_center.automated_qa_evaluations aqe on aqe.id = ao.evaluation_id
    where p_population in ('automated', 'combined')
      and ao.parameter_code = v_param and aqe.status = 'completed'
      and aqe.started_at >= p_started_from and aqe.started_at < p_started_to
      and (p_all_agents or aqe.agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or aqe.agent_id = p_filter_agent_id)
      and (p_filter_channel is null or aqe.channel = p_filter_channel)
  ),
  flagged as (
    select *,
      (value is not null and value not in ('N_A', 'CANNOT_VERIFY')) as eligible,
      (value = v_target_value) as is_target
    from pop
  )
  select case
    when v_shape = 'review' then
      case p_group_by
        when 'agent' then jsonb_build_object('groups', coalesce((
          select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', num, 'denominator', denom) order by agent_id)
          from (
            select agent_id,
                   count(distinct unit_id) filter (where eligible) as denom,
                   count(distinct unit_id) filter (where eligible and is_target) as num,
                   count(distinct unit_id) as cnt
            from flagged where agent_id is not null group by agent_id
          ) g), '[]'::jsonb))
        when 'channel' then jsonb_build_object('groups', coalesce((
          select jsonb_agg(jsonb_build_object('key', channel, 'population', cnt, 'numerator', num, 'denominator', denom) order by channel)
          from (
            select channel,
                   count(distinct unit_id) filter (where eligible) as denom,
                   count(distinct unit_id) filter (where eligible and is_target) as num,
                   count(distinct unit_id) as cnt
            from flagged group by channel
          ) g), '[]'::jsonb))
        else jsonb_build_object(
          'population', (select count(distinct unit_id) from flagged),
          'denominator', (select count(distinct unit_id) from flagged where eligible),
          'numerator', (select count(distinct unit_id) from flagged where eligible and is_target)
        )
      end
    else
      case p_group_by
        when 'agent' then jsonb_build_object('groups', coalesce((
          select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', num, 'denominator', denom) order by agent_id)
          from (
            select agent_id,
                   count(*) filter (where eligible) as denom,
                   count(*) filter (where eligible and is_target) as num,
                   count(*) as cnt
            from flagged where agent_id is not null group by agent_id
          ) g), '[]'::jsonb))
        when 'channel' then jsonb_build_object('groups', coalesce((
          select jsonb_agg(jsonb_build_object('key', channel, 'population', cnt, 'numerator', num, 'denominator', denom) order by channel)
          from (
            select channel,
                   count(*) filter (where eligible) as denom,
                   count(*) filter (where eligible and is_target) as num,
                   count(*) as cnt
            from flagged group by channel
          ) g), '[]'::jsonb))
        else jsonb_build_object(
          'population', (select count(*) from flagged),
          'denominator', (select count(*) filter (where eligible) from flagged),
          'numerator', (select count(*) filter (where eligible and is_target) from flagged)
        )
      end
  end into v_result;

  return jsonb_build_object('status', 'ok') || v_result;
end;
$$;

-- ===== Lock down the same way as every other call_center_* RPC =====
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'call_center_cma_evaluate_qa_measure'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. NOT applied to the live database by this session —
-- created and validated only against disposable PostgreSQL. See
-- docs/SESSION_4D_MEASUREMENT_INTEGRATION_COMPLETION.md.
-- =====================================================================
