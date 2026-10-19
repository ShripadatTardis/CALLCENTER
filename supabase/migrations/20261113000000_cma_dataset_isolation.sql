-- Session 7-T — RECOMMENDED ISOLATION MIGRATION. NOT APPLIED ANYWHERE.
--
-- Written to disk only, in this session's own isolated clone/branch,
-- for a human or a future coordinated session to review and apply --
-- per this session's explicit, unconditional instruction never to
-- apply any migration or write any row to the shared Supabase project
-- (dtbaczafdzgctkbqviod) from this task.
--
-- Problem this solves (see docs/SESSION_7T_CMA_SYNTHETIC_DATA_VALIDATION.md
-- §7 for the full writeup): the only isolation mechanism available
-- today for a synthetic test population is an id-prefix convention
-- (e.g. `cma500_`, `fx_`). That is adequate for a disposable-PostgreSQL
-- pass (as this session and Session 4D both demonstrate) but is NOT
-- safe for the shared, live POC database -- no Dashboard, Campaign,
-- Analytics, or CMA evaluation query filters on an id prefix, so a
-- synthetic row inserted into the real tables would be silently counted
-- by every existing measurement path.
--
-- This is a MINIMAL, additive, backward-compatible column + a single
-- default-exclusion predicate in the 2 RPCs this session actually
-- tested against the interaction/chat source families. It deliberately
-- does NOT touch qa_reviews/automated_qa_evaluations/campaign tables --
-- doing that correctly needs a dedicated review of every QA- and
-- campaign-family RPC's own WHERE clause, out of this session's scope.
--
-- Every existing real row has dataset_id = null (the column default)
-- and `and dataset_id is null` evaluates to true for every one of
-- them, so this changes NO existing query result for real data. A
-- future synthetic row would set a non-null dataset_id and would be
-- excluded from every normal evaluation by default -- this migration
-- does not add an opt-in parameter to query a specific dataset_id;
-- that is a separate, deliberately-not-attempted follow-up decision
-- (would need its own authorization/visibility review).

-- =====================================================================
-- PART 1 — additive column, nullable, default null (no backfill needed;
-- every existing row already has no such column and would be read as
-- null either way).
-- =====================================================================

alter table call_center.customer_interactions
  add column if not exists dataset_id text default null;

alter table call_center.chat_sessions
  add column if not exists dataset_id text default null;

comment on column call_center.customer_interactions.dataset_id is
  'Null for all real operational data. A non-null value (e.g. CMA_POC_500_V1) marks a synthetic test row; call_center_cma_evaluate_measure excludes any non-null dataset_id from every normal evaluation by default.';
comment on column call_center.chat_sessions.dataset_id is
  'Same convention as customer_interactions.dataset_id -- see that column''s comment.';

-- =====================================================================
-- PART 2 — amend the 2 RPCs' base CTEs to add the one default-exclusion
-- predicate. Byte-for-byte identical to the current production bodies
-- (supabase/migrations/20261029000000_cma_calculation_catalogue.sql +
-- 20261030000000_cma_dimension_governance_correction.sql) except for
-- this one added line each. Not touching call_center_cma_evaluate_qa_measure
-- or any campaign-family RPC -- see the header note above.
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
      and ci.dataset_id is null -- SESSION 7-T ADDITION: exclude synthetic test datasets from every normal evaluation by default
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

create or replace function public.call_center_cma_evaluate_chat_measure(
  p_canonical_measure_id text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_group_by text default null,
  p_filter_campaign_id uuid default null
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
      and dataset_id is null -- SESSION 7-T ADDITION: same convention as customer_interactions.dataset_id above
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

-- =====================================================================
-- END OF MIGRATION. NOT APPLIED TO ANY DATABASE BY THIS SESSION --
-- disposable or shared. Requires a dedicated review (per this file's
-- header) before anyone applies it, including: (a) whether
-- qa_reviews/automated_qa_evaluations/campaign-family RPCs need the
-- same treatment before any synthetic QA/campaign data could safely
-- join the shared database, and (b) whether an opt-in "evaluate THIS
-- dataset_id" parameter should ever be added (deliberately not
-- proposed here).
-- =====================================================================
