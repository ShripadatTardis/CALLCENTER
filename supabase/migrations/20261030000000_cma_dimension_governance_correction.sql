-- Session CMA-3B.1 — Dimension Governance Correction.
--
-- Corrects a real inconsistency CMA-3B introduced: its evaluation
-- pipeline validated dimensions for its 4 new source families
-- (qa/campaign/chat/action) through an in-code `supportedDimensions`
-- array per algorithm, duplicating the CMA Dimensions Registry's own
-- authority instead of using it — on the mistaken assumption (stated,
-- incorrectly, in CMA-3B's own session report) that CMA-2 never seeded
-- `cma_measure_dimensions` relationships for these occurrences. It had,
-- for all 75 register occurrences, confirmed this session by direct
-- query against production before writing this migration.
--
-- Comparing those already-seeded relationships against the real table
-- schemas (confirmed by direct `information_schema.columns` inspection,
-- not assumed) found two genuine, small discrepancies this migration
-- corrects — both directions:
--
--   1. The registry claims 'channel' is a valid dimension for
--      CAMP-01/CAMP-02/CAMP-03/CHAT-SPAN-01, and 'outcome' for
--      ACTION-01. None of call_center.campaign_targets,
--      campaign_results, chat_sessions, or action_items has a `channel`
--      column; action_items has no `outcome` column either (its
--      `status` column is a lifecycle state — open/in_progress/
--      resolved — a different concept). These relationships were not
--      factually supported by the real source tables and are removed.
--   2. The registry correctly claims 'campaign' for CHAT-SPAN-01 and
--      ACTION-01 — both chat_sessions and action_items DO have a real
--      campaign_id column — but the CMA-3B runtime (the chat and action
--      evaluation RPCs) never implemented campaign filtering/grouping.
--      This migration extends both RPCs so runtime capability matches
--      what the registry already (correctly) claims.
--
-- Per the brief: "update registry relationships only where they are
-- factually supported by existing source tables... do not invent
-- unsupported dimensional relationships." Every change below traces to
-- a column that was directly confirmed to exist or not exist.
--
-- Does not touch the 4 CMA-3A measures or the 'qa' family (already
-- correct: qa_reviews/automated_qa_evaluations have no campaign_id
-- column, and the registry already correctly lists only agent/channel
-- for all 9 QA occurrences — confirmed, no change needed there).
--
-- NOT applied to the live database by this session until explicitly
-- approved — created and validated only against disposable PostgreSQL;
-- see the session report.

-- =====================================================================
-- PART 1 — remove the 5 registry relationships not factually supported
-- by the real source tables.
-- =====================================================================

delete from call_center.cma_measure_dimensions
where (measure_id, dimension_id) in (
  ('CAMP-01', 'channel'),
  ('CAMP-02', 'channel'),
  ('CAMP-03', 'channel'),
  ('CHAT-SPAN-01', 'channel'),
  ('ACTION-01', 'channel'),
  ('ACTION-01', 'outcome')
);

-- =====================================================================
-- PART 2 — extend the chat RPC to physically support the campaign
-- dimension the registry already (correctly) claims for CHAT-SPAN-01.
-- New parameter appended at the end (Postgres requires new defaulted
-- parameters to come after all existing ones for CREATE OR REPLACE to
-- apply without dropping the function) — callers use named arguments
-- exclusively, so parameter position has no effect on correctness.
--
-- A real defect found and fixed during this session's own disposable-
-- PostgreSQL validation: CREATE OR REPLACE with an added parameter does
-- NOT replace the prior signature — Postgres treats a different
-- parameter list as a distinct overload, leaving the OLD 7-arg (6
-- params + defaults) version live alongside the new 8-arg one, which
-- then makes any call omitting the new argument AMBIGUOUS ("is not
-- unique") rather than falling back cleanly. The old signature must be
-- dropped explicitly first.
-- =====================================================================

drop function if exists public.call_center_cma_evaluate_chat_measure(text, timestamptz, timestamptz, boolean, text[], text, text);

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
-- PART 3 — extend the action RPC the same way, for ACTION-01. Same
-- explicit-drop-first fix as Part 2.
-- =====================================================================

drop function if exists public.call_center_cma_evaluate_action_measure(text, timestamptz, timestamptz, boolean, text[], text, text);

create or replace function public.call_center_cma_evaluate_action_measure(
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
  if p_canonical_measure_id <> 'CANON-ACTION-REQUIRED-QUEUE-ITEMS' then
    return jsonb_build_object('status', 'unsupported');
  end if;
  if p_group_by is not null and p_group_by not in ('agent', 'campaign') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  with base as (
    select agent_id, campaign_id
    from call_center.action_items
    where created_at >= p_started_from and created_at < p_started_to
      and (p_all_agents or agent_id = any(p_authorized_agent_ids))
      and (p_filter_agent_id is null or agent_id = p_filter_agent_id)
      and (p_filter_campaign_id is null or campaign_id = p_filter_campaign_id)
  )
  select case p_group_by
    when 'agent' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', agent_id, 'population', cnt, 'numerator', cnt, 'denominator', cnt) order by agent_id)
      from (select agent_id, count(*) as cnt from base where agent_id is not null group by agent_id) g
    ), '[]'::jsonb))
    when 'campaign' then jsonb_build_object('groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', campaign_id::text, 'population', cnt, 'numerator', cnt, 'denominator', cnt) order by campaign_id)
      from (select campaign_id, count(*) as cnt from base where campaign_id is not null group by campaign_id) g
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
-- PART 4 — lock down the 2 updated functions the same way as every
-- other call_center_* RPC (re-run; CREATE OR REPLACE does not change
-- existing grants, but re-asserting is cheap and keeps this migration
-- self-contained/idempotent).
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_cma_evaluate_chat_measure',
        'call_center_cma_evaluate_action_measure'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session
-- until explicitly approved. Session CMA-3B.1.
-- =====================================================================
