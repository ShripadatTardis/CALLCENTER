-- Session 15 — Action Required Workflow.
--
-- The first persisted, assignable, auditable human-operational work-item
-- queue in this app, replacing Dashboard's purely client-side,
-- unpersisted "Needs Attention" computation. Builds on 14.1 (Functional
-- Permissions), 14.3 (Business Data Scope), and the existing Audit Trail
-- -- no second authorization mechanism.
--
-- v1 scope (deliberate, documented, not a technical shortcut):
--   - Source signal: escalated voice calls ONLY (`outcome = 'escalated'`).
--     Chat has no escalation concept today; stale-active calls remain a
--     Dashboard-only indicator (not promoted into a persisted work item --
--     an upstream "still active" condition may be data-quality noise, not
--     genuine unresolved work, per the brief's anti-flood instruction).
--   - Lifecycle: Open -> In Progress -> Resolved only (no Dismissed; a
--     missing escalation_trigger does not prove non-actionability, only
--     that the source withheld the reason -- a Dismiss escape hatch would
--     be speculative, not evidence-based. Additive follow-up if real
--     usage later proves otherwise).
--   - customer_id/campaign_id are nullable snapshot columns, genuinely
--     unpopulated in v1 (CallDataEntryDto has no reliable customer_id or
--     campaign_id, only a campaign_name string) -- kept for future use,
--     not fabricated. Only Agent Scope is enforced in v1's scope checks
--     as a result; the Customer Category Scope dimension has nothing to
--     filter on until a real call->customer link exists.
--
-- Ownership rule (user-approved refinement, not a role-name check):
--   `actions.assign` is "manage any eligible item" -- an actor holding it
--   may assign/reassign to anyone and progress/resolve any in-scope item
--   regardless of current assignee. An actor holding `actions.resolve`
--   but not `actions.assign` may take ownership of an UNASSIGNED item and
--   progress/resolve ONLY an item currently assigned to themselves. This
--   is enforced inside the RPCs below (p_actor_has_manage_any, computed
--   by the API layer from the caller's already-resolved permission set,
--   re-checked here rather than trusted blindly), never by role name.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

create table if not exists call_center.action_items (
  id uuid primary key default gen_random_uuid(),
  source_interaction_type text not null check (source_interaction_type in ('call')),
  source_interaction_id text not null,
  signal_type text not null check (signal_type in ('escalation')),
  customer_id uuid references call_center.customers(id) on delete set null,
  agent_id text,
  campaign_id uuid references call_center.campaigns(id) on delete set null,
  reason_code text not null check (reason_code in ('escalation_with_reason', 'escalation_reason_unavailable')),
  reason_text text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_user_id uuid references call_center.user_profiles(id) on delete set null,
  resolution_code text check (resolution_code in ('escalation_handled', 'customer_called_back', 'no_action_needed', 'other')),
  resolution_note text,
  resolved_by uuid references call_center.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_interaction_type, source_interaction_id, signal_type)
);

create index if not exists action_items_status_created_idx on call_center.action_items (status, created_at desc);
create index if not exists action_items_assigned_user_idx on call_center.action_items (assigned_user_id);

alter table call_center.action_items enable row level security;

-- ===== Permission vocabulary (additive to the 14.1 seed) =====
insert into call_center.permissions (key, label, description, pillar) values
  ('actions.view', 'View Action Required', 'View the Action Required work-item queue, within Business Data Scope.', 'Control'),
  ('actions.assign', 'Assign Action Required Items', 'Assign/reassign any in-scope Action Required item, regardless of current ownership.', 'Control'),
  ('actions.resolve', 'Resolve Action Required Items', 'Take ownership of unassigned items; progress/resolve items assigned to self.', 'Control')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions where key in ('actions.view', 'actions.assign', 'actions.resolve')
on conflict do nothing;

insert into call_center.role_permissions (role_code, permission_key) values
  ('supervisor', 'actions.view'), ('supervisor', 'actions.assign'), ('supervisor', 'actions.resolve'),
  ('operator', 'actions.view'), ('operator', 'actions.resolve')
on conflict do nothing;

-- ===== RPCs (public.call_center_action_items_*, mirroring 14.x convention) =====

-- source_interaction_id + signal_type is the idempotency key: a batch of
-- candidates fetched server-side from the Voice API (never called from
-- inside this function) is upserted with ON CONFLICT DO NOTHING, so
-- repeated generation runs over an overlapping window never duplicate a
-- row, and never reset an existing item's status/assignment/resolution.
-- One summary audit event per run, not one per item, to avoid audit-log
-- spam from a batch of mostly-unchanged rows.
create or replace function public.call_center_action_items_generate(
  p_candidates jsonb, p_actor_type text, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_created int := 0;
  v_skipped int := 0;
  v_candidate jsonb;
begin
  for v_candidate in select * from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    insert into call_center.action_items (
      source_interaction_type, source_interaction_id, signal_type,
      agent_id, customer_id, campaign_id, reason_code, reason_text
    ) values (
      'call', v_candidate->>'sourceInteractionId', 'escalation',
      v_candidate->>'agentId',
      case when coalesce(v_candidate->>'customerId', '') = '' then null else (v_candidate->>'customerId')::uuid end,
      case when coalesce(v_candidate->>'campaignId', '') = '' then null else (v_candidate->>'campaignId')::uuid end,
      case when coalesce(v_candidate->>'reasonText', '') = '' then 'escalation_reason_unavailable' else 'escalation_with_reason' end,
      case when coalesce(v_candidate->>'reasonText', '') = '' then null else v_candidate->>'reasonText' end
    )
    on conflict (source_interaction_type, source_interaction_id, signal_type) do nothing;

    if found then
      v_created := v_created + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  perform call_center.audit_events_insert_helper(
    coalesce(p_actor_type, 'system'), p_actor_user_id, 'action_item.generation_run', 'action_item', null, 'success',
    jsonb_build_object('created', v_created, 'skipped', v_skipped, 'candidates', jsonb_array_length(coalesce(p_candidates, '[]'::jsonb)))
  );

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

create or replace function public.call_center_action_items_to_json(p_item call_center.action_items)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'id', p_item.id,
    'sourceInteractionType', p_item.source_interaction_type,
    'sourceInteractionId', p_item.source_interaction_id,
    'signalType', p_item.signal_type,
    'customerId', p_item.customer_id,
    'agentId', p_item.agent_id,
    'campaignId', p_item.campaign_id,
    'reasonCode', p_item.reason_code,
    'reasonText', p_item.reason_text,
    'status', p_item.status,
    'assignedUserId', p_item.assigned_user_id,
    'assignedDisplayName', (select display_name from call_center.user_profiles where id = p_item.assigned_user_id),
    'assignedEmail', (select email from call_center.user_profiles where id = p_item.assigned_user_id),
    'resolutionCode', p_item.resolution_code,
    'resolutionNote', p_item.resolution_note,
    'resolvedBy', p_item.resolved_by,
    'resolvedAt', p_item.resolved_at,
    'createdAt', p_item.created_at,
    'updatedAt', p_item.updated_at
  );
$$;

-- Scope-filtered list. v1's only enforceable dimension is Agent Scope
-- (customer_id is unpopulated today -- see header note); an item with no
-- agent_id at all is visible to everyone since there is nothing to scope
-- it against.
create or replace function public.call_center_action_items_list(
  p_status text, p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_action_items_to_json(ai) order by ai.created_at desc), '[]'::jsonb)
  from call_center.action_items ai
  where (p_status is null or ai.status = p_status)
    and (p_all_agents or ai.agent_id is null or ai.agent_id = any(coalesce(p_authorized_agent_ids, array[]::text[])));
$$;

-- Single-item fetch with the SAME scope predicate as list, so the
-- direct-ID-bypass class of bug Session 14.3 had to retrofit is closed
-- here from day one.
create or replace function public.call_center_action_items_get(
  p_id uuid, p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_item call_center.action_items;
begin
  select * into v_item from call_center.action_items where id = p_id;
  if v_item is null then
    return null;
  end if;
  if not p_all_agents and v_item.agent_id is not null and not (v_item.agent_id = any(coalesce(p_authorized_agent_ids, array[]::text[]))) then
    return null;
  end if;
  return public.call_center_action_items_to_json(v_item);
end;
$$;

-- Eligible assignees: active users whose role-union Agent Scope covers
-- this item's agent_id (pure SQL join across user_roles -> role_agent_scope(_items),
-- the same tables Session 14.3 already created for read-scope filtering,
-- used here for the first time to gate a write/assignment decision).
create or replace function public.call_center_action_items_eligible_assignees(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_item call_center.action_items;
begin
  select * into v_item from call_center.action_items where id = p_id;
  if v_item is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'displayName', p.display_name) order by coalesce(p.display_name, p.email))
    from call_center.user_profiles p
    where p.status = 'active'
      and exists (
        select 1 from call_center.user_roles ur
        where ur.user_id = p.id
          and (
            v_item.agent_id is null
            or exists (select 1 from call_center.role_agent_scope ras where ras.role_code = ur.role_code and ras.all_agents)
            or exists (select 1 from call_center.role_agent_scope_items rasi where rasi.role_code = ur.role_code and rasi.agent_id = v_item.agent_id)
          )
      )
  ), '[]'::jsonb);
end;
$$;

-- Assign/reassign/take-ownership, with the ownership gate re-validated
-- here (never trusted from the caller) and assignee eligibility
-- re-validated against the SAME function the picker UI calls, inside the
-- same transaction as the update.
create or replace function public.call_center_action_items_assign(
  p_id uuid, p_assignee_user_id uuid, p_actor_user_id uuid, p_actor_has_manage_any boolean
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_item call_center.action_items;
  v_assignee call_center.user_profiles;
  v_eligible jsonb;
  v_previous_assignee uuid;
begin
  select * into v_item from call_center.action_items where id = p_id for update;
  if v_item is null then
    raise exception 'action_item_not_found';
  end if;

  if not p_actor_has_manage_any and not (p_assignee_user_id = p_actor_user_id and v_item.assigned_user_id is null) then
    raise exception 'assignment_not_permitted';
  end if;

  select * into v_assignee from call_center.user_profiles where id = p_assignee_user_id;
  if v_assignee is null or v_assignee.status <> 'active' then
    raise exception 'assignee_inactive_or_not_found';
  end if;

  select public.call_center_action_items_eligible_assignees(p_id) into v_eligible;
  if not exists (select 1 from jsonb_array_elements(v_eligible) e where (e->>'id')::uuid = p_assignee_user_id) then
    raise exception 'assignee_out_of_scope';
  end if;

  v_previous_assignee := v_item.assigned_user_id;
  update call_center.action_items set assigned_user_id = p_assignee_user_id, updated_at = now() where id = p_id;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id,
    case when v_previous_assignee is null then 'action_item.assigned' else 'action_item.reassigned' end,
    'action_item', p_id::text, 'success',
    jsonb_build_object('previousAssignee', v_previous_assignee, 'newAssignee', p_assignee_user_id)
  );

  return public.call_center_action_items_get(p_id, true, array[]::text[]);
end;
$$;

-- Open -> In Progress only (Resolved goes through the dedicated resolve
-- RPC below, which requires a resolution code/note). Ownership gate:
-- allowed when the actor holds actions.assign, OR the item is currently
-- assigned to the actor themselves.
create or replace function public.call_center_action_items_set_status(
  p_id uuid, p_status text, p_actor_user_id uuid, p_actor_has_manage_any boolean
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_item call_center.action_items;
begin
  if p_status not in ('open', 'in_progress') then
    raise exception 'invalid_status_transition';
  end if;

  select * into v_item from call_center.action_items where id = p_id for update;
  if v_item is null then
    raise exception 'action_item_not_found';
  end if;

  if not p_actor_has_manage_any and v_item.assigned_user_id is distinct from p_actor_user_id then
    raise exception 'ownership_required';
  end if;

  update call_center.action_items set status = p_status, updated_at = now() where id = p_id;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'action_item.status_changed', 'action_item', p_id::text, 'success',
    jsonb_build_object('from', v_item.status, 'to', p_status)
  );

  return public.call_center_action_items_get(p_id, true, array[]::text[]);
end;
$$;

-- Resolve: sets status='resolved' + resolved_by/resolved_at together
-- with the resolution note/code. Never touches any call/chat record --
-- there is nowhere in this schema a resolution could even accidentally
-- rewrite a source outcome.
create or replace function public.call_center_action_items_resolve(
  p_id uuid, p_resolution_code text, p_resolution_note text, p_actor_user_id uuid, p_actor_has_manage_any boolean
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_item call_center.action_items;
begin
  select * into v_item from call_center.action_items where id = p_id for update;
  if v_item is null then
    raise exception 'action_item_not_found';
  end if;

  if not p_actor_has_manage_any and v_item.assigned_user_id is distinct from p_actor_user_id then
    raise exception 'ownership_required';
  end if;

  update call_center.action_items set
    status = 'resolved',
    resolution_code = p_resolution_code,
    resolution_note = p_resolution_note,
    resolved_by = p_actor_user_id,
    resolved_at = now(),
    updated_at = now()
  where id = p_id;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'action_item.resolved', 'action_item', p_id::text, 'success',
    jsonb_build_object('resolutionCode', p_resolution_code)
  );

  return public.call_center_action_items_get(p_id, true, array[]::text[]);
end;
$$;

revoke all on function public.call_center_action_items_generate(jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.call_center_action_items_to_json(call_center.action_items) from public, anon, authenticated;
revoke all on function public.call_center_action_items_list(text, boolean, text[]) from public, anon, authenticated;
revoke all on function public.call_center_action_items_get(uuid, boolean, text[]) from public, anon, authenticated;
revoke all on function public.call_center_action_items_eligible_assignees(uuid) from public, anon, authenticated;
revoke all on function public.call_center_action_items_assign(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.call_center_action_items_set_status(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.call_center_action_items_resolve(uuid, text, text, uuid, boolean) from public, anon, authenticated;

grant execute on function public.call_center_action_items_generate(jsonb, text, uuid) to service_role;
grant execute on function public.call_center_action_items_to_json(call_center.action_items) to service_role;
grant execute on function public.call_center_action_items_list(text, boolean, text[]) to service_role;
grant execute on function public.call_center_action_items_get(uuid, boolean, text[]) to service_role;
grant execute on function public.call_center_action_items_eligible_assignees(uuid) to service_role;
grant execute on function public.call_center_action_items_assign(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.call_center_action_items_set_status(uuid, text, uuid, boolean) to service_role;
grant execute on function public.call_center_action_items_resolve(uuid, text, text, uuid, boolean) to service_role;
