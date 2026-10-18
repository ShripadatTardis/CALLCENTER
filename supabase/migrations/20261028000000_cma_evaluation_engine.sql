-- Session CMA-3A — Central Calculation & Evaluation Engine.
--
-- Implements the single database-side aggregation RPC the central
-- evaluation service (src/server/cma/cmaEvaluation.ts) calls to compute
-- the 4 governed, 'decided' canonical measures selected for this session
-- (CANON-RES-RATE, CANON-AUTH-SUCCESS-RATE, CANON-SUCCESSFUL-RES-TIME,
-- CANON-AVG-SENT-SCORE — see docs/SESSION_CMA_3A_CALCULATION_ENGINE.md
-- for why these four and not FCR/Escalation Rate/AHT/Technical
-- Performance, which remain governed 'pending_decision' and are
-- deliberately NOT implemented here).
--
-- Deliberately minimal (brief §8/§9): one new function, zero new tables,
-- zero new columns on customer_interactions, no derived values persisted
-- anywhere. All aggregation happens inside this single statement, in the
-- database, over call_center.customer_interactions (already governed by
-- CMA-1A) — the application layer never loads interaction rows into
-- memory to compute a value; it only receives already-aggregated
-- numerator/denominator/population numbers.
--
-- Each measure's eligibility/numerator predicate is expressed exactly
-- once, as one CASE arm per canonical measure id, reused unchanged
-- whether the request is grouped or not — "implement each algorithm
-- once" (brief §6) is structural here, not just a convention: there is
-- no second code path that could compute FCR differently for Dashboard
-- vs Analytics, because there is only one function and one CASE arm per
-- measure.
--
-- Business Data Scope (brief §4) is enforced INSIDE this function's own
-- WHERE clause (p_all_agents / p_authorized_agent_ids), before any
-- aggregation runs — a grouped-by-agent result can only ever contain
-- agents the caller is already authorized to see; there is no
-- post-aggregation filtering step this could bypass if skipped.
--
-- NOT applied to the live database by this session (brief §12 — "Apply
-- new migrations to production" is explicitly not authorized). Created
-- and validated only against a disposable local PostgreSQL instance; see
-- the session report for that validation's results.

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
  -- Governance gate #1: only canonical measures this session actually
  -- implements an algorithm for. A canonical measure the TypeScript
  -- registry (src/server/cma/cmaEvaluationAlgorithms.ts) does not list is
  -- rejected here too — this RPC is not a generic query builder (brief
  -- §8: "Do not create a separate analytics database, warehouse or
  -- generalized rules engine") and never silently "figures out" a
  -- formula for an id it wasn't explicitly given one for.
  if p_canonical_measure_id not in (
    'CANON-RES-RATE', 'CANON-AUTH-SUCCESS-RATE', 'CANON-SUCCESSFUL-RES-TIME', 'CANON-AVG-SENT-SCORE'
  ) then
    return jsonb_build_object('status', 'unsupported');
  end if;

  -- Governance gate #2: only the two groupings this session implements.
  if p_group_by is not null and p_group_by not in ('agent', 'channel') then
    return jsonb_build_object('status', 'unsupported_dimension');
  end if;

  -- base: one row per in-scope, in-window, filter-matching interaction,
  -- with two measure-specific flags computed per row:
  --   eligible    -- is this row part of the measure's denominator at all?
  --   contribution -- this row's numeric contribution to the numerator
  --                   (1/0 for a count-based ratio, the raw fact value
  --                   for an average-type measure) -- see the session
  --                   report for why "numerator = sum(contribution) filter
  --                   (where eligible)" generalizes both measure shapes
  --                   without a separate code path per shape.
  -- Business Data Scope is enforced in this CTE's own WHERE clause, the
  -- same place the window/filter predicates live -- there is structurally
  -- no later step that could aggregate an out-of-scope row by accident.
  with base as (
    select
      ci.agent_id,
      ci.channel,
      (case p_canonical_measure_id
         when 'CANON-RES-RATE' then (ci.outcome in ('resolved', 'escalated'))
         when 'CANON-AUTH-SUCCESS-RATE' then (ci.was_authenticated is not null)
         when 'CANON-SUCCESSFUL-RES-TIME' then (ci.outcome = 'resolved' and ci.duration_seconds is not null and ci.duration_seconds < 14400)
         when 'CANON-AVG-SENT-SCORE' then (ci.sentiment_score is not null)
       end) as eligible,
      (case p_canonical_measure_id
         when 'CANON-RES-RATE' then (case when ci.outcome = 'resolved' then 1 else 0 end)::numeric
         when 'CANON-AUTH-SUCCESS-RATE' then (case when ci.was_authenticated then 1 else 0 end)::numeric
         when 'CANON-SUCCESSFUL-RES-TIME' then ci.duration_seconds::numeric
         when 'CANON-AVG-SENT-SCORE' then ci.sentiment_score
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

-- ===== Permission vocabulary (additive, same pattern as cma.sync.manage / cma.registry.view) =====
insert into call_center.permissions (key, label, description, pillar) values
  ('cma.evaluate', 'Evaluate CMA Measures', 'Run a governed, scope-authorized evaluation of an approved CMA canonical measure.', 'Operationalize')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions where key = 'cma.evaluate'
on conflict do nothing;

-- ===== Lock down the new function the same way as every other call_center_* RPC =====
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('call_center_cma_evaluate_measure')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session.
-- Session CMA-3A.
-- =====================================================================
