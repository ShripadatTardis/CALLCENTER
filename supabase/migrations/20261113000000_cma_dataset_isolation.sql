-- Session 7.1 Part C — CMA dataset isolation (NORMAL / TEST mode).
--
-- Started as Session 7-T's draft (hardcoded `dataset_id is null`
-- exclusion on 2 RPCs, never applied). Session 7.1 extends it to a real
-- explicit NORMAL/TEST toggle (`p_dataset_id text default null`, same
-- parameter name and semantics on every RPC touched) and widens
-- coverage to the QA and campaign families, per Part C's 6-area list.
--
-- Column convention (additive, nullable, default null everywhere):
-- every existing real row already reads as dataset_id = null (NORMAL),
-- so this migration changes NO existing query result until a caller
-- explicitly passes a non-null p_dataset_id. A synthetic row sets a
-- real label (e.g. 'CMA_POC_500_V1') and is visible ONLY when a caller
-- explicitly requests that exact label — never mixed in by default,
-- never silently included.
--
-- p_dataset_id semantics (identical on every RPC below):
--   null (the default)        -> NORMAL mode: only rows with dataset_id is null
--   'CMA_POC_500_V1' (or any)  -> TEST mode: only rows with that exact dataset_id
-- There is no "show both" mode -- the two populations are never mixed
-- silently, per Part C's explicit requirement.
--
-- Areas covered: customer_interactions (voice), chat_sessions (chat),
-- qa_reviews (+ qa_findings via join), automated_qa_evaluations (+
-- automated_qa_observations via join), campaign_targets.
--
-- Areas deliberately NOT covered this session (documented, not
-- silently skipped): action_items (no RPC aggregates synthetic-shaped
-- data here yet, and Session 7-T's dataset has no action-item-shaped
-- rows -- see docs/SESSION_7_1_CMA_TEST_DATA_UI_VALIDATION.md for the
-- rationale) and cma_interaction_evidence/cma_transcript_evidence_cache
-- (no RPC aggregates over these yet at all, confirmed by investigation
-- -- adding a column with nothing reading it would be premature).
--
-- Business Data Scope composition is unchanged: every RPC already
-- takes `p_all_agents boolean, p_authorized_agent_ids text[]` as an
-- independent predicate; `p_dataset_id` is added as one more
-- independent `AND` clause, never touching that logic.
--
-- NOT APPLIED TO PRODUCTION BY THIS WRITE. Validated only against
-- disposable PostgreSQL first -- see
-- docs/SESSION_7_1_CMA_TEST_DATA_UI_VALIDATION.md for that run's
-- results, applied to the shared POC database only after that passed.

-- =====================================================================
-- PART 1 — additive dataset_id columns
-- =====================================================================

alter table call_center.customer_interactions
  add column if not exists dataset_id text default null;
alter table call_center.chat_sessions
  add column if not exists dataset_id text default null;
alter table call_center.qa_reviews
  add column if not exists dataset_id text default null;
alter table call_center.automated_qa_evaluations
  add column if not exists dataset_id text default null;
alter table call_center.campaign_targets
  add column if not exists dataset_id text default null;

comment on column call_center.customer_interactions.dataset_id is
  'Null for all real operational data. A non-null value (e.g. CMA_POC_500_V1) marks a synthetic test row, visible only when a caller explicitly requests that exact dataset_id (TEST mode) -- never mixed into a NORMAL-mode (dataset_id is null) query.';
comment on column call_center.chat_sessions.dataset_id is 'Same convention as customer_interactions.dataset_id -- see that column''s comment.';
comment on column call_center.qa_reviews.dataset_id is 'Same convention as customer_interactions.dataset_id -- see that column''s comment. qa_findings has no column of its own; it is always filtered via its join to qa_reviews.';
comment on column call_center.automated_qa_evaluations.dataset_id is 'Same convention as customer_interactions.dataset_id -- see that column''s comment. automated_qa_observations has no column of its own; it is always filtered via its join to automated_qa_evaluations.';
comment on column call_center.campaign_targets.dataset_id is 'Same convention as customer_interactions.dataset_id -- see that column''s comment.';

-- Index each new column where it is actually filtered on, so a TEST-mode
-- query (dataset_id = a specific label) and a NORMAL-mode query
-- (dataset_id is null, the overwhelming majority of rows) both stay cheap.
create index if not exists customer_interactions_dataset_id_idx on call_center.customer_interactions (dataset_id) where dataset_id is not null;
create index if not exists chat_sessions_dataset_id_idx on call_center.chat_sessions (dataset_id) where dataset_id is not null;
create index if not exists qa_reviews_dataset_id_idx on call_center.qa_reviews (dataset_id) where dataset_id is not null;
create index if not exists automated_qa_evaluations_dataset_id_idx on call_center.automated_qa_evaluations (dataset_id) where dataset_id is not null;
create index if not exists campaign_targets_dataset_id_idx on call_center.campaign_targets (dataset_id) where dataset_id is not null;

-- =====================================================================
-- PART 2 — RPC amendments. Each existing signature is DROPped first
-- (Postgres treats an added parameter as a new overload, not a
-- replacement -- this codebase's own documented gotcha, see
-- 20261018000100_qa_findings_list_drop_stale_overload.sql and
-- 20261101000000_cma_qa_population_selector.sql for the identical
-- precedent). Every function body below is otherwise byte-for-byte
-- identical to the current production body except for the added
-- parameter and its one new predicate line -- never a reimplementation.
-- =====================================================================

-- ---- call_center_cma_evaluate_measure (interaction family) ----------

drop function if exists public.call_center_cma_evaluate_measure(text, timestamptz, timestamptz, boolean, text[], text, text, uuid, text);

create or replace function public.call_center_cma_evaluate_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_channel text default null,
  p_filter_campaign_id uuid default null,
  p_group_by text default null,
  p_dataset_id text default null
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
      and (case when p_dataset_id is null then ci.dataset_id is null else ci.dataset_id = p_dataset_id end)
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

-- ---- call_center_cma_evaluate_chat_measure (chat family) ------------

drop function if exists public.call_center_cma_evaluate_chat_measure(text, timestamptz, timestamptz, boolean, text[], text, text, uuid);

create or replace function public.call_center_cma_evaluate_chat_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_group_by text default null,
  p_filter_campaign_id uuid default null,
  p_dataset_id text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_result jsonb;
begin
  if p_canonical_measure_id <> 'CANON-CHAT-SESSION-SPAN' then
    return jsonb_build_object('status', 'unsupported');
  end if;
  if p_group_by is not null and p_group_by not in ('agent', 'campaign') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select agent_id, campaign_id, extract(epoch from (last_activity_at - started_at))::numeric as span_seconds
    from call_center.chat_sessions
    where started_at >= p_started_from and started_at < p_started_to
      and last_activity_at is not null
      and (case when p_dataset_id is null then dataset_id is null else dataset_id = p_dataset_id end)
      and (p_all_agents or agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or agent_id = p_filter_agent_id)
      and (p_filter_campaign_id is null or campaign_id = p_filter_campaign_id)
  )
  select case p_group_by
    when 'agent' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', num, 'denominator', denom) order by agent_id)
      from (select agent_id, count(*) as denom, sum(span_seconds) as num, count(*) as cnt from base where agent_id is not null group by agent_id) g
    ), '[]'::jsonb))
    when 'campaign' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', campaign_id::text, 'population', cnt, 'numerator', num, 'denominator', denom) order by campaign_id)
      from (select campaign_id, count(*) as denom, sum(span_seconds) as num, count(*) as cnt from base where campaign_id is not null group by campaign_id) g
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

-- ---- call_center_cma_evaluate_qa_measure (qa family) -----------------

drop function if exists public.call_center_cma_evaluate_qa_measure(text, timestamptz, timestamptz, boolean, text[], text, text, text, text);

create or replace function public.call_center_cma_evaluate_qa_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_channel text default null,
  p_group_by text default null,
  p_population text default 'combined',
  p_dataset_id text default null
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
      and (case when p_dataset_id is null then qr.dataset_id is null else qr.dataset_id = p_dataset_id end)
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
      and (case when p_dataset_id is null then aqe.dataset_id is null else aqe.dataset_id = p_dataset_id end)
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

-- ---- call_center_cma_evaluate_campaign_measure (campaign family) -----

drop function if exists public.call_center_cma_evaluate_campaign_measure(text, timestamptz, timestamptz, boolean, text[], text, uuid, text);

create or replace function public.call_center_cma_evaluate_campaign_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_filter_campaign_id uuid default null,
  p_group_by text default null,
  p_dataset_id text default null
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
      and (case when p_dataset_id is null then t.dataset_id is null else t.dataset_id = p_dataset_id end)
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

-- ---- call_center_qa_findings_list / call_center_qa_reviews_population
-- ---- (Human QA Quality Explorer's own listing RPCs, not CMA) --------

drop function if exists public.call_center_qa_findings_list(text[], boolean, int, text, timestamptz, timestamptz, uuid);

create or replace function public.call_center_qa_findings_list(
  p_authorized_agent_ids text[], p_all_agents boolean, p_limit int default 5000,
  p_channel text default null, p_date_from timestamptz default null, p_date_to timestamptz default null,
  p_reviewer_user_id uuid default null, p_dataset_id text default null
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(
    to_jsonb(f) || jsonb_build_object(
      'channel', r.channel,
      'agentId', r.agent_id,
      'interactionId', r.interaction_id,
      'reviewerUserId', r.reviewer_user_id,
      'submittedAt', r.submitted_at
    )
  ), '[]'::jsonb)
  from call_center.qa_findings f
  join call_center.qa_reviews r on r.id = f.review_id
  where r.status = 'submitted'
    and (case when p_dataset_id is null then r.dataset_id is null else r.dataset_id = p_dataset_id end)
    and (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
    and (p_channel is null or r.channel = p_channel)
    and (p_date_from is null or r.submitted_at >= p_date_from)
    and (p_date_to is null or r.submitted_at <= p_date_to)
    and (p_reviewer_user_id is null or r.reviewer_user_id = p_reviewer_user_id)
  limit p_limit;
$$;

drop function if exists public.call_center_qa_reviews_population(text[], boolean, text, timestamptz, timestamptz, uuid, int);

create or replace function public.call_center_qa_reviews_population(
  p_authorized_agent_ids text[], p_all_agents boolean,
  p_channel text default null, p_date_from timestamptz default null, p_date_to timestamptz default null,
  p_reviewer_user_id uuid default null, p_limit int default 5000, p_dataset_id text default null
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  from call_center.qa_reviews r
  where (case when p_dataset_id is null then r.dataset_id is null else r.dataset_id = p_dataset_id end)
    and (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
    and (p_channel is null or r.channel = p_channel)
    and (p_date_from is null or r.started_at >= p_date_from)
    and (p_date_to is null or r.started_at <= p_date_to)
    and (p_reviewer_user_id is null or r.reviewer_user_id = p_reviewer_user_id)
  limit p_limit;
$$;

-- =====================================================================
-- Lock down every amended function the same way as every other
-- call_center_* RPC -- re-applied after the DROP/CREATE above in case a
-- DROP ever clears a grant (it does not for CREATE OR REPLACE, but a
-- DROP + fresh CREATE is a new object and starts with no grants at all).
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_cma_evaluate_measure',
        'call_center_cma_evaluate_chat_measure',
        'call_center_cma_evaluate_qa_measure',
        'call_center_cma_evaluate_campaign_measure',
        'call_center_qa_findings_list',
        'call_center_qa_reviews_population'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. NOT APPLIED ANYWHERE BY THIS WRITE -- validated in
-- disposable PostgreSQL first; applied to the shared POC database only
-- after that validation passes (see
-- docs/SESSION_7_1_CMA_TEST_DATA_UI_VALIDATION.md).
-- =====================================================================
