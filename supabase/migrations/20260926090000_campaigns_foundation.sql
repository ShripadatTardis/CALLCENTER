-- Session 5: Outbound Campaigns
-- docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md §6, §9, §14, §22
--
-- Extends the existing call_center schema (Session 4/4.5) with
-- purpose-built Campaign persistence. Same access model: call_center
-- stays un-exposed via PostgREST; the only access path is a set of
-- public.call_center_campaign_* SECURITY DEFINER functions, each
-- granted to service_role only.
--
-- Three genuinely separate concepts, never collapsed (plan §6/§8/§9):
-- execution status (campaign_executions.status) != reconciliation status
-- (campaign_executions.reconciliation_status) != business result
-- (campaign_results, which does not exist until reconciliation succeeds).

create table if not exists call_center.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  agent_id text not null,
  status text not null default 'draft',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_start_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  source_meta jsonb
);

create table if not exists call_center.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_center.campaigns(id) on delete cascade,
  customer_id uuid not null references call_center.customers(id),
  contact_point_id uuid not null references call_center.customer_contact_points(id),
  status text not null default 'pending',
  source_attributes jsonb not null default '{}'::jsonb,
  attempt_count int not null default 0,
  last_action_at timestamptz,
  next_action_at timestamptz,
  -- effective_result_id: the deterministically-current business result for
  -- this target (plan §9's "effective result vs. result history"
  -- amendment). FK added below via ALTER TABLE once campaign_results
  -- exists — circular with campaign_results.campaign_target_id.
  effective_result_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_targets_campaign_id_idx on call_center.campaign_targets(campaign_id);
create index if not exists campaign_targets_status_idx on call_center.campaign_targets(status);
create index if not exists campaign_targets_next_action_at_idx on call_center.campaign_targets(next_action_at);

create table if not exists call_center.campaign_executions (
  id uuid primary key default gen_random_uuid(),
  campaign_target_id uuid not null references call_center.campaign_targets(id) on delete cascade,
  sequence int not null,
  -- Trigger Call action's own lifecycle only (plan §8) — never conflated
  -- with reconciliation_status below.
  status text not null default 'queued',
  call_sid text,
  -- Distinct state machine from `status` (plan §8/§14): has this
  -- execution been AUTHORITATIVELY matched to a real call-data row yet?
  reconciliation_status text not null default 'pending',
  reconciled_interaction_id text,
  -- Diagnostic-only phone/time-window candidate (plan §14) — NEVER
  -- promoted to reconciled_interaction_id automatically.
  reconciliation_candidate jsonb,
  reconciled_at timestamptz,
  triggered_at timestamptz,
  error_detail text,
  created_at timestamptz not null default now(),
  constraint campaign_executions_target_sequence_unique unique (campaign_target_id, sequence)
);

create index if not exists campaign_executions_campaign_target_id_idx on call_center.campaign_executions(campaign_target_id);
create index if not exists campaign_executions_reconciliation_status_idx on call_center.campaign_executions(reconciliation_status);

create table if not exists call_center.campaign_result_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_center.campaigns(id) on delete cascade,
  priority int not null default 100,
  match_field text not null,
  match_value text not null,
  result_code text not null,
  result_label text not null,
  -- Explicit, separately-configured success classification (plan §10) —
  -- never inferred from result_code/result_label text.
  is_success boolean,
  next_action_type text,
  next_action_delay_days int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists campaign_result_rules_campaign_id_priority_idx on call_center.campaign_result_rules(campaign_id, priority);

create table if not exists call_center.campaign_results (
  id uuid primary key default gen_random_uuid(),
  campaign_execution_id uuid not null references call_center.campaign_executions(id),
  campaign_target_id uuid not null references call_center.campaign_targets(id),
  call_status text,
  call_outcome text,
  intent text,
  campaign_result_code text not null,
  campaign_result_label text not null,
  is_success boolean,
  result_detail jsonb,
  result_source text not null default 'rule_match',
  result_recorded_at timestamptz not null default now(),
  next_action text
);

create index if not exists campaign_results_campaign_target_id_recorded_at_idx on call_center.campaign_results(campaign_target_id, result_recorded_at desc);
create index if not exists campaign_results_campaign_execution_id_idx on call_center.campaign_results(campaign_execution_id);

-- Circular FK, added now that both tables exist (plan §6).
alter table call_center.campaign_targets
  add constraint campaign_targets_effective_result_id_fkey
  foreign key (effective_result_id) references call_center.campaign_results(id);

create table if not exists call_center.campaign_followups (
  id uuid primary key default gen_random_uuid(),
  campaign_target_id uuid not null references call_center.campaign_targets(id) on delete cascade,
  campaign_result_id uuid references call_center.campaign_results(id),
  follow_up_type text not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  next_campaign_id uuid references call_center.campaigns(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_followups_campaign_target_id_idx on call_center.campaign_followups(campaign_target_id);
create index if not exists campaign_followups_due_at_idx on call_center.campaign_followups(due_at);

alter table call_center.campaigns enable row level security;
alter table call_center.campaign_targets enable row level security;
alter table call_center.campaign_executions enable row level security;
alter table call_center.campaign_result_rules enable row level security;
alter table call_center.campaign_results enable row level security;
alter table call_center.campaign_followups enable row level security;

-- ---------------------------------------------------------------------
-- Access functions (public schema, SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------

create or replace function public.call_center_campaign_create(
  p_name text, p_description text, p_agent_id text, p_created_by text,
  p_source_meta jsonb, p_now timestamptz, p_rules jsonb
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_rule jsonb;
begin
  insert into call_center.campaigns (
    name, description, agent_id, status, created_by, source_meta, created_at, updated_at
  ) values (
    p_name, p_description, p_agent_id, 'draft', p_created_by, p_source_meta, p_now, p_now
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

  return to_jsonb(v_campaign);
end;
$$;

create or replace function public.call_center_campaign_list(p_page int, p_page_size int)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb;
begin
  select count(*) into v_total from call_center.campaigns;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows from (
    select
      c.*,
      coalesce(stats.target_count, 0) as target_count,
      coalesce(stats.triggered_count, 0) as triggered_count,
      coalesce(stats.classified_count, 0) as classified_count,
      coalesce(stats.success_count, 0) as success_count
    from call_center.campaigns c
    left join lateral (
      select
        count(distinct t.id) as target_count,
        count(distinct e.id) filter (where e.status = 'triggered') as triggered_count,
        count(distinct t.id) filter (where t.effective_result_id is not null and r.is_success is not null) as classified_count,
        count(distinct t.id) filter (where t.effective_result_id is not null and r.is_success = true) as success_count
      from call_center.campaign_targets t
      left join call_center.campaign_executions e on e.campaign_target_id = t.id
      left join call_center.campaign_results r on r.id = t.effective_result_id
      where t.campaign_id = c.id
    ) stats on true
    order by c.created_at desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

create or replace function public.call_center_campaign_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_campaign jsonb; v_rules jsonb; v_stats jsonb;
begin
  select to_jsonb(c) into v_campaign from call_center.campaigns c where c.id = p_id;
  if v_campaign is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority), '[]'::jsonb) into v_rules
    from call_center.campaign_result_rules r where r.campaign_id = p_id;

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

  return v_campaign || jsonb_build_object('rules', v_rules, 'stats', v_stats);
end;
$$;

create or replace function public.call_center_campaign_update_status(
  p_id uuid, p_status text, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_campaign call_center.campaigns;
begin
  update call_center.campaigns set
    status = p_status,
    updated_at = p_now,
    started_at = case when p_status = 'running' and started_at is null then p_now else started_at end,
    completed_at = case when p_status in ('completed', 'stopped', 'failed') then p_now else completed_at end
  where id = p_id
  returning * into v_campaign;
  return to_jsonb(v_campaign);
end;
$$;

-- Resolves Customer 360 identity server-side (plan §5) by reusing the
-- exact same customer/contact-point functions Customer 360 already
-- uses — never a duplicated resolve-or-create implementation.
create or replace function public.call_center_campaign_import_targets(
  p_campaign_id uuid, p_rows jsonb, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_row jsonb;
  v_contact jsonb;
  v_created jsonb;
  v_customer_id uuid;
  v_contact_point_id uuid;
  v_created_count int := 0;
  v_matched_count int := 0;
  v_skipped_count int := 0;
  v_normalized text;
  v_raw text;
  v_name text;
  v_attrs jsonb;
begin
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_raw := v_row->>'phone';
    if v_raw is null or length(trim(v_raw)) = 0 then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;
    v_normalized := regexp_replace(v_raw, '[^0-9+]', '', 'g');
    v_name := v_row->>'name';
    v_attrs := coalesce(v_row->'sourceAttributes', '{}'::jsonb);

    v_contact := public.call_center_find_contact_point('phone', v_normalized);
    if v_contact is not null then
      v_customer_id := (v_contact->>'customer_id')::uuid;
      v_contact_point_id := (v_contact->>'id')::uuid;
      perform public.call_center_touch_contact_point(v_contact_point_id, p_now);
      v_matched_count := v_matched_count + 1;
    else
      v_created := public.call_center_create_customer_with_contact_point('phone', v_raw, v_normalized, v_name, p_now);
      v_customer_id := (v_created->'customer'->>'id')::uuid;
      v_contact_point_id := (v_created->'contactPoint'->>'id')::uuid;
      v_created_count := v_created_count + 1;
    end if;

    insert into call_center.campaign_targets (
      campaign_id, customer_id, contact_point_id, status, source_attributes, created_at, updated_at
    ) values (
      p_campaign_id, v_customer_id, v_contact_point_id, 'pending', v_attrs, p_now, p_now
    );
  end loop;

  return jsonb_build_object(
    'customersCreated', v_created_count,
    'customersMatched', v_matched_count,
    'rowsSkipped', v_skipped_count
  );
end;
$$;

create or replace function public.call_center_campaign_list_targets(
  p_campaign_id uuid, p_page int, p_page_size int
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
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

-- Selects runnable targets across all `running` campaigns (plan §16):
-- fresh pending/ready targets, or follow_up_due targets whose
-- next_action_at has arrived.
create or replace function public.call_center_campaign_select_runnable_targets(p_batch_size int)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select tg.*, cp.raw_value as contact_raw_value, cu.source_customer_ref, c.agent_id as campaign_agent_id
      from call_center.campaign_targets tg
      join call_center.campaigns c on c.id = tg.campaign_id and c.status = 'running'
      join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
      join call_center.customers cu on cu.id = tg.customer_id
      where tg.status in ('pending', 'ready')
         or (tg.status = 'follow_up_due' and tg.next_action_at <= now())
      order by tg.created_at asc
      limit p_batch_size
  ) t;
$$;

create or replace function public.call_center_campaign_create_execution(
  p_target_id uuid, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_seq int; v_execution call_center.campaign_executions;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
    from call_center.campaign_executions where campaign_target_id = p_target_id;

  insert into call_center.campaign_executions (campaign_target_id, sequence, status, created_at)
    values (p_target_id, v_seq, 'triggering', p_now)
    returning * into v_execution;

  update call_center.campaign_targets set
    status = 'in_progress', attempt_count = attempt_count + 1, last_action_at = p_now, updated_at = p_now
    where id = p_target_id;

  return to_jsonb(v_execution);
end;
$$;

create or replace function public.call_center_campaign_mark_execution_triggered(
  p_execution_id uuid, p_call_sid text, p_now timestamptz
) returns void language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.campaign_executions set status = 'triggered', call_sid = p_call_sid, triggered_at = p_now
    where id = p_execution_id;
$$;

-- Also transitions the target to 'failed' (fixed post-deploy during
-- Session 5 live verification: the original version left the target
-- stuck at 'in_progress' after a failed Trigger Call, which made
-- retryTarget wrongly reject it as ineligible).
create or replace function public.call_center_campaign_mark_execution_failed(
  p_execution_id uuid, p_error_detail text
) returns void language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_target_id uuid;
begin
  update call_center.campaign_executions set status = 'failed', error_detail = p_error_detail
    where id = p_execution_id
    returning campaign_target_id into v_target_id;

  update call_center.campaign_targets set status = 'failed', updated_at = now() where id = v_target_id;
end;
$$;

create or replace function public.call_center_campaign_list_pending_reconciliations(p_limit int)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select e.*, tg.customer_id, tg.campaign_id, cp.raw_value as contact_raw_value
      from call_center.campaign_executions e
      join call_center.campaign_targets tg on tg.id = e.campaign_target_id
      join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
      where e.reconciliation_status = 'pending' and e.status = 'triggered'
      order by e.triggered_at asc nulls last
      limit p_limit
  ) t;
$$;

-- Atomically transitions an execution's reconciliation_status (plan
-- §9/§22). ONLY on a transition to 'reconciled' with a derived result
-- payload supplied does this insert the one corresponding
-- campaign_results row AND update the target's effective_result_id —
-- enforced here at the data-access layer, never left to convention.
-- p_result may be null for 'unresolved'/'error'/non-reconciled transitions.
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
      result_recorded_at, next_action
    ) values (
      p_execution_id, v_target_id,
      p_result->>'callStatus', p_result->>'callOutcome', p_result->>'intent',
      p_result->>'resultCode', p_result->>'resultLabel', (p_result->>'isSuccess')::boolean,
      p_result->'resultDetail', coalesce(p_result->>'resultSource', 'rule_match'),
      p_now, p_result->>'nextAction'
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

create or replace function public.call_center_campaign_create_followup(
  p_target_id uuid, p_result_id uuid, p_type text, p_due_at timestamptz, p_next_campaign_id uuid, p_notes text, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_followup call_center.campaign_followups;
begin
  insert into call_center.campaign_followups (
    campaign_target_id, campaign_result_id, follow_up_type, due_at, status, next_campaign_id, notes, created_at
  ) values (
    p_target_id, p_result_id, p_type, p_due_at, 'pending', p_next_campaign_id, p_notes, p_now
  ) returning * into v_followup;

  update call_center.campaign_targets set next_action_at = p_due_at, updated_at = p_now where id = p_target_id;

  return to_jsonb(v_followup);
end;
$$;

create or replace function public.call_center_campaign_retry_target(p_target_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_status text;
begin
  select status into v_status from call_center.campaign_targets where id = p_target_id;
  if v_status not in ('failed', 'follow_up_due') then
    raise exception 'Target % is not eligible for retry (status=%)', p_target_id, v_status;
  end if;
  update call_center.campaign_targets set status = 'ready', next_action_at = null, updated_at = p_now where id = p_target_id;
  return jsonb_build_object('targetId', p_target_id, 'status', 'ready');
end;
$$;

-- Lock down every new call_center_campaign_* function to service_role
-- only. Same mechanism as Customer 360/Chat's migrations; matches by
-- name pattern only, touches nothing else in AuditAI's public schema.
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
