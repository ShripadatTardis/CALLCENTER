-- Session CMA-3B — Complete Calculation Catalogue.
--
-- Extends the CMA-3A evaluation engine to 15 more canonical measures
-- across 4 additional, real, already-populated Supabase source families
-- (brief §2: "do not assume all measures must be derived from
-- customer_interactions"). See
-- docs/SESSION_CMA_3B_CALCULATION_CATALOGUE.md and
-- docs/CMA_CALCULATION_COVERAGE.md for the full per-measure rationale.
--
-- Purely additive (brief §10 — no production migration applied this
-- session; created and validated only against disposable PostgreSQL):
--   1. `create or replace function call_center_cma_evaluate_measure` —
--      the exact same CMA-3A function, with ONE new CASE arm added
--      (CANON-INTENT-CONFIDENCE). The 4 already-production-verified
--      measures (CANON-RES-RATE, CANON-AUTH-SUCCESS-RATE,
--      CANON-SUCCESSFUL-RES-TIME, CANON-AVG-SENT-SCORE) are reproduced
--      byte-for-byte unchanged — their approved definitions and
--      population semantics are not touched (brief §1).
--   2. 4 new functions, one per new source family, mirroring the same
--      "eligible/contribution, sum(contribution) filter (where
--      eligible) / count(*) filter (where eligible)" generalization
--      CMA-3A's own RPC already established, applied to each family's
--      own real grain.
-- No new table. No derived value persisted anywhere. No new permission
-- — every new RPC is covered by CMA-3A's existing `cma.evaluate`
-- permission and the same revoke/grant lockdown pattern.

-- =====================================================================
-- PART 1 — call_center_cma_evaluate_measure: CMA-3A's 4 arms unchanged,
-- + CANON-INTENT-CONFIDENCE (avg(intent_confidence), the same pattern
-- CMA-3A already used for CANON-AVG-SENT-SCORE's avg(sentiment_score)).
-- =====================================================================

create or replace function public.call_center_cma_evaluate_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_channel text default null,
  p_filter_campaign_id uuid default null,
  p_group_by text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_result jsonb;
begin
  if p_canonical_measure_id not in (
    'CANON-RES-RATE', 'CANON-AUTH-SUCCESS-RATE', 'CANON-SUCCESSFUL-RES-TIME', 'CANON-AVG-SENT-SCORE',
    'CANON-INTENT-CONFIDENCE'
  ) then
    return jsonb_build_object('status', 'unsupported');
  end if;

  if p_group_by is not null and p_group_by not in ('agent', 'channel') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select
      ci.agent_id,
      ci.channel,
      (case p_canonical_measure_id
         when 'CANON-RES-RATE' then (ci.outcome in ('resolved', 'escalated'))
         when 'CANON-AUTH-SUCCESS-RATE' then (ci.was_authenticated is not null)
         when 'CANON-SUCCESSFUL-RES-TIME' then (ci.outcome = 'resolved' and ci.duration_seconds is not null and ci.duration_seconds < 14400)
         when 'CANON-AVG-SENT-SCORE' then (ci.sentiment_score is not null)
         when 'CANON-INTENT-CONFIDENCE' then (ci.intent_confidence is not null)
       end) as eligible,
      (case p_canonical_measure_id
         when 'CANON-RES-RATE' then (case when ci.outcome = 'resolved' then 1 else 0 end)::numeric
         when 'CANON-AUTH-SUCCESS-RATE' then (case when ci.was_authenticated then 1 else 0 end)::numeric
         when 'CANON-SUCCESSFUL-RES-TIME' then ci.duration_seconds::numeric
         when 'CANON-AVG-SENT-SCORE' then ci.sentiment_score
         when 'CANON-INTENT-CONFIDENCE' then ci.intent_confidence
       end) as contribution
    from call_center.customer_interactions ci
    where ci.channel = 'voice'
      and ci.started_at >= p_started_from
      and ci.started_at < p_started_to
      and (p_all_agents or ci.agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or ci.agent_id = p_filter_agent_id)
      and (p_filter_channel is null or ci.channel = p_filter_channel)
      and (p_filter_campaign_id is null or ci.campaign_id = p_filter_campaign_id)
  )
  select case p_group_by
    when 'agent' then jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', g.agent_id, 'population', g.cnt, 'numerator', g.num, 'denominator', g.denom
        ) order by g.agent_id)
        from (
          select agent_id,
                 count(*) filter (where eligible) as denom,
                 sum(contribution) filter (where eligible) as num,
                 count(*) as cnt
          from base
          where agent_id is not null
          group by agent_id
        ) g
      ), '[]'::jsonb)
    )
    when 'channel' then jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', g.channel, 'population', g.cnt, 'numerator', g.num, 'denominator', g.denom
        ) order by g.channel)
        from (
          select channel,
                 count(*) filter (where eligible) as denom,
                 sum(contribution) filter (where eligible) as num,
                 count(*) as cnt
          from base
          group by channel
        ) g
      ), '[]'::jsonb)
    )
    else jsonb_build_object(
      'population', (select count(*) from base),
      'numerator', (select sum(contribution) filter (where eligible) from base),
      'denominator', (select count(*) filter (where eligible) from base)
    )
  end into v_result;

  return jsonb_build_object('status', 'ok') || v_result;
end;
$$;

-- =====================================================================
-- PART 2 — 'qa' family: call_center.qa_findings + qa_reviews (Human QA,
-- status='submitted') UNION automated_qa_observations +
-- automated_qa_evaluations (Automated QA, status='completed') — exactly
-- the two sources src/lib/qaRatios.ts / automatedQaRatios.ts already
-- read, reimplemented in SQL. Real, observed value vocabulary per
-- parameter (queried live from production this session, not assumed):
-- most turn-level parameters use PASS/FAIL (Human) or PASS/N_A
-- (Automated); response_grounding_rate uses GROUNDED/N_A;
-- conversation_recovery_rate uses SUCCESSFUL; repetition_loop_rate and
-- unnecessary_clarification_rate use ISSUE/NO_ISSUE. The eligibility
-- rule (`value not in ('N_A','CANNOT_VERIFY')`) and the "numerator
-- label" (the one value counted as a hit) are supplied per canonical
-- measure id rather than assumed uniform, since the real vocabulary is
-- not uniform across parameters.
-- =====================================================================

create or replace function public.call_center_cma_evaluate_qa_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_channel text default null,
  p_group_by text default null
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
    -- lower-is-better: the "target value" counted in the numerator is the PROBLEM label itself,
    -- per the register's own documented convention ("numerator = problem value count").
    when 'CANON-UNNECESSARY-CLARIFICATION-RATE' then v_param := 'unnecessary_clarification_rate'; v_target_value := 'ISSUE'; v_shape := 'turn';
    when 'CANON-REPETITION-LOOP-RATE' then v_param := 'repetition_loop_rate'; v_target_value := 'ISSUE'; v_shape := 'review';
    when 'CANON-CUSTOMER-CORRECTION-RATE' then v_param := 'customer_correction_rate'; v_target_value := 'ISSUE'; v_shape := 'review';
    else return jsonb_build_object('status', 'unsupported');
  end case;

  if p_group_by is not null and p_group_by not in ('agent', 'channel') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with pop as (
    select qr.agent_id, qr.channel, qf.value, qf.review_id::text as unit_id
    from call_center.qa_findings qf
    join call_center.qa_reviews qr on qr.id = qf.review_id
    where qf.parameter_code = v_param and qr.status = 'submitted'
      and qr.started_at >= p_started_from and qr.started_at < p_started_to
      and (p_all_agents or qr.agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or qr.agent_id = p_filter_agent_id)
      and (p_filter_channel is null or qr.channel = p_filter_channel)
    union all
    select aqe.agent_id, aqe.channel, ao.value, ao.evaluation_id::text as unit_id
    from call_center.automated_qa_observations ao
    join call_center.automated_qa_evaluations aqe on aqe.id = ao.evaluation_id
    where ao.parameter_code = v_param and aqe.status = 'completed'
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

-- =====================================================================
-- PART 3 — 'campaign' family: call_center.campaign_targets +
-- campaign_results + campaign_classifications. Scoped by
-- campaign_results.agent_id (the AI agent that handled the execution)
-- — the SAME Agent Scope mechanism as every other family here, not a
-- second authorization model (brief §3: "do not introduce measure-
-- specific Agent, Campaign, Channel or Time interpretation").
-- =====================================================================

create or replace function public.call_center_cma_evaluate_campaign_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_campaign_id uuid default null,
  p_group_by text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_result jsonb;
begin
  if p_canonical_measure_id not in (
    'CANON-CAMPAIGN-TARGET-COUNT', 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI', 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS'
  ) then
    return jsonb_build_object('status', 'unsupported');
  end if;

  if p_group_by is not null and p_group_by not in ('agent', 'campaign') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select
      t.campaign_id,
      r.agent_id,
      (case p_canonical_measure_id
         when 'CANON-CAMPAIGN-TARGET-COUNT' then true
         when 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI' then (t.effective_result_id is not null and r.is_success is not null)
         when 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS' then (r.campaign_classification_code is not null)
       end) as eligible,
      (case p_canonical_measure_id
         when 'CANON-CAMPAIGN-TARGET-COUNT' then 1
         when 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI' then (case when r.is_success then 1 else 0 end)
         when 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS' then (case when cls.is_success then 1 else 0 end)
       end)::numeric as contribution
    from call_center.campaign_targets t
    left join call_center.campaign_results r on r.id = t.effective_result_id
    left join call_center.campaign_classifications cls on cls.code = r.campaign_classification_code
    where t.created_at >= p_started_from and t.created_at < p_started_to
      and (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or r.agent_id = p_filter_agent_id)
      and (p_filter_campaign_id is null or t.campaign_id = p_filter_campaign_id)
  )
  select case p_group_by
    when 'campaign' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', campaign_id::text, 'population', cnt, 'numerator', num, 'denominator', denom) order by campaign_id)
      from (
        select campaign_id,
               count(*) filter (where eligible) as denom,
               sum(contribution) filter (where eligible) as num,
               count(*) as cnt
        from base group by campaign_id
      ) g), '[]'::jsonb))
    when 'agent' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', num, 'denominator', denom) order by agent_id)
      from (
        select agent_id,
               count(*) filter (where eligible) as denom,
               sum(contribution) filter (where eligible) as num,
               count(*) as cnt
        from base where agent_id is not null group by agent_id
      ) g), '[]'::jsonb))
    else jsonb_build_object(
      'population', (select count(*) from base),
      'numerator', (select sum(contribution) filter (where eligible) from base),
      'denominator', (select count(*) filter (where eligible) from base)
    )
  end into v_result;

  return jsonb_build_object('status', 'ok') || v_result;
end;
$$;

-- =====================================================================
-- PART 4 — 'chat' family: call_center.chat_sessions.
-- =====================================================================

create or replace function public.call_center_cma_evaluate_chat_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_group_by text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_result jsonb;
begin
  if p_canonical_measure_id <> 'CANON-CHAT-SESSION-SPAN' then
    return jsonb_build_object('status', 'unsupported');
  end if;
  if p_group_by is not null and p_group_by not in ('agent') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select agent_id, extract(epoch from (last_activity_at - started_at))::numeric as span_seconds
    from call_center.chat_sessions
    where started_at >= p_started_from and started_at < p_started_to
      and last_activity_at is not null
      and (p_all_agents or agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or agent_id = p_filter_agent_id)
  )
  select case p_group_by
    when 'agent' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', num, 'denominator', denom) order by agent_id)
      from (select agent_id, count(*) as denom, sum(span_seconds) as num, count(*) as cnt from base where agent_id is not null group by agent_id) g
    ), '[]'::jsonb))
    else jsonb_build_object(
      'population', (select count(*) from base),
      'numerator', (select sum(span_seconds) from base),
      'denominator', (select count(*) from base)
    )
  end into v_result;

  return jsonb_build_object('status', 'ok') || v_result;
end;
$$;

-- =====================================================================
-- PART 5 — 'action' family: call_center.action_items (Session 15's
-- Action Required queue). A raw count — numerator=denominator=count(*)
-- of in-window, in-scope rows (see cmaEvaluation.ts's 'count'-unit
-- handling for why this is never reported as zero_denominator).
-- =====================================================================

create or replace function public.call_center_cma_evaluate_action_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_group_by text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_result jsonb;
begin
  if p_canonical_measure_id <> 'CANON-ACTION-REQUIRED-QUEUE-ITEMS' then
    return jsonb_build_object('status', 'unsupported');
  end if;
  if p_group_by is not null and p_group_by not in ('agent') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select agent_id
    from call_center.action_items
    where created_at >= p_started_from and created_at < p_started_to
      and (p_all_agents or agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or agent_id = p_filter_agent_id)
  )
  select case p_group_by
    when 'agent' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', cnt, 'denominator', cnt) order by agent_id)
      from (select agent_id, count(*) as cnt from base where agent_id is not null group by agent_id) g
    ), '[]'::jsonb))
    else jsonb_build_object(
      'population', (select count(*) from base),
      'numerator', (select count(*) from base),
      'denominator', (select count(*) from base)
    )
  end into v_result;

  return jsonb_build_object('status', 'ok') || v_result;
end;
$$;

-- =====================================================================
-- PART 6 — lock down every new function the same way as every prior
-- CMA RPC. No new permission needed — all 4 new functions are reached
-- only through the existing CMA-3A evaluation pipeline, already gated
-- by `cma.evaluate`.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_cma_evaluate_measure',
        'call_center_cma_evaluate_qa_measure',
        'call_center_cma_evaluate_campaign_measure',
        'call_center_cma_evaluate_chat_measure',
        'call_center_cma_evaluate_action_measure'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session.
-- Session CMA-3B.
-- =====================================================================
