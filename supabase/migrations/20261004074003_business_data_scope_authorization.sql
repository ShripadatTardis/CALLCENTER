-- Session 14.3 — Business Data Scope Authorization.
--
-- Call Centre authorization = Functional Permission (WHAT, Session 14.1)
-- + Business Data Scope (WHICH data, this session). Two independent,
-- role-level dimensions:
--   Customer Category Scope -- which customer360_categories a role may see
--   Agent Scope             -- which stable Agent IDs a role may operate on
-- Agent scope is never derived FROM category scope (two separate tables,
-- two separate admin controls) even though today's data happens to be
-- 1:1 category<->agent. Customer visibility still has to resolve category
-- selections down to agent_ids via the EXISTING customer360_category_agents
-- join (the only linkage customers/interactions have to a category) --
-- that's a computation, not "deriving Agent Scope from category."
--
-- No user-level overrides in this session (role-level only, union across
-- a user's assigned roles — same pattern Session 14.1 used for
-- permissions; all_categories/all_agents on any assigned role wins).
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

create table if not exists call_center.role_customer_category_scope (
  role_code text primary key references call_center.roles(code) on delete cascade,
  all_categories boolean not null default false
);

create table if not exists call_center.role_customer_category_scope_items (
  role_code text not null references call_center.roles(code) on delete cascade,
  category_id uuid not null references call_center.customer360_categories(id) on delete cascade,
  primary key (role_code, category_id)
);

create table if not exists call_center.role_agent_scope (
  role_code text primary key references call_center.roles(code) on delete cascade,
  all_agents boolean not null default false
);

create table if not exists call_center.role_agent_scope_items (
  role_code text not null references call_center.roles(code) on delete cascade,
  agent_id text not null,
  primary key (role_code, agent_id)
);

alter table call_center.role_customer_category_scope enable row level security;
alter table call_center.role_customer_category_scope_items enable row level security;
alter table call_center.role_agent_scope enable row level security;
alter table call_center.role_agent_scope_items enable row level security;

-- Migration default: every existing role gets all_categories=true /
-- all_agents=true. This is NOT a permanent policy decision — it is the
-- only safe, non-breaking starting point (it matches the sole real
-- precedent that ever existed: administrator/call_center_head both had
-- all_categories=true; nothing else was ever configured, confirmed via
-- live inspection before this migration). The Administrator deliberately
-- narrows any role afterward via the new Role Management "Data Scope" UI.
-- A role with no explicit row here (any future role created without
-- configuration) fails closed to zero scope — see
-- call_center_resolve_data_scope below.
insert into call_center.role_customer_category_scope (role_code, all_categories)
select code, true from call_center.roles
on conflict (role_code) do nothing;

insert into call_center.role_agent_scope (role_code, all_agents)
select code, true from call_center.roles
on conflict (role_code) do nothing;

-- ===== Resolution: extends the existing identity-resolution RPC so one
-- call (already made per request by api/_auth.ts) returns BOTH effective
-- permissions (14.1) and effective data scope (14.3) — no extra round trip. =====
create or replace function public.call_center_users_resolve_identity(p_provider text, p_subject text)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_profile call_center.user_profiles;
  v_roles jsonb;
  v_permissions jsonb;
  v_all_agents boolean;
  v_agent_ids jsonb;
  v_all_categories boolean;
  v_category_ids jsonb;
  v_customer_all_agents boolean;
  v_customer_agent_ids jsonb;
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

  -- Agent Scope: union across assigned roles.
  select coalesce(bool_or(ras.all_agents), false) into v_all_agents
    from call_center.user_roles ur
    join call_center.role_agent_scope ras on ras.role_code = ur.role_code
    where ur.user_id = v_profile.id;

  select coalesce(jsonb_agg(distinct rasi.agent_id), '[]'::jsonb) into v_agent_ids
    from call_center.user_roles ur
    join call_center.role_agent_scope_items rasi on rasi.role_code = ur.role_code
    where ur.user_id = v_profile.id;

  -- Customer Category Scope: union across assigned roles.
  select coalesce(bool_or(rccs.all_categories), false) into v_all_categories
    from call_center.user_roles ur
    join call_center.role_customer_category_scope rccs on rccs.role_code = ur.role_code
    where ur.user_id = v_profile.id;

  select coalesce(jsonb_agg(distinct rccsi.category_id), '[]'::jsonb) into v_category_ids
    from call_center.user_roles ur
    join call_center.role_customer_category_scope_items rccsi on rccsi.role_code = ur.role_code
    where ur.user_id = v_profile.id;

  -- Customer visibility resolved down to an effective agent_id set via
  -- the existing category->agent linkage (customer360_category_agents) --
  -- a computation for "which customers are visible", not a redefinition
  -- of Agent Scope itself.
  v_customer_all_agents := v_all_categories;
  if v_all_categories then
    v_customer_agent_ids := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(distinct cca.agent_id), '[]'::jsonb) into v_customer_agent_ids
    from call_center.user_roles ur
    join call_center.role_customer_category_scope_items rccsi on rccsi.role_code = ur.role_code
    join call_center.customer360_category_agents cca on cca.category_id = rccsi.category_id
    where ur.user_id = v_profile.id;
  end if;

  return jsonb_build_object(
    'id', v_profile.id, 'email', v_profile.email, 'displayName', v_profile.display_name,
    'status', v_profile.status, 'roles', v_roles, 'permissions', v_permissions,
    'dataScope', jsonb_build_object(
      'allAgents', v_all_agents, 'agentIds', v_agent_ids,
      'allCustomerCategories', v_all_categories, 'customerCategoryIds', v_category_ids,
      'customerAllAgents', v_customer_all_agents, 'customerAgentIds', v_customer_agent_ids
    )
  );
end;
$$;

-- ===== Role Management: read/write RPCs for the new Data Scope UI =====

create or replace function public.call_center_customer_categories_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from call_center.customer360_categories where active;
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
      'userCount', (select count(*) from call_center.user_roles ur where ur.role_code = r.code),
      'allAgents', coalesce((select ras.all_agents from call_center.role_agent_scope ras where ras.role_code = r.code), false),
      'agentIds', (select coalesce(jsonb_agg(rasi.agent_id), '[]'::jsonb) from call_center.role_agent_scope_items rasi where rasi.role_code = r.code),
      'allCategories', coalesce((select rccs.all_categories from call_center.role_customer_category_scope rccs where rccs.role_code = r.code), false),
      'categoryIds', (select coalesce(jsonb_agg(rccsi.category_id), '[]'::jsonb) from call_center.role_customer_category_scope_items rccsi where rccsi.role_code = r.code)
    ) as row_data
    from call_center.roles r
    order by r.code
  ) t;
  return v_rows;
end;
$$;

create or replace function public.call_center_roles_set_agent_scope(
  p_role_code text, p_all_agents boolean, p_agent_ids text[], p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_before jsonb;
begin
  select jsonb_build_object('allAgents', coalesce(ras.all_agents, false), 'agentIds', (select coalesce(jsonb_agg(rasi.agent_id), '[]'::jsonb) from call_center.role_agent_scope_items rasi where rasi.role_code = p_role_code))
    into v_before from call_center.role_agent_scope ras where ras.role_code = p_role_code;

  insert into call_center.role_agent_scope (role_code, all_agents) values (p_role_code, p_all_agents)
    on conflict (role_code) do update set all_agents = excluded.all_agents;

  delete from call_center.role_agent_scope_items where role_code = p_role_code;
  if not p_all_agents then
    insert into call_center.role_agent_scope_items (role_code, agent_id)
      select p_role_code, unnest(p_agent_ids) on conflict do nothing;
  end if;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'role.agent_scope_changed', 'role', p_role_code, 'success',
    jsonb_build_object('before', coalesce(v_before, '{}'::jsonb), 'after', jsonb_build_object('allAgents', p_all_agents, 'agentIds', to_jsonb(p_agent_ids)))
  );

  return public.call_center_roles_list();
end;
$$;

create or replace function public.call_center_roles_set_customer_category_scope(
  p_role_code text, p_all_categories boolean, p_category_ids uuid[], p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_before jsonb;
begin
  select jsonb_build_object('allCategories', coalesce(rccs.all_categories, false), 'categoryIds', (select coalesce(jsonb_agg(rccsi.category_id), '[]'::jsonb) from call_center.role_customer_category_scope_items rccsi where rccsi.role_code = p_role_code))
    into v_before from call_center.role_customer_category_scope rccs where rccs.role_code = p_role_code;

  insert into call_center.role_customer_category_scope (role_code, all_categories) values (p_role_code, p_all_categories)
    on conflict (role_code) do update set all_categories = excluded.all_categories;

  delete from call_center.role_customer_category_scope_items where role_code = p_role_code;
  if not p_all_categories then
    insert into call_center.role_customer_category_scope_items (role_code, category_id)
      select p_role_code, unnest(p_category_ids) on conflict do nothing;
  end if;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'role.customer_category_scope_changed', 'role', p_role_code, 'success',
    jsonb_build_object('before', coalesce(v_before, '{}'::jsonb), 'after', jsonb_build_object('allCategories', p_all_categories, 'categoryIds', to_jsonb(p_category_ids)))
  );

  return public.call_center_roles_list();
end;
$$;

revoke all on function public.call_center_customer_categories_list() from public, anon, authenticated;
revoke all on function public.call_center_roles_set_agent_scope(text, boolean, text[], uuid) from public, anon, authenticated;
revoke all on function public.call_center_roles_set_customer_category_scope(text, boolean, uuid[], uuid) from public, anon, authenticated;

grant execute on function public.call_center_customer_categories_list() to service_role;
grant execute on function public.call_center_roles_set_agent_scope(text, boolean, text[], uuid) to service_role;
grant execute on function public.call_center_roles_set_customer_category_scope(text, boolean, uuid[], uuid) to service_role;
