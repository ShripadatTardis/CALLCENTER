-- Session 9/10 — FCR-03 / ESC-03 / AHT-03 CANDIDATE calculations.
--
-- Extends call_center_cma_evaluate_measure's CASE arms with the three
-- candidate definitions already recorded in
-- docs/CMA_BUSINESS_DEFINITION_DECISIONS.md and already implemented,
-- independently verified, and deployed in src/server/analytics/ratioMath.ts
-- (computeFcr / computeEscalationRate / computeAht) — this migration
-- reuses those exact, already-verified formulas inside the CMA
-- engine's own SQL aggregation shape, it does not invent new ones.
--
-- CANDIDATE, NOT ACTIVATED. Governance gate #1 below intentionally DOES
-- include the 3 new canonical ids so this RPC itself can be exercised
-- directly. The production evaluation path
-- (src/server/cma/cmaEvaluation.ts -> CMA_ALGORITHM_REGISTRY in
-- cmaEvaluationAlgorithms.ts) deliberately does NOT list these 3
-- canonical ids, so requesting any of them through the real
-- evaluateCmaMeasure() API still returns { kind: 'not_yet_governed' } —
-- unchanged. Session 10's new ownership resolver (cmaOwnershipResolver.ts)
-- calls this RPC directly for these 3 ids only, tagged CMA_PROVISIONAL
-- with accuracyStatus 'unverified' — ownership delivery, never a silent
-- promotion to authoritative. Validated in disposable PostgreSQL (Session 9
-- and re-confirmed Session 10) before this apply. Applied to production
-- Session 10 (previously drafted, unapplied, in Session 9).

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
    'CANON-INTENT-CONFIDENCE',
    'CANON-FIRST-CONTACT-RES', 'CANON-ESC-RATE', 'CANON-AVG-HANDLE-TIME'
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
         -- FCR-03 (ratioMath.ts computeFcr): denominator = every fetched
         -- call. fcr=null (indeterminate) is eligible (counted in the
         -- denominator) but never contributes to the numerator below.
         when 'CANON-FIRST-CONTACT-RES' then true
         -- ESC-03 (ratioMath.ts computeEscalationRate): denominator =
         -- "handled" calls only (a determinate resolved/escalated
         -- outcome). An indeterminate (null) outcome is NEVER silently
         -- treated as resolved or escalated.
         when 'CANON-ESC-RATE' then (ci.outcome in ('resolved', 'escalated'))
         -- AHT-03 (ratioMath.ts computeAht): every call with a finite,
         -- non-stale (< 14400s) duration — same guard CANON-SUCCESSFUL-RES-TIME
         -- already uses, applied here to the full population rather than
         -- resolved-only.
         when 'CANON-AVG-HANDLE-TIME' then (ci.duration_seconds is not null and ci.duration_seconds < 14400)
       end) as eligible,
      (case p_canonical_measure_id
         when 'CANON-RES-RATE' then (case when ci.outcome = 'resolved' then 1 else 0 end)::numeric
         when 'CANON-AUTH-SUCCESS-RATE' then (case when ci.was_authenticated then 1 else 0 end)::numeric
         when 'CANON-SUCCESSFUL-RES-TIME' then ci.duration_seconds::numeric
         when 'CANON-AVG-SENT-SCORE' then ci.sentiment_score
         when 'CANON-INTENT-CONFIDENCE' then ci.intent_confidence
         when 'CANON-FIRST-CONTACT-RES' then (case when ci.fcr then 1 else 0 end)::numeric
         when 'CANON-ESC-RATE' then (case when ci.outcome = 'escalated' then 1 else 0 end)::numeric
         when 'CANON-AVG-HANDLE-TIME' then ci.duration_seconds::numeric
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
