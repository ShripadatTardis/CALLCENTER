-- Session 10 — real RPCs backing the 6 CMA_NON_AGGREGATE canonical measures.
-- Each reuses already-captured data (customer_interactions.sentiment_score,
-- corrective_actions, qa_findings/qa_reviews, automated_qa_observations/
-- automated_qa_evaluations) — no new tables, no new sync job. Scoped by
-- Agent Scope the same way every other CMA evaluate RPC is, and by
-- dataset_id where the underlying table has one.

-- 1. CANON-SENT — sentiment label distribution (not the numeric average,
-- which CANON-AVG-SENT-SCORE already covers).
create or replace function public.call_center_cma_sentiment_distribution(
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_filter_agent_id text default null,
  p_dataset_id text default null
) returns jsonb language sql stable security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'status', 'ok',
    'totalPopulation', count(*),
    'buckets', jsonb_build_array(
      jsonb_build_object('label', 'positive', 'count', count(*) filter (where sentiment_score > 0.3)),
      jsonb_build_object('label', 'neutral', 'count', count(*) filter (where sentiment_score between -0.3 and 0.3)),
      jsonb_build_object('label', 'negative', 'count', count(*) filter (where sentiment_score < -0.3)),
      jsonb_build_object('label', 'unknown', 'count', count(*) filter (where sentiment_score is null))
    )
  )
  from call_center.customer_interactions
  where channel = 'voice'
    and (case when p_dataset_id is null then dataset_id is null else dataset_id = p_dataset_id end)
    and started_at >= p_started_from and started_at < p_started_to
    and (p_all_agents or agent_id = any(p_authorized_agent_ids))
    and (p_filter_agent_id is null or agent_id = p_filter_agent_id);
$$;

-- 2. CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY — single-record lookup,
-- scoped: a corrective action outside the caller's authorized Agent Scope
-- is never returned, same fail-closed convention as every other CMA path.
create or replace function public.call_center_cma_corrective_action_lookup(
  p_id uuid,
  p_all_agents boolean,
  p_authorized_agent_ids text[]
) returns jsonb language sql stable security definer set search_path = call_center, pg_temp as $$
  select coalesce(
    (
      select jsonb_build_object(
        'status', 'ok',
        'fields', jsonb_build_object(
          'id', ca.id, 'caNumber', ca.ca_number, 'title', ca.title,
          'status', ca.status, 'priority', ca.priority, 'category', ca.category,
          'agentId', ca.agent_id
        )
      )
      from call_center.corrective_actions ca
      where ca.id = p_id
        and (p_all_agents or ca.agent_id is null or ca.agent_id = any(p_authorized_agent_ids))
    ),
    jsonb_build_object('status', 'not_found')
  );
$$;

-- 3. QA Calibration — one shared paired-rows RPC backing all 3 CALIB-0x
-- canonical measures (per-parameter classification, coverage divergence,
-- prompt-version disagreement) — each is a different TypeScript-side view
-- over the SAME joined population, avoiding 3 near-duplicate SQL joins.
-- Paired on (interaction_id, parameter_code): only interactions that have
-- BOTH a submitted Human QA review AND a completed Automated QA evaluation
-- can be compared at all — a full outer join so one-sided coverage gaps
-- (needed for CALIB-02) are visible too, not silently dropped.
create or replace function public.call_center_cma_qa_calibration_paired(
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_dataset_id text default null
) returns jsonb language sql stable security definer set search_path = call_center, pg_temp as $$
  with human as (
    select qr.interaction_id, qf.parameter_code, qf.value, qr.agent_id
    from call_center.qa_findings qf
    join call_center.qa_reviews qr on qr.id = qf.review_id
    where qr.status = 'submitted'
      and (case when p_dataset_id is null then qr.dataset_id is null else qr.dataset_id = p_dataset_id end)
      and qr.started_at >= p_started_from and qr.started_at < p_started_to
      and (p_all_agents or qr.agent_id = any(p_authorized_agent_ids))
  ),
  automated as (
    select aqe.interaction_id, ao.parameter_code, ao.value, aqe.agent_id, aqe.prompt_version
    from call_center.automated_qa_observations ao
    join call_center.automated_qa_evaluations aqe on aqe.id = ao.evaluation_id
    where aqe.status = 'completed'
      and (case when p_dataset_id is null then aqe.dataset_id is null else aqe.dataset_id = p_dataset_id end)
      and aqe.started_at >= p_started_from and aqe.started_at < p_started_to
      and (p_all_agents or aqe.agent_id = any(p_authorized_agent_ids))
  )
  select jsonb_build_object(
    'status', 'ok',
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interactionId', coalesce(h.interaction_id, a.interaction_id),
        'parameterCode', coalesce(h.parameter_code, a.parameter_code),
        'humanValue', h.value,
        'automatedValue', a.value,
        'promptVersion', a.prompt_version
      ))
      from human h
      full outer join automated a
        on a.interaction_id = h.interaction_id and a.parameter_code = h.parameter_code
    ), '[]'::jsonb)
  );
$$;

-- ===== Lock down, same pattern as every other call_center_* RPC =====
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_cma_sentiment_distribution',
        'call_center_cma_corrective_action_lookup',
        'call_center_cma_qa_calibration_paired'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
