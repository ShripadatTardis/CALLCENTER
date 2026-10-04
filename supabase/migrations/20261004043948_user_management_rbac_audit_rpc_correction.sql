-- Session 14.1 correction — RPC functions must live in `public` (PostgREST's
-- exposed-schema allow-list does not include `call_center`, exactly as
-- documented on every existing call_center repository, e.g.
-- src/server/customer360/supabaseCustomerRepository.ts's header comment)
-- and follow the established public.call_center_<domain>_<verb> naming.
-- The first pass of this migration incorrectly defined them inside the
-- call_center schema itself, unreachable via `.rpc()`. Drop those and
-- recreate correctly, plus add the additional list/detail RPCs the
-- User/Role Management and Audit Trail UIs need (none of which can use
-- `.from('call_center.*')` directly for the same reason).
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

drop function if exists call_center.record_audit_event(text, uuid, text, text, text, text, text, jsonb, text, text);
drop function if exists call_center.get_user_by_identity(text, text);
drop function if exists call_center.get_user_roles(uuid);
drop function if exists call_center.get_effective_permissions(uuid);
drop function if exists call_center.assign_role(uuid, text, uuid);
drop function if exists call_center.remove_role(uuid, text, uuid);
drop function if exists call_center.set_user_status(uuid, text, uuid);

create or replace function public.call_center_audit_record(
  p_actor_type text, p_actor_user_id uuid, p_actor_label text, p_action text,
  p_resource_type text, p_resource_id text, p_result text, p_metadata jsonb,
  p_request_id text, p_source text
) returns uuid language sql security definer set search_path = call_center, pg_temp as $$
  insert into call_center.audit_events (
    actor_type, actor_user_id, actor_label, action, resource_type, resource_id, result, metadata, request_id, source
  ) values (
    p_actor_type, p_actor_user_id, p_actor_label, p_action, p_resource_type, p_resource_id, p_result, p_metadata, p_request_id, p_source
  )
  returning id;
$$;

-- One round trip for requirePermission: resolves identity_subject -> the
-- full {id, email, display_name, status, roles, permissions} shape, or
-- null if no profile exists for this identity.
create or replace function public.call_center_users_resolve_identity(p_provider text, p_subject text)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_profile call_center.user_profiles; v_roles jsonb; v_permissions jsonb;
begin
  select * into v_profile from call_center.user_profiles
    where identity_provider = p_provider and identity_subject = p_subject limit 1;
  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(ur.role_code), '[]'::jsonb) into v_roles
    from call_center.user_roles ur where ur.user_id = v_profile.id;

  select coalesce(jsonb_agg(distinct rp.permission_key), '[]'::jsonb) into v_permissions
    from call_center.user_roles ur
    join call_center.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = v_profile.id;

  return jsonb_build_object(
    'id', v_profile.id, 'email', v_profile.email, 'displayName', v_profile.display_name,
    'status', v_profile.status, 'roles', v_roles, 'permissions', v_permissions
  );
end;
$$;

create or replace function public.call_center_users_list()
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_data order by (row_data->>'createdAt')), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', p.id, 'email', p.email, 'displayName', p.display_name, 'status', p.status,
      'createdAt', p.created_at,
      'roles', (select coalesce(jsonb_agg(ur.role_code), '[]'::jsonb) from call_center.user_roles ur where ur.user_id = p.id)
    ) as row_data
    from call_center.user_profiles p
  ) t;
  return v_rows;
end;
$$;

create or replace function public.call_center_users_get_detail(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_profile call_center.user_profiles; v_roles jsonb; v_permissions jsonb; v_audit jsonb;
begin
  select * into v_profile from call_center.user_profiles where id = p_user_id;
  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(ur.role_code), '[]'::jsonb) into v_roles
    from call_center.user_roles ur where ur.user_id = p_user_id;

  select coalesce(jsonb_agg(distinct rp.permission_key), '[]'::jsonb) into v_permissions
    from call_center.user_roles ur
    join call_center.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at desc), '[]'::jsonb) into v_audit
  from (
    select id, occurred_at, actor_type, actor_user_id, action, resource_type, resource_id, result
    from call_center.audit_events
    where actor_user_id = p_user_id or (resource_type = 'user' and resource_id = p_user_id::text)
    order by occurred_at desc
    limit 20
  ) a;

  return jsonb_build_object(
    'id', v_profile.id, 'email', v_profile.email, 'displayName', v_profile.display_name,
    'status', v_profile.status, 'createdAt', v_profile.created_at,
    'roles', v_roles, 'permissions', v_permissions, 'recentAuditEvents', v_audit
  );
end;
$$;

create or replace function public.call_center_users_set_status(p_user_id uuid, p_status text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_profile call_center.user_profiles;
begin
  update call_center.user_profiles set status = p_status, updated_at = now() where id = p_user_id returning * into v_profile;
  perform call_center.audit_events_insert_helper('user', p_actor_user_id, 'user.status_changed', 'user', p_user_id::text, 'success', jsonb_build_object('status', p_status));
  return to_jsonb(v_profile);
end;
$$;

create or replace function public.call_center_users_assign_role(p_user_id uuid, p_role_code text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
begin
  insert into call_center.user_roles (user_id, role_code, assigned_by)
  values (p_user_id, p_role_code, p_actor_user_id)
  on conflict (user_id, role_code) do nothing;
  perform call_center.audit_events_insert_helper('user', p_actor_user_id, 'role.assigned', 'user', p_user_id::text, 'success', jsonb_build_object('role_code', p_role_code));
  return public.call_center_users_get_detail(p_user_id);
end;
$$;

create or replace function public.call_center_users_remove_role(p_user_id uuid, p_role_code text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
begin
  delete from call_center.user_roles where user_id = p_user_id and role_code = p_role_code;
  perform call_center.audit_events_insert_helper('user', p_actor_user_id, 'role.removed', 'user', p_user_id::text, 'success', jsonb_build_object('role_code', p_role_code));
  return public.call_center_users_get_detail(p_user_id);
end;
$$;

create or replace function public.call_center_roles_list()
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'code', r.code, 'label', r.label, 'description', r.description,
      'permissionKeys', (select coalesce(jsonb_agg(rp.permission_key), '[]'::jsonb) from call_center.role_permissions rp where rp.role_code = r.code),
      'userCount', (select count(*) from call_center.user_roles ur where ur.role_code = r.code)
    ) as row_data
    from call_center.roles r
    order by r.code
  ) t;
  return v_rows;
end;
$$;

create or replace function public.call_center_permissions_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.pillar, p.key), '[]'::jsonb) from call_center.permissions p;
$$;

create or replace function public.call_center_roles_set_permissions(p_role_code text, p_permission_keys text[], p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
begin
  delete from call_center.role_permissions where role_code = p_role_code;
  insert into call_center.role_permissions (role_code, permission_key)
    select p_role_code, unnest(p_permission_keys)
    on conflict do nothing;
  perform call_center.audit_events_insert_helper('user', p_actor_user_id, 'role.permissions_changed', 'role', p_role_code, 'success', jsonb_build_object('permission_keys', to_jsonb(p_permission_keys)));
  return public.call_center_roles_list();
end;
$$;

create or replace function public.call_center_audit_list(
  p_limit int, p_actor_user_id uuid, p_action text, p_resource_type text, p_result text
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at desc), '[]'::jsonb) into v_rows
  from (
    select * from call_center.audit_events a
    where (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
      and (p_action is null or a.action = p_action)
      and (p_resource_type is null or a.resource_type = p_resource_type)
      and (p_result is null or a.result = p_result)
    order by a.occurred_at desc
    limit coalesce(p_limit, 100)
  ) a;
  return v_rows;
end;
$$;

-- Internal-only helper (not granted to service_role as a standalone RPC
-- entry point beyond what the functions above already call) so every
-- write path above shares one insert implementation.
create or replace function call_center.audit_events_insert_helper(
  p_actor_type text, p_actor_user_id uuid, p_action text, p_resource_type text,
  p_resource_id text, p_result text, p_metadata jsonb
) returns void language sql security definer set search_path = call_center, pg_temp as $$
  insert into call_center.audit_events (actor_type, actor_user_id, action, resource_type, resource_id, result, metadata)
  values (p_actor_type, p_actor_user_id, p_action, p_resource_type, p_resource_id, p_result, p_metadata);
$$;

revoke all on function public.call_center_audit_record(text, uuid, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.call_center_users_resolve_identity(text, text) from public, anon, authenticated;
revoke all on function public.call_center_users_list() from public, anon, authenticated;
revoke all on function public.call_center_users_get_detail(uuid) from public, anon, authenticated;
revoke all on function public.call_center_users_set_status(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.call_center_users_assign_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.call_center_users_remove_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.call_center_roles_list() from public, anon, authenticated;
revoke all on function public.call_center_permissions_list() from public, anon, authenticated;
revoke all on function public.call_center_roles_set_permissions(text, text[], uuid) from public, anon, authenticated;
revoke all on function public.call_center_audit_list(int, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.call_center_audit_record(text, uuid, text, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.call_center_users_resolve_identity(text, text) to service_role;
grant execute on function public.call_center_users_list() to service_role;
grant execute on function public.call_center_users_get_detail(uuid) to service_role;
grant execute on function public.call_center_users_set_status(uuid, text, uuid) to service_role;
grant execute on function public.call_center_users_assign_role(uuid, text, uuid) to service_role;
grant execute on function public.call_center_users_remove_role(uuid, text, uuid) to service_role;
grant execute on function public.call_center_roles_list() to service_role;
grant execute on function public.call_center_permissions_list() to service_role;
grant execute on function public.call_center_roles_set_permissions(text, text[], uuid) to service_role;
grant execute on function public.call_center_audit_list(int, uuid, text, text, text) to service_role;
