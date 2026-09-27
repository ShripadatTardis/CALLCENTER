-- Session 11.5A — Customer 360 Operational Foundation
-- docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md
--
-- Three additions, all within the existing call_center schema / access
-- model (public.call_center_* SECURITY DEFINER functions, service_role
-- only — same convention as every prior migration):
--
-- 1. customer_activities — new generic Note/Instruction/Task/Reminder/
--    Appointment capability (design doc §6/§9.1). assigned_user_id/
--    assigned_team_id/created_by/updated_by are plain `text`, NOT a
--    foreign key — this app has no users/teams table (confirmed: no
--    `create table ... users` anywhere in call_center), the same
--    client-claimed-string honesty class already used by
--    campaigns.created_by (Session 5). Flagged explicitly in the
--    session report as a blocker for real assignment-based
--    authorization, not silently upgraded to a fake FK.
--
-- 2. call_center_campaign_list_customer_targets — customer-scoped
--    campaign query (design doc §4.2/§9/§12) needed for Customer
--    Detail's future Campaign Participation section. Mirrors
--    call_center_campaign_list_targets exactly, filtered by
--    customer_id instead of campaign_id, with campaign name/agent_id
--    joined in so the caller can apply the SAME campaign.agent_id ->
--    authorizedAgentIds authorization check already established for
--    retryTarget/scheduleFollowup (20261003000000_campaigns_
--    authorization_support.sql's own stated precedent: "campaign.agent_id
--    plays the same role agent_id already plays for calls/chats").
--
-- 3. call_center_campaign_insert_resolved_target — a single-target
--    insert primitive, used by the corrected CSV import path (§11):
--    TypeScript now resolves each CSV row's identity via the SAME
--    identityResolver.ts used by Voice/Chat (CIF -> phone -> create),
--    then calls this function once per row to create the
--    campaign_target against the resolved customer_id/contact_point_id.
--    The old call_center_campaign_import_targets bulk function (phone-
--    only SQL-side resolution) is left in place, unused by the
--    corrected TypeScript path, rather than dropped — removing a
--    function other environments/tests might still reference is out of
--    scope for this session; see the session report for the exact
--    call-site change.

-- ---------------------------------------------------------------------
-- 1. customer_activities
-- ---------------------------------------------------------------------

create table if not exists call_center.customer_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references call_center.customers(id) on delete cascade,
  activity_type text not null check (activity_type in ('note', 'instruction', 'task', 'reminder', 'appointment')),
  title text,
  body text not null,
  -- Notes/Instructions default 'active' (their natural resting state per
  -- design doc §6); Task/Reminder/Appointment default 'open' (they have
  -- a genuine open->completed/cancelled lifecycle). 'inactive' exists
  -- only for Instructions being turned off without deleting history.
  status text not null default 'open' check (status in ('active', 'open', 'completed', 'cancelled', 'inactive')),
  priority text,
  scheduled_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_user_id text,
  assigned_team_id text,
  campaign_id uuid references call_center.campaigns(id) on delete set null,
  campaign_target_id uuid references call_center.campaign_targets(id) on delete set null,
  interaction_id uuid references call_center.customer_interactions(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  effective_from timestamptz,
  effective_until timestamptz
);

create index if not exists customer_activities_customer_id_idx on call_center.customer_activities(customer_id);
create index if not exists customer_activities_type_status_idx on call_center.customer_activities(activity_type, status);
create index if not exists customer_activities_due_at_idx on call_center.customer_activities(due_at) where due_at is not null;
create index if not exists customer_activities_scheduled_at_idx on call_center.customer_activities(scheduled_at) where scheduled_at is not null;

create or replace function public.call_center_activity_create(
  p_customer_id uuid, p_activity_type text, p_title text, p_body text,
  p_priority text, p_scheduled_at timestamptz, p_due_at timestamptz,
  p_assigned_user_id text, p_assigned_team_id text,
  p_campaign_id uuid, p_campaign_target_id uuid, p_interaction_id uuid,
  p_created_by text, p_effective_from timestamptz, p_effective_until timestamptz,
  p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_row call_center.customer_activities;
begin
  insert into call_center.customer_activities (
    customer_id, activity_type, title, body, status, priority,
    scheduled_at, due_at, assigned_user_id, assigned_team_id,
    campaign_id, campaign_target_id, interaction_id,
    created_by, created_at, updated_by, updated_at, effective_from, effective_until
  ) values (
    p_customer_id, p_activity_type, p_title, p_body,
    case when p_activity_type in ('note', 'instruction') then 'active' else 'open' end,
    p_priority, p_scheduled_at, p_due_at, p_assigned_user_id, p_assigned_team_id,
    p_campaign_id, p_campaign_target_id, p_interaction_id,
    p_created_by, p_now, p_created_by, p_now, p_effective_from, p_effective_until
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- p_active_instructions_only=true narrows to exactly the "Active
-- Instructions" surface the design doc's Customer Detail wireframe and
-- future Initiate Call both need (§4.2/§7.2) — instruction type, active
-- status only. Otherwise returns the full chronological activity feed.
create or replace function public.call_center_activity_list_for_customer(
  p_customer_id uuid, p_active_instructions_only boolean default false
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
    from call_center.customer_activities a
    where a.customer_id = p_customer_id
      and (not p_active_instructions_only or (a.activity_type = 'instruction' and a.status = 'active'));
$$;

create or replace function public.call_center_activity_update_status(
  p_activity_id uuid, p_status text, p_updated_by text, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_row call_center.customer_activities;
begin
  update call_center.customer_activities set
    status = p_status,
    completed_at = case when p_status = 'completed' then p_now else completed_at end,
    updated_by = p_updated_by,
    updated_at = p_now
    where id = p_activity_id
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Activity % not found', p_activity_id;
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. call_center_campaign_list_customer_targets
-- ---------------------------------------------------------------------

create or replace function public.call_center_campaign_list_customer_targets(p_customer_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
    select
      tg.*,
      c.name as campaign_name,
      c.agent_id as campaign_agent_id,
      c.agent_name as campaign_agent_name,
      cp.raw_value as contact_raw_value,
      cu.display_name as customer_display_name,
      res.campaign_result_code, res.campaign_result_label, res.is_success as result_is_success,
      res.next_action as result_next_action,
      le.status as latest_execution_status, le.reconciliation_status as latest_reconciliation_status,
      le.reconciled_interaction_id as latest_reconciled_interaction_id
    from call_center.campaign_targets tg
    join call_center.campaigns c on c.id = tg.campaign_id
    join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
    join call_center.customers cu on cu.id = tg.customer_id
    left join call_center.campaign_results res on res.id = tg.effective_result_id
    left join lateral (
      select e.* from call_center.campaign_executions e
        where e.campaign_target_id = tg.id order by e.sequence desc limit 1
    ) le on true
    where tg.customer_id = p_customer_id
  ) t;
$$;

-- ---------------------------------------------------------------------
-- 3. call_center_campaign_insert_resolved_target — single-row insert,
-- identity already resolved by the caller (identityResolver.ts).
-- ---------------------------------------------------------------------

create or replace function public.call_center_campaign_insert_resolved_target(
  p_campaign_id uuid, p_customer_id uuid, p_contact_point_id uuid,
  p_source_attributes jsonb, p_now timestamptz
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  insert into call_center.campaign_targets as ct (
    campaign_id, customer_id, contact_point_id, status, source_attributes, created_at, updated_at
  ) values (
    p_campaign_id, p_customer_id, p_contact_point_id, 'pending', coalesce(p_source_attributes, '{}'::jsonb), p_now, p_now
  )
  returning to_jsonb(ct.*);
$$;

-- ---------------------------------------------------------------------
-- Lock down every new function the same way as every prior migration.
-- Matches by name pattern only ('call_center_%'), so it also correctly
-- re-applies to every pre-existing call_center_* function — idempotent,
-- touches nothing outside this exact name pattern.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
