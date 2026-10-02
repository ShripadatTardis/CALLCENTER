-- Session 12.6 — Campaign Outcome Policy, Universal Classification &
-- Follow-up Lifecycle.
--
-- Completes the business-policy layer on top of Session 12.5's
-- structured outcomes: Agent Outcome (actual_outcome_code) -> a
-- campaign-specific mapping -> a small, SYSTEM-OWNED, data-driven
-- Universal Campaign Classification vocabulary -> a configured Next
-- Action. Per explicit instruction, the five classification codes are
-- NEVER hardcoded into application business logic or UI — they are
-- rows in a new master table, fetched live the same way the Agents
-- roster already is (GET .../agents -> useAgents()).
--
-- Everything here is additive. No existing column, table, or function
-- behavior is removed; campaign_result_rules/campaign_result_code/
-- campaign_result_label/is_success (the existing generic, call-level
-- result model) are completely untouched and keep driving existing
-- statistics for every campaign, policy-enabled or not.

-- 1. System-owned master vocabulary — a Call Centre configuration
-- table, not a TypeScript enum. `is_success` is DATA (true only for
-- the one row meaning "campaign objective achieved"), so success-rate
-- logic never needs to compare a classification code against a
-- hardcoded string. `is_fallback_unresolved` is DATA too — exactly one
-- row is flagged as the safe fallback used when an actual outcome
-- exists but no campaign policy mapping covers it (contract drift) or
-- when a policy was never captured; application code looks this flag
-- up rather than hardcoding the string 'UNRESOLVED'.
create table if not exists call_center.campaign_classifications (
  code text primary key,
  label text not null,
  description text,
  is_success boolean not null default false,
  is_fallback_unresolved boolean not null default false,
  sort_order integer not null,
  active boolean not null default true
);

-- At most one row may be the fallback-unresolved anchor.
create unique index if not exists campaign_classifications_one_fallback_unresolved
  on call_center.campaign_classifications ((is_fallback_unresolved))
  where is_fallback_unresolved;

insert into call_center.campaign_classifications (code, label, description, is_success, is_fallback_unresolved, sort_order, active)
values
  ('SUCCESSFUL', 'Successful', 'The intended objective of this campaign was achieved.', true, false, 10, true),
  ('FOLLOW_UP_REQUIRED', 'Follow-up Required', 'The objective is not yet complete and another business action is required.', false, false, 20, true),
  ('UNSUCCESSFUL', 'Unsuccessful', 'A meaningful interaction occurred, but the campaign objective was not achieved.', false, false, 30, true),
  ('INVALID_TARGET', 'Invalid Target', 'The interaction established that the target/contact is not valid or appropriate for this campaign.', false, false, 40, true),
  ('UNRESOLVED', 'Unresolved', 'An explicit business outcome exists or an interaction occurred, but the campaign does not currently have enough policy information to classify it safely.', false, true, 50, true)
on conflict (code) do nothing;

-- 2. Campaign-level immutable Outcome Policy snapshot — same pattern
-- as agent_contract_snapshot (Session 9.1/11.7): captured once at
-- campaign-creation time, never dynamically reinterpreted against a
-- later agent catalogue or a later edit to the master classification
-- table. Shape (application-level, not enforced here):
--   { mappings: [{ agentOutcomeCode, campaignClassificationCode, nextActionType }], capturedAt }
-- Null for every campaign created before this migration (legacy —
-- Session 12.6 §16 requires these keep working, unmodified, with no
-- synthesized policy).
alter table call_center.campaigns
  add column if not exists outcome_policy_snapshot jsonb;

-- 3. campaign_results gains the per-result runtime classification,
-- kept strictly alongside (never overwriting) the existing generic
-- campaign_result_code/campaign_result_label/is_success columns.
alter table call_center.campaign_results
  add column if not exists campaign_classification_code text references call_center.campaign_classifications(code),
  add column if not exists classification_contract_drift boolean not null default false,
  add column if not exists classification_next_action_type text;

-- 4. Read-only master-list RPC — the one and only place the frontend
-- or any other server code should learn what classification codes
-- exist; never a hardcoded array in a component or service file.
create or replace function public.call_center_campaign_classifications_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb)
    from call_center.campaign_classifications c
    where c.active;
$$;

-- 5. createCampaign gains an optional outcome-policy snapshot param,
-- stored verbatim (the caller has already validated every mapped code
-- against the live classifications list before submitting). Overload
-- with a default so every existing caller keeps compiling/working
-- unchanged.
create or replace function public.call_center_campaign_create(
  p_name text, p_description text, p_agent_id text, p_created_by text,
  p_source_meta jsonb, p_now timestamptz, p_rules jsonb,
  p_agent_name text default null, p_agent_contract_snapshot jsonb default null,
  p_mappings jsonb default null, p_outcome_policy_snapshot jsonb default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_rule jsonb;
  v_mapping jsonb;
begin
  insert into call_center.campaigns (
    name, description, agent_id, status, created_by, source_meta, created_at, updated_at,
    agent_name, agent_contract_snapshot, outcome_policy_snapshot
  ) values (
    p_name, p_description, p_agent_id, 'draft', p_created_by, p_source_meta, p_now, p_now,
    p_agent_name, p_agent_contract_snapshot, p_outcome_policy_snapshot
  ) returning * into v_campaign;

  if p_rules is not null then
    for v_rule in select * from jsonb_array_elements(p_rules) loop
      insert into call_center.campaign_result_rules (
        campaign_id, priority, match_field, match_value, result_code, result_label,
        is_success, next_action_type, next_action_delay_days, active
      ) values (
        v_campaign.id,
        coalesce((v_rule->>'priority')::int, 100),
        v_rule->>'matchField',
        v_rule->>'matchValue',
        v_rule->>'resultCode',
        v_rule->>'resultLabel',
        (v_rule->>'isSuccess')::boolean,
        v_rule->>'nextActionType',
        nullif(v_rule->>'nextActionDelayDays', '')::int,
        coalesce((v_rule->>'active')::boolean, true)
      );
    end loop;
  end if;

  if p_mappings is not null then
    for v_mapping in select * from jsonb_array_elements(p_mappings) loop
      insert into call_center.campaign_agent_input_mappings (
        campaign_id, agent_input_field_code, source_type, source_field, required, data_type
      ) values (
        v_campaign.id,
        v_mapping->>'agentInputFieldCode',
        v_mapping->>'sourceType',
        v_mapping->>'sourceField',
        coalesce((v_mapping->>'required')::boolean, false),
        v_mapping->>'dataType'
      );
    end loop;
  end if;

  return to_jsonb(v_campaign);
end;
$$;

-- 6. Reconciliation insert gains the three new result columns, read
-- from the same p_result jsonb payload the caller already builds —
-- a legacy/no-policy result simply has them null, byte-identical to
-- pre-12.6 behavior.
create or replace function public.call_center_campaign_update_reconciliation_status(
  p_execution_id uuid, p_status text, p_reconciled_interaction_id text,
  p_candidate jsonb, p_now timestamptz, p_result jsonb
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_target_id uuid;
  v_result call_center.campaign_results;
begin
  update call_center.campaign_executions set
    reconciliation_status = p_status,
    reconciled_interaction_id = case when p_status = 'reconciled' then p_reconciled_interaction_id else reconciled_interaction_id end,
    reconciliation_candidate = coalesce(p_candidate, reconciliation_candidate),
    reconciled_at = case when p_status = 'reconciled' then p_now else reconciled_at end
    where id = p_execution_id
    returning campaign_target_id into v_target_id;

  if p_status = 'reconciled' and p_result is not null then
    insert into call_center.campaign_results (
      campaign_execution_id, campaign_target_id, call_status, call_outcome, intent,
      campaign_result_code, campaign_result_label, is_success, result_detail, result_source,
      result_recorded_at, next_action, agent_id, agent_name, structured_outputs,
      actual_outcome_code, actual_outcome_name,
      campaign_classification_code, classification_contract_drift, classification_next_action_type
    ) values (
      p_execution_id, v_target_id,
      p_result->>'callStatus', p_result->>'callOutcome', p_result->>'intent',
      p_result->>'resultCode', p_result->>'resultLabel', (p_result->>'isSuccess')::boolean,
      p_result->'resultDetail', coalesce(p_result->>'resultSource', 'rule_match'),
      p_now, p_result->>'nextAction',
      p_result->>'agentId', p_result->>'agentName', p_result->'structuredOutputs',
      p_result->>'actualOutcomeCode', p_result->>'actualOutcomeName',
      p_result->>'campaignClassificationCode', coalesce((p_result->>'classificationContractDrift')::boolean, false),
      p_result->>'classificationNextActionType'
    ) returning * into v_result;

    update call_center.campaign_targets set
      effective_result_id = v_result.id,
      status = case when p_result->>'nextActionType' in ('retry', 'follow_up') then 'follow_up_due' else 'completed' end,
      updated_at = p_now
      where id = v_target_id;
  elsif p_status = 'unresolved' then
    update call_center.campaign_targets set status = 'follow_up_due', updated_at = p_now where id = v_target_id;
  end if;

  return jsonb_build_object('targetId', v_target_id, 'resultId', v_result.id);
end;
$$;

-- 7. Target list gains the three new result columns so Campaign
-- Detail can render Agent Outcome -> Campaign Classification -> Next
-- Action in one fetch.
create or replace function public.call_center_campaign_list_targets(p_campaign_id uuid, p_page integer, p_page_size integer)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb;
begin
  select count(*) into v_total from call_center.campaign_targets where campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows from (
    select
      tg.*,
      cp.raw_value as contact_raw_value,
      cu.display_name as customer_display_name,
      res.campaign_result_code, res.campaign_result_label, res.is_success as result_is_success,
      res.next_action as result_next_action,
      res.actual_outcome_code as result_actual_outcome_code,
      res.actual_outcome_name as result_actual_outcome_name,
      res.structured_outputs as result_structured_outputs,
      res.campaign_classification_code as result_classification_code,
      res.classification_contract_drift as result_classification_contract_drift,
      res.classification_next_action_type as result_classification_next_action_type,
      le.status as latest_execution_status, le.reconciliation_status as latest_reconciliation_status,
      le.reconciled_interaction_id as latest_reconciled_interaction_id
    from call_center.campaign_targets tg
    join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
    join call_center.customers cu on cu.id = tg.customer_id
    left join call_center.campaign_results res on res.id = tg.effective_result_id
    left join lateral (
      select e.* from call_center.campaign_executions e
        where e.campaign_target_id = tg.id order by e.sequence desc limit 1
    ) le on true
    where tg.campaign_id = p_campaign_id
    order by tg.created_at asc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

-- 8. Enrichment path gains the same three fields — an execution whose
-- actual_outcome_code was null at reconciliation time (and therefore
-- had no classification either) can now also be classified once the
-- backend produces a real value, under the SAME only-when-currently-
-- null UPDATE-only guard already proven safe for actual_outcome_code
-- in Session 12.5 — never a second campaign_results row, never an
-- overwrite of an already-recorded classification.
create or replace function public.call_center_campaign_enrich_actual_outcome(
  p_execution_id uuid, p_actual_outcome_code text, p_actual_outcome_name text,
  p_structured_outputs jsonb, p_now timestamptz,
  p_campaign_classification_code text default null,
  p_classification_contract_drift boolean default false,
  p_classification_next_action_type text default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_result call_center.campaign_results;
begin
  select * into v_result from call_center.campaign_results where campaign_execution_id = p_execution_id;

  if v_result.id is null then
    return jsonb_build_object('resultId', null, 'enriched', false, 'reason', 'no_reconciled_result');
  end if;

  if v_result.actual_outcome_code is not null then
    return jsonb_build_object('resultId', v_result.id, 'enriched', false, 'reason', 'already_enriched');
  end if;

  if p_actual_outcome_code is null then
    return jsonb_build_object('resultId', v_result.id, 'enriched', false, 'reason', 'nothing_to_enrich');
  end if;

  update call_center.campaign_results set
    actual_outcome_code = p_actual_outcome_code,
    actual_outcome_name = p_actual_outcome_name,
    structured_outputs = coalesce(p_structured_outputs, structured_outputs),
    campaign_classification_code = coalesce(p_campaign_classification_code, campaign_classification_code),
    classification_contract_drift = coalesce(p_classification_contract_drift, classification_contract_drift),
    classification_next_action_type = coalesce(p_classification_next_action_type, classification_next_action_type)
    where id = v_result.id;

  return jsonb_build_object('resultId', v_result.id, 'enriched', true, 'reason', null);
end;
$$;

-- 9. Campaign stats gain classification counts, computed entirely
-- data-driven (never a hardcoded classification code in a FILTER
-- clause): `policy_classified_count`/`policy_successful_count` join
-- against campaign_classifications.is_success rather than comparing a
-- code string, and `classification_counts` is a free-form {code:
-- count} map built from whatever codes actually appear — the frontend
-- resolves each code's label from the same live classifications list
-- it already fetched, never a hardcoded lookup. Existing
-- target_count/triggered_count/classified_count/success_count keys
-- are completely unchanged, still driven by the existing generic
-- is_success column, so legacy campaigns' statistics are byte-for-byte
-- identical to before this migration.
create or replace function public.call_center_campaign_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign jsonb; v_rules jsonb; v_stats jsonb; v_mappings jsonb; v_classification_counts jsonb;
begin
  select to_jsonb(c) into v_campaign from call_center.campaigns c where c.id = p_id;
  if v_campaign is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority), '[]'::jsonb) into v_rules
    from call_center.campaign_result_rules r where r.campaign_id = p_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.agent_input_field_code), '[]'::jsonb) into v_mappings
    from call_center.campaign_agent_input_mappings m where m.campaign_id = p_id;

  select coalesce(jsonb_object_agg(s.code, s.cnt), '{}'::jsonb) into v_classification_counts
    from (
      select res.campaign_classification_code as code, count(distinct t.id) as cnt
        from call_center.campaign_targets t
        join call_center.campaign_results res on res.id = t.effective_result_id
        where t.campaign_id = p_id and res.campaign_classification_code is not null
        group by res.campaign_classification_code
    ) s;

  select jsonb_build_object(
    'target_count', count(distinct t.id),
    'triggered_count', count(distinct e.id) filter (where e.status = 'triggered'),
    'classified_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success is not null),
    'success_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success = true),
    'policy_classified_count', count(distinct t.id) filter (where res.campaign_classification_code is not null),
    'policy_successful_count', count(distinct t.id) filter (where cls.is_success = true),
    'classification_counts', v_classification_counts
  ) into v_stats
  from call_center.campaign_targets t
  left join call_center.campaign_executions e on e.campaign_target_id = t.id
  left join call_center.campaign_results res on res.id = t.effective_result_id
  left join call_center.campaign_classifications cls on cls.code = res.campaign_classification_code
  where t.campaign_id = p_id;

  return v_campaign || jsonb_build_object('rules', v_rules, 'mappings', v_mappings, 'stats', v_stats);
end;
$$;

-- 10. Close the grant gap Session 12.5 left (its two new functions were
-- never explicitly locked to service_role, so they kept Postgres's
-- default PUBLIC execute grant) while locking down every function this
-- migration adds — one pass over the same established wildcard
-- pattern, behavior-neutral for every already-correctly-granted
-- function.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_campaign_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
