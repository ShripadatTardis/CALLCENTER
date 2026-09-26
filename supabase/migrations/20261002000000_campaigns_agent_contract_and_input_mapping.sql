-- Session 9.1: Outbound Campaign Domain Build — Agent Contract snapshot,
-- Audience/Input Mapping model, and result traceability columns.
--
-- Purely additive: every new column is nullable, every new table is new,
-- and every changed RPC is a create-or-replace that keeps its existing
-- parameter positions valid for old callers that don't pass the new
-- (also-optional) trailing parameters. Existing campaigns/executions/
-- results continue to read/write exactly as before.
--
-- Design source: docs/SESSION_9_1_OUTBOUND_CAMPAIGN_DOMAIN_BUILD.md,
-- VOICEFORCE_OUTBOUND_CAMPAIGN_DESIGN_v2.docx.

-- ---------------------------------------------------------------------
-- 1. Agent Contract snapshot on campaigns (Phase 2)
-- ---------------------------------------------------------------------
-- agent_name: human-readable snapshot only, never used for identity.
-- agent_contract_snapshot: immutable CallAgentContract captured at
-- campaign create/agent-selection time, so a later /agents response can
-- never silently rewrite what this campaign was configured against.
-- No agent_version column — agent_id is the sole immutable identity.
alter table call_center.campaigns
  add column if not exists agent_name text,
  add column if not exists agent_contract_snapshot jsonb;

-- ---------------------------------------------------------------------
-- 2. Input mapping model (Phase 4)
-- ---------------------------------------------------------------------
create table if not exists call_center.campaign_agent_input_mappings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_center.campaigns(id) on delete cascade,
  agent_input_field_code text not null,
  -- 'customer360' | 'csv' | 'campaign_field' — the three source classes
  -- this build supports (plan Phase 4). No generic CRM source.
  source_type text not null,
  source_field text not null,
  required boolean not null default false,
  data_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_agent_input_mappings_unique unique (campaign_id, agent_input_field_code)
);

create index if not exists campaign_agent_input_mappings_campaign_id_idx
  on call_center.campaign_agent_input_mappings(campaign_id);

alter table call_center.campaign_agent_input_mappings enable row level security;

-- ---------------------------------------------------------------------
-- 3. Execution-level request snapshot (Phase 3/5) — the deterministic
-- Trigger Call payload actually sent for one execution, so a later
-- Customer 360 edit can never silently change what a historical
-- execution appears to have used.
-- ---------------------------------------------------------------------
alter table call_center.campaign_executions
  add column if not exists request_payload_snapshot jsonb;

-- ---------------------------------------------------------------------
-- 4. Historical result traceability (Phase 7) — populated only when
-- supplied; never fabricated for existing/old rows (all nullable,
-- additive).
-- ---------------------------------------------------------------------
alter table call_center.campaign_results
  add column if not exists agent_id text,
  add column if not exists agent_name text,
  add column if not exists structured_outputs jsonb;

-- ---------------------------------------------------------------------
-- 5. call_center_campaign_create — now also accepts the agent contract
-- snapshot and an optional initial input-mapping set. Existing callers
-- that omit the new trailing params get NULL/empty, identical to
-- pre-migration behavior.
-- ---------------------------------------------------------------------
create or replace function public.call_center_campaign_create(
  p_name text, p_description text, p_agent_id text, p_created_by text,
  p_source_meta jsonb, p_now timestamptz, p_rules jsonb,
  p_agent_name text default null,
  p_agent_contract_snapshot jsonb default null,
  p_mappings jsonb default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_rule jsonb;
  v_mapping jsonb;
begin
  insert into call_center.campaigns (
    name, description, agent_id, status, created_by, source_meta, created_at, updated_at,
    agent_name, agent_contract_snapshot
  ) values (
    p_name, p_description, p_agent_id, 'draft', p_created_by, p_source_meta, p_now, p_now,
    p_agent_name, p_agent_contract_snapshot
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

-- ---------------------------------------------------------------------
-- 6. call_center_campaign_get — now also returns the campaign's input
-- mappings alongside its existing rules/stats.
-- ---------------------------------------------------------------------
create or replace function public.call_center_campaign_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_campaign jsonb; v_rules jsonb; v_stats jsonb; v_mappings jsonb;
begin
  select to_jsonb(c) into v_campaign from call_center.campaigns c where c.id = p_id;
  if v_campaign is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority), '[]'::jsonb) into v_rules
    from call_center.campaign_result_rules r where r.campaign_id = p_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.agent_input_field_code), '[]'::jsonb) into v_mappings
    from call_center.campaign_agent_input_mappings m where m.campaign_id = p_id;

  select jsonb_build_object(
    'targetCount', count(distinct t.id),
    'triggeredCount', count(distinct e.id) filter (where e.status = 'triggered'),
    'classifiedCount', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success is not null),
    'successCount', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success = true)
  ) into v_stats
  from call_center.campaign_targets t
  left join call_center.campaign_executions e on e.campaign_target_id = t.id
  left join call_center.campaign_results res on res.id = t.effective_result_id
  where t.campaign_id = p_id;

  return v_campaign || jsonb_build_object('rules', v_rules, 'mappings', v_mappings, 'stats', v_stats);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. call_center_campaign_set_input_mappings — replaces the full mapping
-- set for a campaign (same replace-not-patch convention as how rules are
-- authored at create time). Not restricted to draft-only here; the
-- frontend gates editing to before Start.
-- ---------------------------------------------------------------------
create or replace function public.call_center_campaign_set_input_mappings(
  p_campaign_id uuid, p_mappings jsonb
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_mapping jsonb; v_result jsonb;
begin
  delete from call_center.campaign_agent_input_mappings where campaign_id = p_campaign_id;

  if p_mappings is not null then
    for v_mapping in select * from jsonb_array_elements(p_mappings) loop
      insert into call_center.campaign_agent_input_mappings (
        campaign_id, agent_input_field_code, source_type, source_field, required, data_type
      ) values (
        p_campaign_id,
        v_mapping->>'agentInputFieldCode',
        v_mapping->>'sourceType',
        v_mapping->>'sourceField',
        coalesce((v_mapping->>'required')::boolean, false),
        v_mapping->>'dataType'
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.agent_input_field_code), '[]'::jsonb) into v_result
    from call_center.campaign_agent_input_mappings m where m.campaign_id = p_campaign_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. call_center_campaign_create_execution — now also accepts and stores
-- the deterministic request payload snapshot the runner is about to
-- send. Optional/nullable; existing single-arg-shaped callers still work
-- since this is a trailing default parameter.
-- ---------------------------------------------------------------------
create or replace function public.call_center_campaign_create_execution(
  p_target_id uuid, p_now timestamptz, p_request_payload_snapshot jsonb default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_seq int; v_execution call_center.campaign_executions;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
    from call_center.campaign_executions where campaign_target_id = p_target_id;

  insert into call_center.campaign_executions (campaign_target_id, sequence, status, created_at, request_payload_snapshot)
    values (p_target_id, v_seq, 'triggering', p_now, p_request_payload_snapshot)
    returning * into v_execution;

  update call_center.campaign_targets set
    status = 'in_progress', attempt_count = attempt_count + 1, last_action_at = p_now, updated_at = p_now
    where id = p_target_id;

  return to_jsonb(v_execution);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. call_center_campaign_update_reconciliation_status — p_result may
-- now also carry agentId/agentName/structuredOutputs (all optional,
-- persisted only when present — never fabricated for a null value).
-- ---------------------------------------------------------------------
create or replace function public.call_center_campaign_update_reconciliation_status(
  p_execution_id uuid, p_status text, p_reconciled_interaction_id text,
  p_candidate jsonb, p_now timestamptz, p_result jsonb
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
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
      result_recorded_at, next_action, agent_id, agent_name, structured_outputs
    ) values (
      p_execution_id, v_target_id,
      p_result->>'callStatus', p_result->>'callOutcome', p_result->>'intent',
      p_result->>'resultCode', p_result->>'resultLabel', (p_result->>'isSuccess')::boolean,
      p_result->'resultDetail', coalesce(p_result->>'resultSource', 'rule_match'),
      p_now, p_result->>'nextAction',
      p_result->>'agentId', p_result->>'agentName', p_result->'structuredOutputs'
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

-- ---------------------------------------------------------------------
-- Re-grant: the do-block below re-applies service_role-only execute to
-- every call_center_campaign_* function by name pattern, covering the
-- two brand-new functions added above (create_or_replace on existing
-- functions keeps their prior grants).
-- ---------------------------------------------------------------------
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
